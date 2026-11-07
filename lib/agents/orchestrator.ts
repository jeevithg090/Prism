import "server-only";
import { emit, newRunId } from "@/lib/agents/events";
import type { AgentEvent } from "@/lib/types";
import sample from "@/data/fixtures/agent-events.sample.json";

const DELAYS = [200, 350, 250, 300, 220, 400, 260, 330];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** DEMO replay: re-emits the sample run under a fresh runId, without awaiting. */
export function replayDemoRun(): { runId: string } {
  const runId = newRunId();
  void (async () => {
    const events = sample as AgentEvent[];
    for (let i = 0; i < events.length; i++) {
      await sleep(DELAYS[i % DELAYS.length]);
      const { ts: _ts, runId: _old, ...rest } = events[i];
      emit({ ...rest, runId });
    }
  })();
  return { runId };
}

// TODO(PR7): real pipeline. Until then every run replays the demo events.
export async function runOnboarding(_userId: string): Promise<{ runId: string }> {
  return replayDemoRun();
}
