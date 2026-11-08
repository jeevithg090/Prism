// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Passport, SkillLadder } from "@/components/ladder/model";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/momentum/BuildLog", () => ({ BuildLog: ({ userId }: { userId: string }) => <div>Build Log for {userId}</div> }));
vi.mock("@/components/momentum/MomentumWidget", () => ({ MomentumWidget: () => <div>Momentum</div> }));

import { PassportView } from "./PassportView";
import { VERIFIED_LINE } from "@/components/ladder/ProofLadder";

const open = (rung: 1 | 2 | 3) => ({ rung, label: (["", "Tried it", "Built it", "Can teach it"] as const)[rung], status: "open" as const });
const docker: SkillLadder = {
  skillId: "docker", skillName: "Docker", level: 2,
  rungs: [
    { rung: 1, label: "Tried it", status: "done", evidence: { id: "e1", source: "micro-challenge", url: "/challenge?skill=docker", quote: "Passed the 20-minute Docker micro-challenge", createdAt: "2026-11-07T10:00:00.000Z" } },
    { rung: 2, label: "Built it", status: "done", evidence: { id: "e2", source: "keystone-pod", url: "https://github.com/keystone-demo/pod-vision-demo/pull/8", quote: "Merged 'Containerise the captioning API with Docker'", createdAt: "2026-11-07T11:00:00.000Z" } },
    open(3),
  ],
};
const python: SkillLadder = {
  skillId: "python", skillName: "Python", level: 1,
  rungs: [{ rung: 1, label: "Tried it", status: "done", evidence: { id: "e3", source: "github", url: "/map", quote: "Found in your GitHub repos", createdAt: "2026-11-07T09:00:00.000Z" } }, open(2), open(3)],
};
const passport: Passport = {
  userId: "aisha", name: "Aisha Rahman", programme: "BSc Computer Science, University of Manchester", year: 1, badges: ["new-to-uni", "international"],
  roleName: "ML engineer", readinessNow: 0.43, readinessProjected: 0.84, isPublic: false, isOwner: true, isDemo: true, skills: [docker, python],
};

let response: { status: number; body: unknown };
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  response = { status: 200, body: { ok: true, data: passport } };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "PUT") return new Response(JSON.stringify({ ok: true, data: { isPublic: JSON.parse(String(init.body)).public } }));
    return new Response(JSON.stringify(response.body), { status: response.status });
  });
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  writeText.mockClear();
  toast.success.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renderView = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PassportView userId="aisha" /></QueryClientProvider>,
);

describe("PassportView", () => {
  it("shows the header, the verified stamp and skills grouped by their highest rung, with evidence links", async () => {
    renderView();
    expect(await screen.findByRole("heading", { name: "Aisha Rahman" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Skill Passport" })).toBeInTheDocument();
    expect(screen.getAllByText(VERIFIED_LINE).length).toBeGreaterThan(0);
    expect(screen.getByText("New to UoM")).toBeInTheDocument();
    const built = screen.getByRole("region", { name: /Built it/ });
    expect(within(built).getByText("Docker")).toBeInTheDocument();
    expect(within(built).getByRole("link", { name: /View proof: Docker, Pod PR/ })).toHaveAttribute("href", "https://github.com/keystone-demo/pod-vision-demo/pull/8");
    const tried = screen.getByRole("region", { name: /Tried it/ });
    expect(within(tried).getByText("Python")).toBeInTheDocument();
    expect(within(tried).queryByText("Docker")).not.toBeInTheDocument();
    expect(screen.getByText("Build Log for aisha")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });

  it("Copy link writes the passport URL to the clipboard", async () => {
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: /Copy link/ }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/profile/aisha`);
    expect(toast.success).toHaveBeenCalledWith("Link copied", expect.objectContaining({ description: expect.stringContaining("private") }));
  });

  it("is private by default; the owner's switch makes it public", async () => {
    renderView();
    const sw = await screen.findByRole("switch", { name: "Public passport" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(await screen.findByRole("switch", { name: "Public passport", checked: true })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Your passport is public", expect.anything());
  });

  it("visitors to a private passport see why, with no data", async () => {
    response = { status: 403, body: { ok: false, error: { code: "private", message: "Aisha hasn't made their passport public." } } };
    renderView();
    expect(await screen.findByRole("heading", { name: "This passport is private" })).toBeInTheDocument();
    expect(screen.queryByText("Docker")).not.toBeInTheDocument();
  });

  it("a failure offers Retry and Use demo data", async () => {
    response = { status: 500, body: { ok: false, error: { code: "internal", message: "down" } } };
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Use demo data" }));
    expect(await screen.findByRole("heading", { name: "Aisha Rahman" })).toBeInTheDocument();
  });
});
