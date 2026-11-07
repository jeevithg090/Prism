import { describe, expect, it } from "vitest";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import evidenceFixture from "@/data/fixtures/evidence.aisha.json";
import programmeFixture from "@/data/fixtures/programme.uom-bsc-cs.json";
import roadmapFixture from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import { mergeEvidence } from "@/lib/graph/build";
import { computeReadiness, COVERAGE as READINESS_COVERAGE } from "@/lib/graph/readiness";
import type { BridgeMap, EvidenceItem, Programme, Roadmap } from "@/lib/types";
import { COVERAGE, explainReadiness, PROOF_CONFIDENCE, PROOF_LEVEL, type ExplainInput } from "./explain";
import { ExplanationZ } from "./model";
import { leaveOneOut, maxGame, shapleyExact, shapleyMaxClosedForm } from "./shapley";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const map = () => structuredClone(mapFixture) as BridgeMap;
const input = (over: Partial<ExplainInput> = {}): ExplainInput => ({
  map: map(), evidence: structuredClone(evidenceFixture) as EvidenceItem[], programme: programmeFixture as Programme,
  startedAt: "2026-09-21", roadmap: structuredClone(roadmapFixture) as Roadmap,
  challenges: [{ skillId: "docker", minutes: 20, title: "Dockerise a tiny API" }, { skillId: "pytorch", minutes: 20, title: "Batch inference" }],
  hoursPerWeek: 8, firstName: "Aisha", roleName: "ML Engineer", now: NOW, skillName: (id) => id, ...over,
});

describe("Shapley math", () => {
  it("closed form for the max game equals exact enumeration on random games", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 200; t++) {
      const k = 1 + Math.floor(rand() * 7);
      const values = Array.from({ length: k }, () => [0, 0.4, 0.7, 1, rand()][Math.floor(rand() * 5)]);
      const exact = shapleyExact(k, maxGame(values));
      const closed = shapleyMaxClosedForm(values);
      closed.forEach((c, i) => expect(c).toBeCloseTo(exact[i], 12));
      expect(closed.reduce((a, b) => a + b, 0)).toBeCloseTo(Math.max(0, ...values), 12); // efficiency
    }
  });

  it("splits a shared increment equally and gives the top player the rest", () => {
    // Module 0.4 + proof 1.0: the 0.4 both reach is split, the proof alone earns the last 0.6.
    expect(shapleyMaxClosedForm([0.4, 1])).toEqual([0.2, 0.8]);
    expect(shapleyMaxClosedForm([1, 1])).toEqual([0.5, 0.5]);
    expect(leaveOneOut(2, maxGame([0.4, 1]))).toEqual([0, 0.6000000000000001].map((x) => expect.closeTo(x, 12)));
    expect(shapleyExact(0, () => 0)).toEqual([]);
    expect(() => shapleyExact(17, () => 0)).toThrow(RangeError);
  });

  it("enumeration handles a non-max game (symmetry and null player)", () => {
    // v(S) = 1 if players 0 and 1 are both in S; player 2 is a null player.
    const phi = shapleyExact(3, (m) => ((m & 3) === 3 ? 1 : 0));
    expect(phi[0]).toBeCloseTo(0.5);
    expect(phi[1]).toBeCloseTo(0.5);
    expect(phi[2]).toBeCloseTo(0);
  });
});

