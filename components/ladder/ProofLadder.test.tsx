// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { ProofLadder, ProofLadderView, VERIFIED_LINE } from "./ProofLadder";
import { LadderStep } from "./LadderStep";
import type { ProofLadder as Data, SkillLadder } from "./model";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const docker: SkillLadder = {
  skillId: "docker", skillName: "Docker", level: 2, status: "proven", demand: 0.41,
  rungs: [
    { rung: 1, label: "Tried it", status: "done", evidence: { id: "ev1", source: "micro-challenge", url: "/challenge?skill=docker", quote: "Passed the 20-minute Docker micro-challenge", createdAt: "2026-11-07T15:00:00.000Z" } },
    { rung: 2, label: "Built it", status: "done", evidence: { id: "ev2", source: "keystone-pod", url: "https://github.com/keystone-demo/pod-vision-demo/pull/8", quote: "Merged 'Containerise the captioning API with Docker'", createdAt: "2026-11-07T16:00:00.000Z" } },
    { rung: 3, label: "Can teach it", status: "open" },
  ],
};
const sql: SkillLadder = {
  skillId: "sql", skillName: "SQL", level: 3,
  rungs: [
    { rung: 1, label: "Tried it", status: "done", impliedBy: 3 },
    { rung: 2, label: "Built it", status: "done", impliedBy: 3 },
    { rung: 3, label: "Can teach it", status: "done", evidence: { id: "ev3", source: "code-review", url: "https://github.com/x/y/pull/2", quote: "Reviewed Tom's SQL PR", createdAt: "2026-11-06T10:00:00.000Z" } },
  ],
};
const data: Data = { userId: "aisha", generatedAt: "2026-11-07T16:00:00.000Z", skills: [sql, docker] };

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe("ProofLadderView", () => {
  it("compact + skillId renders one ●●○ strip whose rungs say what proved them", () => {
    render(<ProofLadderView data={data} skillId="docker" compact />);
    const strip = screen.getByRole("list", { name: "Docker: Tried it and Built it done, Can teach it open." });
    const rungs = within(strip).getAllByRole("button");
    expect(rungs).toHaveLength(3);
    expect(rungs[0]).toHaveAccessibleName(/Tried it: Passed the 20-minute Docker micro-challenge \(7 Nov 2026\)/);
    expect(rungs[2]).toHaveAccessibleName(/Can teach it: not yet/);
    expect(screen.queryByText(VERIFIED_LINE)).not.toBeInTheDocument();
  });

  it("full + skillId renders the vertical ladder with evidence links and the verified line", () => {
    render(<ProofLadderView data={data} skillId="docker" />);
    const ladder = screen.getByRole("list", { name: "Docker proof ladder" });
    expect(within(ladder).getByText("Tried it")).toBeInTheDocument();
    expect(within(ladder).getByText("Can teach it")).toBeInTheDocument();
    expect(within(ladder).getByText("Merged 'Containerise the captioning API with Docker'")).toBeInTheDocument();
    const prLink = within(ladder).getByRole("link", { name: /View proof: Docker, Pod PR/ });
    expect(prLink).toHaveAttribute("href", "https://github.com/keystone-demo/pod-vision-demo/pull/8");
    expect(prLink).toHaveAttribute("target", "_blank");
    expect(screen.getByText(VERIFIED_LINE)).toBeInTheDocument();
  });

  it("marks rungs implied by a higher proof as counted, not proven", () => {
    render(<ProofLadderView data={data} skillId="sql" />);
    expect(screen.getAllByText("Counted")).toHaveLength(2);
    expect(screen.getAllByText("Counted because Can teach it is proven.")).toHaveLength(2);
  });

  it("lists every skill in full mode, and shows an empty state with a challenge link when there are none", () => {
    const { unmount } = render(<ProofLadderView data={data} />);
    expect(screen.getByRole("list", { name: "Skills on your proof ladder" }).children).toHaveLength(2);
    unmount();
    render(<ProofLadderView data={{ ...data, skills: [] }} />);
    expect(screen.getByRole("link", { name: "Try a micro-challenge" })).toHaveAttribute("href", "/challenge");
  });
});

describe("ProofLadder (fetching)", () => {
  it("loads the ladder for a skill from the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { ...data, skills: [docker] } })));
    wrap(<ProofLadder userId="aisha" skillId="docker" />);
    expect(screen.getByRole("status", { name: "Loading the proof ladder" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Docker proof ladder" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/proof-ladder/aisha?skillId=docker");
  });

  it("shows Retry and Use demo data on error, and the demo ladder after choosing it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "boom" } }), { status: 500 }));
    wrap(<ProofLadder userId="aisha" />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use demo data" }));
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
  });
});

describe("LadderStep", () => {
  it("announces the climb and shows the rung label", () => {
    render(<LadderStep skillName="Docker" level={2} from={1} />);
    expect(screen.getByText(/Docker climbed to rung 2 of 3, Built it\./)).toBeInTheDocument();
    expect(screen.getByTestId("ladder-step")).toHaveTextContent("Rung 2 · Built it");
  });
});
