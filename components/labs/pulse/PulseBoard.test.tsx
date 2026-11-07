// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computePulse, suppressSnapshot, type CriterionMeta, type PulseAttempt } from "@/lib/labs/pulse/aggregate";
import type { PulseSession, PulseSnapshot } from "@/lib/labs/pulse/model";

const { startSession, fetchSnapshot, decide, toast } = vi.hoisted(() => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { startSession: vi.fn(), fetchSnapshot: vi.fn(), decide: vi.fn(), toast: t };
});
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), startSession, fetchSnapshot, decide }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { nextPinned, PulseBoard } from "./PulseBoard";
import { timeSummary } from "./TimeOnTask";

const metas: CriterionMeta[] = [
  { id: "deps-layer", title: "Dependencies install in their own cached layer", kind: "rubric", concept: "layer caching", description: "requirements first", hint: "Which layers rebuild?" },
  { id: "slim-base", title: "Starts from a smaller base image", kind: "rubric", concept: "base image size", description: "smaller", hint: "What's inside?" },
  { id: "workdir", title: "Sets a working directory", kind: "check", concept: "the working directory", description: "workdir", hint: "Where?" },
];
const attempts: PulseAttempt[] = Array.from({ length: 12 }, (_, s) => [1, 2.5, 4].map((minute) => ({ student: s, minute, met: s < 2 ? ["deps-layer", "slim-base", "workdir"] : ["slim-base", "workdir"], passed: s < 2 }))).flat();
const snapshot = (minute = 5.5): PulseSnapshot => computePulse({
  sessionId: "pulse_t", source: "simulated", challenge: { id: "ch_docker_01", skillId: "docker", skillName: "Docker", title: "Make the image rebuild in seconds", labMinutes: 20 },
  criteria: metas, explainers: { "deps-layer": ["Each instruction is a layer."] }, attempts, cohortSize: 13, minute, interventions: [],
  context: { gapRank: 1, demandPct: 41, roleName: "ML engineer" }, receipt: "Simulated lab: 13 seeded students.",
});
const session: PulseSession = { id: "pulse_t", challengeId: "ch_docker_01", programmeId: "uom-bsc-cs", source: "simulated", startedAt: "", labMinutes: 20, runId: "run_t", interventions: [], announced: [] };

beforeEach(() => {
  vi.clearAllMocks();
  fetchSnapshot.mockImplementation(async (_id: string, m?: number) => snapshot(m ?? 5.5));
});
afterEach(cleanup);

describe("PulseBoard", () => {
  it("starts a lab, shows the sticking point, and opens the explainer when the lecturer runs it", async () => {
    startSession.mockResolvedValue({ session, snapshot: snapshot(), runId: "run_t" });
    decide.mockResolvedValue({
      runId: "run_d", usedFallback: false,
      intervention: { id: "iv", minute: 5.5, criterionId: "deps-layer", concept: "layer caching", kind: "explain", decision: "run", decidedAt: "", metBefore: 2, stuckBefore: 10 },
      explainer: { title: "Layer caching in 3 minutes", minutes: 3, points: ["Each instruction is a layer."], askTheRoom: "Which layers rebuild?", avoid: "Don't write the fixed file." },
    });
    render(<PulseBoard demo />);
    await userEvent.click(screen.getByRole("button", { name: /start the lab/i }));
    expect(await screen.findByText("10 of 13 students (77%) are stuck on layer caching")).toBeInTheDocument();
    expect(screen.getByText(/Why this lab: Docker is gap #1/)).toBeInTheDocument();
    expect(screen.getByText("You decide")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /run the 3-minute explainer/i }));
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "pulse_t", criterionId: "deps-layer", kind: "explain", decision: "run" }));
    expect(await screen.findByRole("heading", { name: "Layer caching in 3 minutes" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /done, back to the board/i }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenLastCalledWith("pulse_t", 8.5));
  });

  it("shows an error with Retry and demo data when the board can't start", async () => {
    startSession.mockRejectedValueOnce(new Error("Lab Pulse is down."));
    render(<PulseBoard demo={false} />);
    await userEvent.click(screen.getByRole("button", { name: /start the lab/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The board didn't start");
    startSession.mockResolvedValueOnce({ session, snapshot: snapshot(), runId: "run_t" });
    await userEvent.click(screen.getByRole("button", { name: /use demo data/i }));
    expect(startSession).toHaveBeenLastCalledWith({ challengeId: "ch_docker_01", source: "simulated" });
  });

  it("hides everything below 10 students", async () => {
    startSession.mockResolvedValue({ session: { ...session, source: "live" }, snapshot: suppressSnapshot({ ...snapshot(), source: "live", cohortSize: 4 }), runId: "run_t" });
    render(<PulseBoard demo={false} />);
    await userEvent.click(screen.getByRole("button", { name: /start the lab/i }));
    expect(await screen.findByText("Waiting for 10 students")).toBeInTheDocument();
    expect(screen.queryByText(/stuck on/)).not.toBeInTheDocument();
  });

  it("pins an actionable suggestion for 2 minutes so it never changes under the cursor", () => {
    const first = nextPinned(null, snapshot(5.5));
    expect(first?.s.kind).toBe("explain");
    const moved = { ...snapshot(6.5), suggestion: { ...snapshot(6.5).suggestion!, kind: "peer" as const, criterionId: "slim-base" } };
    expect(nextPinned(first, moved)).toBe(first);
    expect(nextPinned(first, { ...moved, minute: 7.5 })?.s.criterionId).toBe("slim-base");
    expect(nextPinned(first, { ...moved, suggestion: { ...moved.suggestion, kind: "watch" as const } })).toBeNull();
  });

  it("summarises time on task in a sentence", () => {
    expect(timeSummary(snapshot().timeOnTask, 13)).toBe("2 of 13 have finished every criterion; 10 haven't moved forward for 4 minutes or more.");
    expect(timeSummary(snapshot(2).timeOnTask, 13)).toBe("2 of 13 have finished every criterion; nobody has gone 4 minutes without a step forward.");
  });
});