describe("explainReadiness on Aisha's real data", () => {
  const x = explainReadiness(input());

  it("is schema-valid, and the shares add up exactly to the formula, plus a labelled adjustment to the stored score", () => {
    expect(ExplanationZ.safeParse(x).success).toBe(true);
    const total = x.contributors.reduce((a, c) => a + c.points, 0);
    expect(total).toBeCloseTo(x.readiness.mappedPoints, 1);
    expect(total + x.readiness.adjustmentPoints).toBeCloseTo(x.readiness.now * 100, 1);
    expect(x.readiness.mappedPoints).toBeCloseTo(
      (map().nodes.filter((n) => n.demand > 0).reduce((a, n) => a + n.demand * { proven: 1, "degree-done": 0.7, "degree-upcoming": 0.4, gap: 0 }[n.status], 0) /
        map().nodes.filter((n) => n.demand > 0).reduce((a, n) => a + n.demand, 0)) * 100, 1);
    expect(x.checks.efficiencyGap).toBeLessThan(0.01);
    expect(x.checks.closedFormGap).toBeLessThan(1e-9);
    expect(x.checks.coalitions).toBeGreaterThan(x.skills.length);
  });

  it("per-skill points match the readiness formula's own terms", () => {
    const m = map();
    const total = m.nodes.filter((n) => n.demand > 0).reduce((a, n) => a + n.demand, 0);
    const py = x.skills.find((s) => s.skillId === "python")!;
    expect(py.points).toBeCloseTo((0.62 / total) * 100, 1);
    expect(py.shares.reduce((a, s) => a + s.points, 0)).toBeCloseTo(py.points, 1);
    // Removing a node's coverage changes computeReadiness by exactly that skill's points.
    const without = m.nodes.map((n) => (n.skillId === "python" ? { ...n, status: "gap" as const } : n));
    expect((computeReadiness(m.nodes) - computeReadiness(without)) * 100).toBeCloseTo(py.points, 0);
  });

  it("shares Python between the GitHub proof and the module that teaches it (Shapley, not double counting)", () => {
    const py = x.skills.find((s) => s.skillId === "python")!;
    const repo = py.shares.find((s) => s.contributorId === "ev:ev_aisha_py1")!;
    const mod = py.shares.find((s) => s.contributorId === "mod:COMP1xxx5")!;
    expect(repo.points / py.points).toBeCloseTo(0.8, 2);
    expect(mod.points / py.points).toBeCloseTo(0.2, 2);
    const repoC = x.contributors.find((c) => c.id === "ev:ev_aisha_py1")!;
    expect(repoC.leaveOneOut).toBeLessThan(repoC.points); // the module would still cover 40% without it
    expect(x.insights.some((s) => s.includes("only") && s.includes("are its alone"))).toBe(true);
  });

  it("credits curated proof without linked evidence to a visible record, and flags evidence below the proof bar", () => {
    const js = x.contributors.find((c) => c.id === "ev:ev_aisha_js1")!;
    expect(js.points).toBe(0);
    expect(js.belowBar).toEqual({ level: 1, confidence: 0.6 });
    expect(x.contributors.some((c) => c.id === "rec:javascript" && c.points > 0)).toBe(true);
  });

  it("names the seeded score's offset from the formula for what it is: a stored adjustment, not a source", () => {
    // Every role skill is on the map, so nothing is "beyond" it: the 2.85 points are in the stored 0.38 itself.
    const roleSkills = map().nodes.filter((n) => n.demand > 0);
    expect(x.skills).toHaveLength(roleSkills.length);
    expect(x.readiness.mappedPoints).toBeCloseTo(computeReadiness(roleSkills) * 100, 0);
    expect(x.readiness.adjustmentPoints).toBeCloseTo(x.readiness.now * 100 - x.readiness.mappedPoints, 2);
    expect(x.readiness.adjustmentPoints).toBeCloseTo(2.85, 2);
    expect(x.readiness.adjustmentNote).toMatch(new RegExp(`stores 38\\.00 points, and the readiness formula over its ${roleSkills.length} skills gives 35\\.15`));
    expect(x.readiness.adjustmentNote).toMatch(/seeded, or rounded/);
    expect(x.contributors.every((c) => c.kind === "evidence" || c.kind === "module" || c.kind === "record")).toBe(true);
    // A map built by the formula has no adjustment and no note.
    const built = map();
    built.readinessNow = Number((x.readiness.mappedPoints / 100).toFixed(6));
    expect(explainReadiness(input({ map: built })).readiness.adjustmentNote).toBeNull();
  });

  it("reads Keystone's readiness weights and pins the proof bar to the Bridge Map's", () => {
    expect(COVERAGE).toBe(READINESS_COVERAGE);
    const m = map();
    m.nodes = m.nodes.map((n) => (n.skillId === "docker" ? { ...n, status: "gap" as const, evidenceIds: [] } : n));
    const ev = (confidence: number, level = PROOF_LEVEL): EvidenceItem => ({ id: `e${confidence}${level}`, userId: m.userId, skillId: "docker", level: level as 2, confidence, source: "github", url: "u", createdAt: "2026-11-01" });
    const docker = (e: EvidenceItem) => mergeEvidence(m, [e]).nodes.find((n) => n.skillId === "docker")!.status;
    expect(docker(ev(PROOF_CONFIDENCE))).toBe("proven");
    expect(docker(ev(PROOF_CONFIDENCE - 0.01))).toBe("gap");
    expect(docker(ev(0.9, PROOF_LEVEL - 1))).toBe("gap");
  });

  it("finds the best next proof by readiness per hour: Docker, the top gap no module covers", () => {
    expect(x.next.best).toMatchObject({ id: "rm:docker", kind: "roadmap", hours: 8, rung: "Built it" });
    expect(x.next.best!.gainPoints).toBeCloseTo(x.skills.find((s) => s.skillId === "docker")!.maxPoints, 2);
    expect(x.next.firstStep).toMatchObject({ id: "ch:docker", gainPoints: 0, rung: "Tried it" });
    const ml = x.next.actions.find((a) => a.skillId === "machine-learning")!;
    expect(ml.gainPoints / x.skills.find((s) => s.skillId === "machine-learning")!.maxPoints).toBeCloseTo(0.6, 2); // the module already counts 40%
    for (let k = 1; k < x.next.actions.length; k++) expect(x.next.actions[k - 1].pointsPerHour).toBeGreaterThanOrEqual(x.next.actions[k].pointsPerHour);
  });

  it("ticked tasks lower the hours left, which can change the best next proof", () => {
    const rm = structuredClone(roadmapFixture) as Roadmap;
    rm.weeks[1].tasks = rm.weeks[1].tasks.map((t) => ({ ...t, done: t.type !== "build" })); // PyTorch: 4 h left
    const y = explainReadiness(input({ roadmap: rm }));
    expect(y.next.best).toMatchObject({ id: "rm:pytorch", hours: 4 });
  });

  it("replays the last 6 weeks from evidence dates, and this week is flat for the fixture", () => {
    expect(x.timeline).toHaveLength(6);
    expect(x.timeline.at(-1)!.points).toBeCloseTo(x.readiness.now * 100, 1);
    expect(x.week.deltaPoints).toBeCloseTo(0, 5);
    expect(x.week.movers).toEqual([]);
    expect(x.week.lastChange).toMatchObject({ weekOf: "2026-10-31" });
    expect(x.week.lastChange!.deltaPoints).toBeGreaterThan(0);
  });

  it("attributes this week's change to a merged pod PR, with the exact delta", () => {
    const m = map();
    m.nodes = m.nodes.map((n) => (n.skillId === "docker" ? { ...n, status: "proven" as const, level: 2, evidenceIds: ["ev_pod_docker"] } : n));
    const total = m.nodes.filter((n) => n.demand > 0).reduce((a, n) => a + n.demand, 0);
    m.readinessNow = Math.round((m.readinessNow + 0.41 / total) * 100) / 100;
    const pr: EvidenceItem = { id: "ev_pod_docker", userId: "aisha", skillId: "docker", level: 2, confidence: 0.9, source: "keystone-pod", url: "https://github.com/x/y/pull/1", createdAt: "2026-11-05T10:00:00.000Z" };
    const y = explainReadiness(input({ map: m, evidence: [...(structuredClone(evidenceFixture) as EvidenceItem[]), pr] }));
    expect(y.week.movers[0]).toMatchObject({ contributorId: "ev:ev_pod_docker", kind: "evidence" });
    expect(y.week.movers[0].points).toBeCloseTo((0.41 / total) * 100, 1);
    expect(y.next.best?.skillId).not.toBe("docker");
    expect(y.groups.some((g) => g.label === "Pod pull requests")).toBe(true);
  });

  it("anchors the history: a later merge that rounds the stored score can't rewrite past weeks", () => {
    const before = explainReadiness(input());
    const m = map();
    m.nodes = m.nodes.map((n) => (n.skillId === "docker" ? { ...n, status: "proven" as const, level: 2, evidenceIds: ["ev_pod_docker"] } : n));
    const total = m.nodes.filter((n) => n.demand > 0).reduce((a, n) => a + n.demand, 0);
    m.readinessNow = Math.round((m.readinessNow + 0.41 / total) * 100) / 100; // shiftReadiness rounds: 0.4337 → 0.43
    const pr: EvidenceItem = { id: "ev_pod_docker", userId: "aisha", skillId: "docker", level: 2, confidence: 0.9, source: "keystone-pod", url: "https://github.com/x/y/pull/1", createdAt: "2026-11-05T10:00:00.000Z" };
    const evidence = [...(structuredClone(evidenceFixture) as EvidenceItem[]), pr];
    const after = explainReadiness(input({ map: m, evidence, anchor: { adjustment: before.readiness.historyAdjustment } }));
    expect(after.readiness.historyAdjustment).toBe(before.readiness.historyAdjustment);
    expect(after.timeline.slice(0, -1)).toEqual(before.timeline.slice(0, -1));
    expect(after.week.fromPoints).toBe(before.week.toPoints);
    expect(after.week.toPoints).toBe(43);
    expect(after.week.deltaPoints).toBeCloseTo(43 - 38, 5);
    // The PR's share, and the rounding as its own labelled mover, add up to exactly what moved.
    expect(after.week.movers[0]).toMatchObject({ contributorId: "ev:ev_pod_docker" });
    const rounding = after.week.movers.find((v) => v.kind === "adjustment")!;
    expect(rounding).toMatchObject({ contributorId: "adjustment", label: "Rounding of your stored score" });
    expect(rounding.points).toBeLessThan(0);
    expect(after.week.movers.reduce((a, v) => a + v.points, 0)).toBeCloseTo(after.week.deltaPoints, 1);
    // Without the anchor, the old behaviour: the past moves with today's adjustment.
    const unanchored = explainReadiness(input({ map: m, evidence }));
    expect(unanchored.timeline[0].points).not.toBe(before.timeline[0].points);
  });

  it("ignores an anchor that's more than a point off (a rebuilt map) or not a number", () => {
    const fresh = explainReadiness(input());
    for (const adjustment of [fresh.readiness.historyAdjustment + 0.05, Number.NaN]) {
      const y = explainReadiness(input({ anchor: { adjustment } }));
      expect(y.readiness.historyAdjustment).toBeCloseTo(fresh.readiness.historyAdjustment, 12);
      expect(y.week.movers).toEqual([]);
    }
  });

  it("the skills-only fallback still adds up, with every skill credited to its record", () => {
    const y = explainReadiness(input({ mode: "skills", evidence: [], programme: null }));
    expect(y.mode).toBe("skills");
    expect(y.contributors.every((c) => c.kind === "record")).toBe(true);
    expect(y.contributors.reduce((a, c) => a + c.points, 0) + y.readiness.adjustmentPoints).toBeCloseTo(y.readiness.now * 100, 1);
  });

  it("an empty map explains nothing without throwing", () => {
    const m = map();
    m.nodes = m.nodes.map((n) => ({ ...n, demand: 0 }));
    m.readinessNow = 0;
    const y = explainReadiness(input({ map: m }));
    expect(y.contributors).toEqual([]);
    expect(y.next.best).toBeNull();
  });
});
