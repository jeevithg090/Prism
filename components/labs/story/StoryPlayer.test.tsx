// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Story, StoryBeat } from "@/lib/labs/story/schema";
import { StoryPlayer } from "./StoryPlayer";

const beat = (i: number, over: Partial<StoryBeat> = {}): StoryBeat => ({
  id: `b${i}`, index: i, when: `Week ${i}`, title: `Beat title ${i}`, agent: i ? "matchmaker" : "skillmap", with: ["market"],
  narration: `Narration ${i}: 38% ready today.`, why: `Why ${i}.`,
  checkpoint: i ? { kind: "peer-approval", label: "A podmate approves", note: "Your pod reviewer approves and merges, never the AI" } : null,
  handoff: { toAgent: "roadmap", carries: "Docker gap, 41% of ads" },
  screen: { href: "/map", label: "Bridge Map" }, api: "GET /api/graph/aisha",
  verify: { path: "/api/graph/aisha?roleId=ml-engineer", pick: "readinessNow", expect: 0.38, label: "Readiness today", format: "pct" },
  facts: [{ key: "now", label: "Ready today", value: 0.38, display: "38%", source: "GET /api/graph/aisha" }],
  visual: { kind: "flywheel", trajectories: 40, openToChat: 24, loop: ["Plan", "Build"] },
  grounding: { checked: ["38%"], removed: [] }, seconds: 8, ...over,
});

const story = (beats: StoryBeat[]): Story => ({
  runId: "run_ui", subject: { userId: "aisha", name: "Aisha Rahman", roleId: "ml-engineer", roleName: "ML engineer", programmeId: "uom-bsc-cs" },
  mode: "demo", beats, skipped: [], grounding: { checked: 12, removed: 0 }, agents: ["skillmap", "market", "roadmap", "matchmaker"],
  totalSeconds: 16, generatedAt: "2026-11-07T00:00:00.000Z",
});

function mockFetch(storyBody: unknown, graphReadiness = 0.38) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/labs/story") return new Response(JSON.stringify(storyBody), { headers: { "content-type": "application/json" } });
    if (url.startsWith("/api/graph/")) return new Response(JSON.stringify({ ok: true, data: { readinessNow: graphReadiness } }));
    return new Response(JSON.stringify({ ok: false, error: { code: "x", message: "nope" } }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("StoryPlayer", () => {
  it("shows the first beat, its receipt, the caption and a live check that matches the API", async () => {
    const f = mockFetch({ ok: true, data: story([beat(0), beat(1)]) });
    render(<StoryPlayer />);
    expect(await screen.findByRole("heading", { level: 2, name: "Beat title 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play Aisha's story/ })).toBeInTheDocument();
    expect(screen.getByText("Narration 0: 38% ready today.")).toBeInTheDocument();
    expect(screen.getByText(/No person needs to approve this step/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/It matches the narration/)).toBeInTheDocument());
    expect(f).toHaveBeenCalledWith("/api/graph/aisha?roleId=ml-engineer", expect.anything());
  });

  it("flags a number that changed since the script was built", async () => {
    mockFetch({ ok: true, data: story([beat(0)]) }, 0.43);
    render(<StoryPlayer />);
    await waitFor(() => expect(screen.getByText(/changed since the script was built/)).toBeInTheDocument());
    expect(screen.getByText("43%")).toBeInTheDocument();
  });

  it("moves with the keyboard and shows the human checkpoint on beat 2", async () => {
    mockFetch({ ok: true, data: story([beat(0), beat(1)]) });
    render(<StoryPlayer />);
    await screen.findByRole("heading", { level: 2, name: "Beat title 0" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByRole("heading", { level: 2, name: "Beat title 1" })).toBeInTheDocument();
    expect(screen.getByText(/Your pod reviewer approves and merges, never the AI/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beat 2, Week 1: Beat title 1/ })).toHaveAttribute("aria-current", "step");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByRole("heading", { level: 2, name: "Beat title 0" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByRole("button", { name: /Captions/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("autoplays, holds at a human checkpoint until a person presses Enter, then finishes", async () => {
    mockFetch({ ok: true, data: story([beat(0), beat(1), beat(2, { checkpoint: null })]) });
    render(<StoryPlayer />);
    await screen.findByRole("heading", { level: 2, name: "Beat title 0" });
    vi.useFakeTimers();
    // Real browsers render between clock ticks; give React the same chance.
    const play = async (ms: number) => { for (let t = 0; t < ms; t += 100) await act(async () => { vi.advanceTimersByTime(100); }); };
    try {
      fireEvent.keyDown(window, { key: " " });
      await play(8_300);
      expect(screen.getByRole("heading", { level: 2, name: "Beat title 1" })).toBeInTheDocument();
      await play(8_300);
      // Beat 2 has a checkpoint: the story waits, however long it takes.
      expect(screen.getByText(/The story is waiting for a person/)).toBeInTheDocument();
      await play(30_000);
      expect(screen.getByRole("heading", { level: 2, name: "Beat title 1" })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Enter" });
      expect(screen.getByRole("heading", { level: 2, name: "Beat title 2" })).toBeInTheDocument();
      await play(8_300);
      expect(screen.getByRole("button", { name: /Play again/ })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the Coach memory write-back on the last beat", async () => {
    mockFetch({ ok: true, data: story([beat(0)]) });
    render(<StoryPlayer />);
    expect(await screen.findByRole("button", { name: /Remember that I've watched this/ })).toBeInTheDocument();
  });

  it("has an empty state and an error state with Retry and Use demo data", async () => {
    mockFetch({ ok: true, data: story([]) });
    render(<StoryPlayer />);
    expect(await screen.findByText("There's no story to tell yet")).toBeInTheDocument();
    cleanup();
    mockFetch({ ok: false, error: { code: "internal", message: "Something went wrong on our side." } });
    render(<StoryPlayer />);
    expect(await screen.findByText("The story didn't load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use demo data" })).toBeInTheDocument();
  });
});
