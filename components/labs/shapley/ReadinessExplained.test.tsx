// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import evidenceFixture from "@/data/fixtures/evidence.aisha.json";
import programmeFixture from "@/data/fixtures/programme.uom-bsc-cs.json";
import roadmapFixture from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import { explainReadiness } from "@/lib/labs/shapley/explain";
import type { BridgeMap, EvidenceItem, Programme, Roadmap } from "@/lib/types";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { fmt1, signed } from "./format";
import { ReadinessExplained } from "./ReadinessExplained";

const X = explainReadiness({
  map: mapFixture as BridgeMap, evidence: evidenceFixture as EvidenceItem[], programme: programmeFixture as Programme, roadmap: roadmapFixture as Roadmap,
  startedAt: "2026-09-21", challenges: [{ skillId: "docker", minutes: 20, title: "Dockerise a tiny API" }], hoursPerWeek: 8,
  firstName: "Aisha", roleName: "ML engineer", now: new Date("2026-11-07T12:00:00Z"), skillName: (s) => s,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const calls: { url: string; body?: unknown }[] = [];
let mode: "ok" | "404" | "500" = "ok";
let committed: { actionId: string; noteText: string; committedAt: string } | null = null;

beforeEach(() => {
  calls.length = 0;
  mode = "ok";
  committed = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === "/api/labs/shapley/commit") {
      return json({ ok: true, data: { noteText: "Next proof: Docker. Merge a PR (+5.4 readiness points for about 8.0 h)", runId: "run_c", action: X.next.best } });
    }
    if (mode === "404") return json({ ok: false, error: { code: "not_found", message: "No Bridge Map yet" } }, 404);
    if (mode === "500") return json({ ok: false, error: { code: "internal", message: "boom" } }, 500);
    return json({ ok: true, data: { explanation: X, runId: "run_x", committed, demo: true } });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ReadinessExplained /></QueryClientProvider>);
};

describe("ReadinessExplained", () => {
  it("shows a content-shaped skeleton, then the waterfall that adds up to 38%", async () => {
    renderPage();
    expect(screen.getByRole("status", { name: /working out/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Where your 38% comes from" })).toBeInTheDocument();
    expect(screen.getByText(/^38% = Python on GitHub \+6\.5, COMP2xxx2 Machine Learning \+6\.2/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Readiness split by source" });
    expect(within(list).getByText("Readiness today")).toBeInTheDocument();
    expect(within(list).getByText("38.0")).toBeInTheDocument();
    expect(screen.getByText(/splits into 24\.2 points from 16 degree modules, 9\.9 points from 4 GitHub items/)).toBeInTheDocument();
  });

  it("closes the gap to the stored score with one muted row that says it isn't a source", async () => {
    const user = userEvent.setup();
    renderPage();
    const list = await screen.findByRole("list", { name: "Readiness split by source" });
    expect(within(list).queryByText(/beyond the mapped skills/i)).not.toBeInTheDocument();
    const row = within(list).getByRole("button", { name: /Stored score adjustment/ });
    expect(row).toHaveTextContent("Not a source: seeded or rounded on your map");
    expect(X.readiness.adjustmentPoints).toBeCloseTo(2.85, 2);
    expect(within(row.closest("li")!).getByText(signed(X.readiness.adjustmentPoints))).toBeInTheDocument();
    await user.click(row);
    expect(within(list).getByText(/stores 38\.00 points, and the readiness formula over its 32 skills gives 35\.15/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`The last ${fmt1(X.readiness.adjustmentPoints).replace(".", "\\.")} points are your stored score's adjustment, not a source\\.`))).toBeInTheDocument();
  });

  it("shows the next proof the student already chose after a reload", async () => {
    committed = { actionId: "rm:docker", noteText: "Next proof: Docker. Merge a PR (+5.4 readiness points for about 8.0 h)", committedAt: "2026-11-07T10:00:00Z" };
    renderPage();
    expect(await screen.findByText(/Saved as a goal your Coach plans around/)).toHaveTextContent("Next proof: Docker.");
  });

  it("explains a source on demand, and switches to the per-skill split", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Python on GitHub/ }));
    expect(screen.getByText(/readiness would drop/)).toHaveTextContent("4.9");
    await user.click(screen.getByRole("button", { name: /By skill/ }));
    expect(screen.getByRole("button", { name: /By skill/ })).toHaveAttribute("aria-pressed", "true");
    const skills = screen.getByRole("list", { name: "Readiness split by skill" });
    expect(within(skills).getByText("Docker")).toBeInTheDocument();
  });

  it("the student's click is the checkpoint: it posts approved: true and shows the saved Coach goal", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Your best next proof" })).toBeInTheDocument();
    expect(screen.getByText(/readiness points for 8 hours of roadmap work/)).toHaveTextContent("0.7 points an hour, the most of any step on your plan");
    await user.click(screen.getByRole("button", { name: "Make this my next proof" }));
    expect(calls.find((c) => c.url === "/api/labs/shapley/commit")?.body).toEqual({ actionId: "rm:docker", approved: true });
    expect(await screen.findByText(/Saved as a goal your Coach plans around/)).toBeInTheDocument();
  });

  it("shows an empty state when there's no Bridge Map", async () => {
    mode = "404";
    renderPage();
    expect(await screen.findByText("No Bridge Map to explain yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Build your Bridge Map" })).toHaveAttribute("href", "/onboard");
  });

  it("shows an error with Retry, and Use demo data runs the same explainer in the browser", async () => {
    mode = "500";
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("We couldn't work out your readiness split");
    await user.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(await screen.findByRole("heading", { name: "Where your 38% comes from" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make this my next proof" })).toBeDisabled();
  });
});
