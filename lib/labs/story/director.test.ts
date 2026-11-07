import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async (t: string[]) => t.map(() => [1, 0])),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));

import { compileStory, groundedNarration, proofDelta, loadSubject, summarizeStory, BUILDERS, SubjectNotFoundError } from "./director";
import { StoryZ, type Story } from "./schema";
import { numbersIn } from "@/lib/agents/coach/grounding";
import { getRunEvents } from "@/lib/agents/events";
import { listRuns } from "@/lib/agents/harness";
import { recordMergedPR } from "@/lib/agents/proof";
import { testStore } from "@/tests/seededStore";

beforeAll(() => { process.env.DEMO_MODE = "true"; });
afterAll(() => { delete process.env.DEMO_MODE; });
beforeEach(() => testStore().reset());

describe("Story Director (DEMO_MODE, Aisha)", () => {
  it("compiles all ten beats from live Keystone data, in story order", async () => {
    const story = await compileStory({ runId: "run_story_t1" });
    expect(StoryZ.safeParse(story).success).toBe(true);
    expect(story.beats.map((b) => b.id)).toEqual(BUILDERS.map((b) => b.id));
    expect(story.skipped).toEqual([]);
    expect(story.mode).toBe("demo");
    expect(story.subject).toMatchObject({ userId: "aisha", roleId: "ml-engineer" });
    // A 3-minute presentation.
    expect(story.totalSeconds).toBeGreaterThan(90);
    expect(story.totalSeconds).toBeLessThanOrEqual(200);
  });

  it("uses the real numbers: 214 ads, 38% → 84%, Docker 41%, Pod Orbit, 7 issues, 5 Socratic hints", async () => {
    const story = await compileStory();
    const beat = (id: string) => story.beats.find((b) => b.id === id)!;
    expect(beat("onboard").narration).toContain("214 ML engineer job ads");
    expect(beat("map").narration).toMatch(/38% ready for ML engineer roles today, and 84% by Sept 2027/);
    expect(beat("map").narration).toContain("The biggest gap is Docker: 41% of ads");
    expect(beat("roadmap").narration).toContain("starts with Docker");
    expect(beat("pod").narration).toContain("Pod Orbit: 4 students with a fit score of 73%");
    expect(beat("project").narration).toContain("7 issues");
    expect(beat("project").narration).toContain("roadmap's week 1 proof, and Priya reviews it");
    expect(beat("review").narration).toContain("5 questions instead of answers");
    expect(beat("review").narration).toMatch(/COPY \. \. runs before pip install/);
    expect(beat("lecturer").narration).toMatch(/covers \d+ students/);
  });

  it("every number in every narration and receipt is grounded in that beat's facts (nothing invented)", async () => {
    const story = await compileStory();
    expect(story.grounding.removed).toBe(0);
    expect(story.grounding.checked).toBeGreaterThan(20);
    for (const b of story.beats) {
      expect(b.grounding.removed, b.id).toEqual([]);
      for (const n of numbersIn(b.narration)) expect(b.grounding.checked, `${b.id}: ${n}`).toContain(n);
    }
  });

  it("the grounding guardrail rewrites an invented number out of the script", () => {
    const story = { beats: [{ narration: "Readiness is 38% today. Employers love it 97% of the time.", why: "Plain.", facts: [{ key: "now", label: "now", value: 0.38, display: "38%", source: "x" }], grounding: { checked: [], removed: [] } }], grounding: { checked: 0, removed: 0 } } as unknown as Story;
    const r = groundedNarration().apply(story, { runId: "r", agent: "orchestrator", input: null, memo: {} });
    expect(r.action).toBe("modified");
    expect(r.output.beats[0].narration).toContain("38%");
    expect(r.output.beats[0].narration).not.toContain("97");
    expect(r.output.grounding.removed).toBe(1);
  });

  it("quotes each human checkpoint from the agent registry and names the handoff", async () => {
    const story = await compileStory();
    const beat = (id: string) => story.beats.find((b) => b.id === id)!;
    expect(beat("roadmap").checkpoint).toMatchObject({ kind: "student-approval", note: "You approve changes to your plan" });
    expect(beat("review").checkpoint).toMatchObject({ kind: "peer-approval", note: "Your pod reviewer approves and merges, never the AI" });
    expect(beat("lecturer").checkpoint?.kind).toBe("lecturer-decision");
    expect(beat("map").checkpoint).toBeNull(); // no invented checkpoints
    expect(beat("map").handoff).toEqual({ toAgent: "roadmap", carries: "Docker gap, 41% of ads" });
    for (const b of story.beats) {
      expect(b.verify?.path ?? "/api/", b.id).toMatch(/^\/api\//);
      expect(b.screen.href.startsWith("/"), b.id).toBe(true);
    }
  });

  it("previews the merge with the proof engine's formula, then reads the stored proof once it really merges", async () => {
    const subject = await loadSubject("aisha");
    const preview = await proofDelta(subject);
    expect(preview).toMatchObject({ merged: false, before: 0.38 });
    const real = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, runId: "run_story_merge" });
    expect(preview!.after).toBeCloseTo(real.readinessAfter, 2);
    const after = await compileStory();
    const proof = after.beats.find((b) => b.id === "proof")!;
    expect(proof.visual).toMatchObject({ kind: "delta", merged: true, before: real.readinessBefore, after: real.readinessAfter });
    expect(proof.narration).toMatch(/^Priya approved and the pull request merged/);
    expect(proof.verify).toMatchObject({ pick: "status", expect: "merged" });
  });

  it("emits Activity events with real numbers and writes one governed run to the ledger", async () => {
    await compileStory({ runId: "run_story_events" });
    const events = getRunEvents("run_story_events");
    expect(events[0]).toMatchObject({ agent: "orchestrator", status: "started" });
    expect(events.some((e) => /Beat 2, The Bridge Map.*ready today 38%/.test(e.message))).toBe(true);
    expect(events.at(-1)).toMatchObject({ status: "done" });
    const [run] = await listRuns({ runId: "run_story_events" });
    expect(run).toMatchObject({ agent: "orchestrator", status: "ok", checkpoint: { kind: "student-approval", who: "the presenter" } });
    expect(run.guardrails.map((g) => g.name)).toEqual(["injectionShield", "groundedNarration", "noOutboundMessaging"]);
  });

  it("skips beats with missing data instead of faking them (a seeded student with no pod)", async () => {
    const story = await compileStory({ studentId: "jakub" });
    expect(story.subject.userId).toBe("jakub");
    expect(story.skipped.map((x) => x.id)).toEqual(expect.arrayContaining(["pod", "project", "review", "proof"]));
    expect(story.beats.map((b) => b.id)).toEqual(expect.arrayContaining(["map", "lecturer", "flywheel"]));
    for (const s of story.skipped) expect(s.reason.length).toBeGreaterThan(10);
  });

  it("throws SubjectNotFoundError for an unknown student", async () => {
    await expect(compileStory({ studentId: "nobody" })).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  it("summarises for the Coach and MCP in at most 400 characters", async () => {
    const s = summarizeStory(await compileStory());
    expect(s.length).toBeLessThanOrEqual(400);
    expect(s).toMatch(/10 beats of Aisha's first weeks/);
  });
});
