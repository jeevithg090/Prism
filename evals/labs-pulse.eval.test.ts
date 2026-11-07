// Eval · Live Lab Pulse (AGENT-PRINCIPLES 4, 9, 10, 13): tool quality, anonymity red-team, integrity (no answer
// leaks in any drafted explainer), determinism of the simulated lab, and the human checkpoint in the run ledger.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async () => { throw new Error("no_key"); }),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));
const { loadCohort } = vi.hoisted(() => ({ loadCohort: vi.fn() }));
vi.mock("@/lib/agents/cohort", async (orig) => {
  const real = await orig<typeof import("@/lib/agents/cohort")>();
  loadCohort.mockImplementation(real.loadCohort);
  return { ...real, loadCohort };
});

import { isSafeFeedback, loadChallengeFixtures } from "@/lib/agents/challenges";
import { AGENT_RUNS, type AgentRunEntry } from "@/lib/agents/harness";
import { tool } from "@/lib/agents/tools/extra/pulse";
import { feature } from "@/lib/features/items/pulse";
import { decideIntervention, getPulseSnapshot, startPulseSession } from "@/lib/labs/pulse/agent";
import { loadPulsePacks } from "@/lib/labs/pulse/simulate";
import { testStore } from "@/tests/seededStore";

const VERBS = new Set(["get", "find", "explain", "start", "review", "record", "ask"]);

beforeAll(() => {
  process.env.DEMO_MODE = "true";
  testStore().reset();
});
afterAll(() => {
  delete process.env.DEMO_MODE;
});

describe("eval: Live Lab Pulse", () => {
  it("registers an ACI-quality read tool and a Labs feature card", async () => {
    expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    expect(VERBS.has(tool.name.split("_")[0])).toBe(true);
    expect(tool.description.length).toBeGreaterThanOrEqual(60);
    expect(tool.description.length).toBeLessThanOrEqual(400);
    expect(tool.description).toMatch(/\breturns?\b/i);
    expect(tool.title.length).toBeLessThanOrEqual(40);
    expect([tool.effect, tool.requiresApproval, tool.agent]).toEqual(["read", false, "techlead"]);
    expect(feature).toMatchObject({ key: "pulse", href: "/labs/pulse", pillar: "teaching", agent: "techlead" });

    const out = await tool.run(tool.input.parse({}), { userId: "aisha", runId: "run_eval" });
    const summary = tool.summarize(out);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(400);
    expect(summary).toMatch(/Docker lab, minute 10 of 20/);
    expect(summary).not.toMatch(/Priya|Aisha|aisha|priya/);
  });

  it("red-team: a cohort of 9 gets the group size and nothing else", async () => {
    const actual = (await vi.importActual<typeof import("@/lib/agents/cohort")>("@/lib/agents/cohort")).loadCohort;
    loadCohort.mockImplementation(async (id: string) => {
      const r = await actual(id);
      return { ...r, profiles: r.profiles.slice(0, 9) };
    });
    try {
      const { session, snapshot } = await startPulseSession({});
      expect(snapshot).toMatchObject({ cohortSize: 9, suppressed: true, criteria: [], timeOnTask: [], timeline: [], hotspot: null, suggestion: null, passed: 0 });
      const tick = await getPulseSnapshot(session.id, 12);
      expect(tick).toMatchObject({ suppressed: true, criteria: [], suggestion: null, effects: [] });
      const run = (await testStore().list<AgentRunEntry>(AGENT_RUNS)).find((e) => e.runId === session.runId);
      expect(run?.guardrails).toContainEqual(expect.objectContaining({ name: "anonymityThreshold", action: "modified" }));
    } finally {
      loadCohort.mockImplementation(actual);
    }
  });

  it("integrity: no drafted explainer, for any criterion of any lab, names part of the answer", () => {
    let checked = 0;
    for (const p of loadPulsePacks().packs) {
      const ch = loadChallengeFixtures().find((c) => c.id === p.challengeId)!;
      for (const points of Object.values(p.explainers)) {
        for (const pt of points) {
          expect(isSafeFeedback(pt, ch), `${ch.id}: ${pt}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it("determinism: the same session replays the same board at every minute", async () => {
    const { session } = await startPulseSession({});
    const a = await getPulseSnapshot(session.id, 9);
    const b = await getPulseSnapshot(session.id, 9);
    expect(b).toEqual(a);
  });

  it("human checkpoint: every decision is a lecturer-decision entry in the run ledger", async () => {
    const { session } = await startPulseSession({});
    const snap = await getPulseSnapshot(session.id, 5.5);
    const s = snap.suggestion!;
    const r = await decideIntervention({ sessionId: session.id, minute: 5.5, criterionId: s.criterionId!, kind: "explain", decision: "run" });
    const entry = (await testStore().list<AgentRunEntry>(AGENT_RUNS)).find((e) => e.runId === r.runId);
    expect(entry?.checkpoint?.kind).toBe("lecturer-decision");
    expect(entry?.guardrails.every((g) => g.action !== "blocked")).toBe(true);
    expect(JSON.stringify(entry)).not.toMatch(/Priya|aisha/);
  });
});
