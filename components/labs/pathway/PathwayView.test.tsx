// @vitest-environment jsdom
// The page: all four states, selecting a listing, the graph's text alternative, and the approval dialog.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mapJson from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import roadmapJson from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import programmeJson from "@/data/fixtures/programme.uom-bsc-cs.json";
import profileJson from "@/data/fixtures/profile.aisha.json";
import oppJson from "@/data/fixtures/labs/pathway.opportunities.json";
import effortJson from "@/data/fixtures/labs/pathway.effort.json";
import { CURATED_PREREQS } from "@/lib/graph/build";
import { skillMeta } from "@/lib/graph/data";
import { createSolver, keystoneSkill, rankPaths } from "@/lib/labs/pathway/solver";
import { EffortFileZ, OpportunityFileZ, type PathwayResult } from "@/lib/labs/pathway/types";
import type { BridgeMap, Profile, Programme, Roadmap } from "@/lib/types";
import { layoutPath, PER_ROW } from "./layout";
import { PathwayView } from "./PathwayView";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const NOW = new Date("2026-11-07T09:00:00Z");
const solver = createSolver({
  map: mapJson as unknown as BridgeMap, profile: profileJson as unknown as Profile, programme: programmeJson as unknown as Programme,
  roadmap: roadmapJson as unknown as Roadmap, effort: EffortFileZ.parse(effortJson), meta: skillMeta, curated: CURATED_PREREQS, now: NOW,
});
const paths = rankPaths(OpportunityFileZ.parse(oppJson).opportunities.map((o) => solver.solve(o)));
const RESULT: PathwayResult = {
  userId: "aisha", firstName: "Aisha", roleId: "ml-engineer", asOf: NOW.toISOString(), hoursPerWeek: 8, source: "demo",
  paths, keystone: keystoneSkill(paths), closed: 0, droppedUnsafe: 0, combosSearched: paths.reduce((a, p) => a + p.combosSearched, 0), runId: "run_t",
};
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ ok: status < 400, ...(status < 400 ? { data } : { error: data }) }), { status, headers: { "content-type": "application/json" } });

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  return render(<QueryClientProvider client={qc}><PathwayView demo /></QueryClientProvider>);
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PathwayView", () => {
  it("shows a skeleton, then the ranked listings with the closest path selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok(RESULT)));
    renderView();
    expect(screen.getByText("Loading your paths")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Listings ranked by distance" });
    expect(within(list).getAllByRole("button")).toHaveLength(7);
    const selected = within(list).getByRole("button", { pressed: true });
    // The closest listing in Aisha's own target role (ML engineer) is selected first.
    expect(selected).toHaveTextContent("ML Engineering Summer Intern");
    expect(screen.getByRole("heading", { level: 2, name: "ML Engineering Summer Intern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to roadmap" })).toBeInTheDocument();
  });

  it("switching listing updates the path, its graph summary and the paths not taken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok(RESULT)));
    renderView();
    const list = await screen.findByRole("list", { name: "Listings ranked by distance" });
    await userEvent.click(within(list).getByText("Software Engineering Summer Intern"));
    expect(screen.getByRole("heading", { level: 2, name: "Software Engineering Summer Intern" })).toBeInTheDocument();
    await userEvent.click(within(list).getByText("ML Engineering Summer Intern"));
    expect(screen.getByText(/^You're 2 skills and 3 weeks from applying to ML Engineering Summer Intern at Quayline Health/)).toBeInTheDocument();
    // The figcaption (and the SVG's <desc>) state the path in words: the graph's text summary.
    expect(screen.getAllByText(/^Your path: Docker \(8 h\), then TensorFlow \(14 h\)/).some((el) => el.tagName === "FIGCAPTION")).toBe(true);
    expect(screen.getByText(/PyTorch needs .*deep learning first/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Shortest path to ML Engineering Summer Intern/ })).toBeInTheDocument();
  });

  it("previews the change and only sends approved: true from the dialog's button", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/labs/pathway/roadmap")) {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        const preview = { opportunityId: body.opportunityId, title: "t", employer: "e", currentVersion: 1, nextVersion: 2, degreeNotes: [], laterNotes: [],
          changes: [{ skillId: "rest-apis", name: "REST APIs", kind: "added", toWeek: 1, hours: 10 }],
          weeks: [{ week: 1, startDate: "2026-11-09", skillId: "rest-apis", name: "REST APIs", changed: true }] };
        return ok(body.approved ? { status: "added", preview, version: 2, rememberedGoal: false, runId: "run_add" } : { status: "needs_approval", preview });
      }
      return ok(RESULT);
    }));
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Add to roadmap" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("REST APIs is added in week 1 (10 h)")).toBeInTheDocument();
    expect(bodies).toEqual([expect.objectContaining({ approved: false })]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve and add" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ approved: true, rememberGoal: false, demo: true });
  });

  it("shows the error state with Retry and Use demo data, and the empty state for a missing map", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ code: "internal", message: "boom" }, 500)));
    renderView();
    expect(await screen.findByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use demo data" })).toBeInTheDocument();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => ok({ code: "not_found", message: "No Bridge Map yet." }, 404)));
    renderView();
    expect(await screen.findByText("Your Bridge Map comes first")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your degree" })).toHaveAttribute("href", "/onboard");
  });
});

describe("layoutPath", () => {
  it("puts prerequisites above the steps that need them and the goal last, within a phone-friendly width", () => {
    const p = paths.find((x) => x.opportunity.id === "opp-brightmoor-analyst")!;
    const l = layoutPath(p);
    const y = (id: string) => l.nodes.find((n) => n.id === id)!.y;
    expect(y("numpy")).toBeLessThan(y("pandas"));
    expect(y("pandas")).toBeLessThan(y("data-visualisation"));
    expect(y("databases")).toBeLessThan(y("sql"));
    expect(Math.max(...l.nodes.map((n) => n.y))).toBe(y("goal"));
    const rows = new Map<number, number>();
    for (const n of l.nodes) rows.set(n.y, (rows.get(n.y) ?? 0) + 1);
    expect(Math.max(...rows.values())).toBeLessThanOrEqual(PER_ROW);
    expect(l.width).toBeLessThanOrEqual(500);
    expect(l.edges.every((e) => e.d.startsWith("M "))).toBe(true);
  });

  it("draws the rejected option as a ghost beside the chosen one", () => {
    const p = paths.find((x) => x.opportunity.id === "opp-quayline-ml-intern")!;
    const l = layoutPath(p);
    expect(l.nodes.find((n) => n.id === "pytorch")?.kind).toBe("ghost");
    expect(l.edges.find((e) => e.from === "pytorch")?.kind).toBe("alternative");
    // Python and Linux are drawn because TensorFlow and Docker build on them.
    expect(l.nodes.filter((n) => n.kind === "have").map((n) => n.id).sort()).toEqual(["linux", "python"]);
    expect(l.alsoHave).toEqual([]);
    const cob = layoutPath(paths.find((x) => x.opportunity.id === "opp-cobaltway-swe")!);
    expect(cob.alsoHave.map((s) => s.skillId).sort()).toEqual(["data-structures", "git", "java"]);
  });
});
