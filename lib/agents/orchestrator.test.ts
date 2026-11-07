import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const emitted = vi.hoisted(() => [] as { runId: string; message: string; agent: string }[]);
vi.mock("@/lib/agents/events", () => ({ emit: (e: never) => emitted.push(e), newRunId: () => "run_new" }));
import { replayDemoRun } from "./orchestrator";
import sample from "@/data/fixtures/agent-events.sample.json";

afterEach(() => vi.useRealTimers());

describe("replayDemoRun", () => {
  it("re-emits every sample event in order under the new runId", async () => {
    vi.useFakeTimers();
    const { runId } = replayDemoRun();
    expect(runId).toBe("run_new");
    await vi.runAllTimersAsync();
    expect(emitted.map((e) => e.message)).toEqual(sample.map((e) => e.message));
    expect(emitted.every((e) => e.runId === "run_new")).toBe(true);
    expect(emitted.at(-1)?.agent).toBe("orchestrator");
  });
});
