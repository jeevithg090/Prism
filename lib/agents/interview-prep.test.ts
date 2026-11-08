import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMap, BridgeNode, SkillId } from "@/lib/types";

const h = vi.hoisted(() => ({
  events: [] as Array<{ agent: string; status: string; message: string; runId: string; data?: unknown }>,
  loadGraph: vi.fn(),
  getProofLadder: vi.fn(),
}));

vi.mock("@/lib/graph/build", () => ({ loadGraph: h.loadGraph }));
vi.mock("@/lib/agents/ladder", () => ({ getProofLadder: h.getProofLadder }));
vi.mock("@/lib/agents/events", () => ({
  emit: (e: { agent: string; status: string; message: string; runId: string; data?: unknown }) => { h.events.push(e); },
  newRunId: () => "run_test",
}));

import { buildInterviewPrep } from "@/lib/agents/interview-prep";

const node = (skillId: SkillId, status: BridgeNode["status"], demand: number): BridgeNode => ({
  skillId, name: skillId.charAt(0).toUpperCase() + skillId.slice(1), category: "practice", status, demand,
  level: 0, evidenceIds: [], moduleCodes: [],
});

const mapWith = (gaps: BridgeNode[]): BridgeMap => ({
  userId: "aisha", roleId: "ml-engineer", nodes: gaps, edges: [],
  readinessNow: 0.4, readinessProjected: 0.6, generatedAt: "2026-11-07T12:00:00Z",
});

beforeEach(() => {
  h.events.length = 0;
  h.loadGraph.mockReset();
  h.getProofLadder.mockReset();
  h.getProofLadder.mockResolvedValue({ userId: "aisha", skills: [], generatedAt: "2026-11-07T12:00:00Z" });
});

describe("buildInterviewPrep", () => {
  it("picks the top 3 gap skills sorted by demand descending", async () => {
    h.loadGraph.mockResolvedValue(mapWith([
      node("aws", "gap", 0.33),
      node("docker", "gap", 0.41),
      node("sql", "gap", 0.35),
      node("pytorch", "gap", 0.38),
      node("git", "proven", 0.9),
      node("linux", "degree-done", 0.5),
    ]));
    const prep = await buildInterviewPrep({ userId: "aisha", roleId: "ml-engineer" });
    expect(prep.map((p) => p.skillId)).toEqual(["docker", "pytorch", "sql"]);
    expect(prep).toHaveLength(3);
  });

  it("generates between 3 and 5 questions per skill", async () => {
    h.loadGraph.mockResolvedValue(mapWith([node("docker", "gap", 0.41)]));
    const prep = await buildInterviewPrep({ userId: "aisha" });
    for (const p of prep) {
      expect(p.questions.length).toBeGreaterThanOrEqual(3);
      expect(p.questions.length).toBeLessThanOrEqual(5);
      for (const q of p.questions) {
        expect(q.skillId).toBe(p.skillId);
        expect(["behavioural", "technical", "system-design", "coding"]).toContain(q.type);
        expect([1, 2, 3]).toContain(q.difficulty);
        expect(typeof q.tip).toBe("string");
        expect(q.tip.length).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic: same input produces the same output", async () => {
    h.loadGraph.mockResolvedValue(mapWith([node("docker", "gap", 0.41), node("aws", "gap", 0.33)]));
    const a = await buildInterviewPrep({ userId: "aisha", roleId: "ml-engineer", runId: "run_det" });
    const b = await buildInterviewPrep({ userId: "aisha", roleId: "ml-engineer", runId: "run_det" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("falls back to behavioural questions for an unknown skill", async () => {
    h.loadGraph.mockResolvedValue(mapWith([node("obscure-skill", "gap", 0.9)]));
    const prep = await buildInterviewPrep({ userId: "aisha" });
    expect(prep).toHaveLength(1);
    for (const q of prep[0].questions) {
      expect(q.type).toBe("behavioural");
      expect(q.question).toContain("Obscure Skill");
    }
  });

  it("emits started → progress → done in order", async () => {
    h.loadGraph.mockResolvedValue(mapWith([node("docker", "gap", 0.41)]));
    await buildInterviewPrep({ userId: "aisha" });
    const statuses = h.events.map((e) => e.status);
    expect(statuses).toEqual(["started", "progress", "done"]);
    expect(h.events.every((e) => e.agent === "voice")).toBe(true);
    expect(h.events[0].runId).toBe("run_test");
  });

  it("returns [] and emits an error event when loadGraph fails", async () => {
    h.loadGraph.mockRejectedValue(new Error("store is down"));
    const prep = await buildInterviewPrep({ userId: "aisha" });
    expect(prep).toEqual([]);
    const errors = h.events.filter((e) => e.status === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].message.toLowerCase()).toContain("couldn't load your bridge map");
  });

  it("returns [] and emits an error event when there is no map", async () => {
    h.loadGraph.mockResolvedValue(null);
    const prep = await buildInterviewPrep({ userId: "aisha" });
    expect(prep).toEqual([]);
    const errors = h.events.filter((e) => e.status === "error");
    expect(errors).toHaveLength(1);
  });

  it("returns [] when there are no gaps", async () => {
    h.loadGraph.mockResolvedValue(mapWith([node("git", "proven", 0.9), node("python", "degree-done", 0.8)]));
    const prep = await buildInterviewPrep({ userId: "aisha" });
    expect(prep).toEqual([]);
  });
});
