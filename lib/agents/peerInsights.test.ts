import { describe, expect, it } from "vitest";
import { PodInsightsZ } from "@/lib/schemas/studio";
import { ANONYMITY_MIN, computePodInsights, type SkillSets } from "./peerInsights";

const P = "uom-bsc-cs";
const people = (n: number, programmeId = P) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, programmeId }));

/** 10 students: s1 knows docker+python, s2 knows sql, everyone else has gaps. */
function handmade(): Record<string, SkillSets> {
  return {
    s1: { proven: ["docker", "python"], gaps: ["sql"] },
    s2: { proven: ["sql", "python"], gaps: ["docker", "kubernetes"] },
    s3: { proven: [], gaps: ["docker", "sql", "kubernetes"] },
    s4: { proven: [], gaps: ["docker", "mlops"] },
    s5: { proven: ["git"], gaps: ["python"] },
    s6: { proven: [], gaps: ["kubernetes"] },
    s7: { proven: ["git"], gaps: [] },
    s8: { proven: [], gaps: ["docker"] },
    s9: { proven: ["docker"], gaps: ["docker"] }, // proven wins over a stale gap
    // s10 has no skills data at all
  };
}

describe("computePodInsights", () => {
  it(`suppresses cohorts under ${ANONYMITY_MIN} students with empty lists`, () => {
    const r = computePodInsights({ programmeId: P, profiles: people(9), skills: handmade(), podsCount: 2 });
    expect(r).toEqual({ programmeId: P, cohortSize: 9, podsCount: 2, suppressed: true, peerTeachable: [], unteachableGaps: [] });
    expect(PodInsightsZ.parse(r)).toEqual(r);
  });

  it("only counts students on the requested programme", () => {
    const profiles = [...people(9), { id: "x1", programmeId: "other-prog" }, { id: "x2", programmeId: "other-prog" }];
    expect(computePodInsights({ programmeId: P, profiles, skills: handmade(), podsCount: 0 }).suppressed).toBe(true);
  });

  it("counts teachers and learners correctly on a small handmade cohort", () => {
    const r = computePodInsights({ programmeId: P, profiles: people(10), skills: handmade(), podsCount: 3 });
    expect(PodInsightsZ.parse(r)).toEqual(r);
    expect(r.suppressed).toBe(false);
    expect(r.cohortSize).toBe(10);
    expect(r.podsCount).toBe(3);
    // docker: taught by s1, s9; wanted by s2, s3, s4, s8 (s9's stale gap is ignored)
    // sql: taught by s2; wanted by s1, s3 · python: taught by s1, s2; wanted by s5
    expect(r.peerTeachable).toEqual([
      { skillId: "docker", teachers: 2, learners: 4 },
      { skillId: "sql", teachers: 1, learners: 2 },
      { skillId: "python", teachers: 2, learners: 1 },
    ]);
    // Nobody has proven kubernetes (3 want it) or mlops (1).
    expect(r.unteachableGaps).toEqual([
      { skillId: "kubernetes", studentsWithGap: 3 },
      { skillId: "mlops", studentsWithGap: 1 },
    ]);
  });

  it("keeps the top 8 teachable skills, sorted by learners", () => {
    const skills: Record<string, SkillSets> = { s1: { proven: Array.from({ length: 12 }, (_, i) => `skill-${i}`), gaps: [] } };
    for (let i = 2; i <= 10; i++) skills[`s${i}`] = { proven: [], gaps: Array.from({ length: Math.min(12, i + 2) }, (_, k) => `skill-${k}`) };
    const r = computePodInsights({ programmeId: P, profiles: people(10), skills, podsCount: 0 });
    expect(r.peerTeachable).toHaveLength(8);
    const learners = r.peerTeachable.map((x) => x.learners);
    expect([...learners].sort((a, b) => b - a)).toEqual(learners);
    expect(r.unteachableGaps).toEqual([]);
  });
});
