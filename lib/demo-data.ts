import bridgeFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import profileFixture from "@/data/fixtures/profile.aisha.json";
import type { BridgeMap, Profile, Roadmap, RoadmapWeek, SkillId } from "@/lib/types";

export const demoProfile = profileFixture as Profile;
export const demoBridgeMap = bridgeFixture as BridgeMap;
const focusSkills: SkillId[] = ["docker", "pytorch", "sql", "mlops", "llm-evaluation", "aws"];
const demoWeeks: RoadmapWeek[] = Array.from({ length: 12 }, (_, index) => {
  const skillId = focusSkills[index % focusSkills.length];
  const skill = demoBridgeMap.nodes.find((node) => node.skillId === skillId);
  return {
    week: index + 1,
    startDate: new Date(Date.UTC(2026, 10, 9 + index * 7)).toISOString().slice(0, 10),
    focusSkillId: skillId,
    isExamWeek: index === 5 || index === 9,
    tasks: [{ id: `demo-task-${index + 1}`, type: index % 2 ? "practice" : "learn", title: `Spend a focused session practising ${skill?.name ?? skillId}`, resourceUrl: "https://www.docker.com/", free: true, hours: 2, done: false }],
    proof: `Show ${skill?.name ?? skillId} in a small project and ask a teammate for review.`,
    degreeLink: "Builds on your first-year programming and maths foundations.",
    receipt: { demandPct: skillId === "docker" ? 41 : Math.round((skill?.demand ?? .2) * 100), trend: skill?.trend ?? "stable", growthPerYear: .12, coveredByDegree: "no", reason: `${skill?.name ?? skillId} appears in your target role and is not covered by your degree yet.` },
  } as RoadmapWeek;
});
export const demoRoadmap: Roadmap = {
  userId: "aisha", roleId: "ml-engineer", version: 2, readinessNow: .38, readinessProjected: .84,
  generatedAt: new Date().toISOString(), weeks: demoWeeks,
  skipped: [
    { skillId: "statistics", moduleCode: "COMP1xxx4", message: "Your Year 1 maths module covers the foundations. Saves about 12 hours." },
    { skillId: "linear-algebra", moduleCode: "COMP1xxx4", message: "Already planned for Semester 2. Revisit it then." },
  ],
};
export const demoDemand = new Map(demoBridgeMap.nodes.map((node) => [node.skillId, Math.round(node.demand * 100)]));
