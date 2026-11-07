// P5 · Demo Proof Ladder for Aisha (used by "Use demo data" when the API can't be reached).
// Matches data/fixtures/bridgemap.aisha.ml-engineer.json before the demo: GitHub-proven and completed-module skills
// are at rung 1, her top gaps are at rung 0.
import { RUNG_LABEL, type LadderRung, type ProofLadder, type SkillLadder } from "./model";

const AT = "2026-11-07T14:00:00.000Z";
const open = (rung: 1 | 2 | 3): LadderRung => ({ rung, label: RUNG_LABEL[rung], status: "open" });
const rung1 = (skillId: string, skillName: string, source: "github" | "degree", quote: string, demand: number, status: SkillLadder["status"]): SkillLadder => ({
  skillId, skillName, level: 1, demand, status,
  rungs: [{ rung: 1, label: "Tried it", status: "done", evidence: { id: `demo_${skillId}`, source, url: "/map", quote, createdAt: AT } }, open(2), open(3)],
});
const gap = (skillId: string, skillName: string, demand: number): SkillLadder => ({
  skillId, skillName, level: 0, demand, status: "gap", rungs: [open(1), open(2), open(3)],
});

export const DEMO_LADDER: ProofLadder = {
  userId: "aisha",
  generatedAt: AT,
  skills: [
    rung1("python", "Python", "github", "Found in your GitHub repos by the Evidence Agent (level 2 of 3 on your Bridge Map)", 0.62, "proven"),
    rung1("git", "Git", "github", "Found in your GitHub repos by the Evidence Agent (level 2 of 3 on your Bridge Map)", 0.3, "proven"),
    rung1("data-structures", "Data structures", "degree", "Completed COMP1xxx1 in your degree", 0.22, "degree-done"),
    rung1("algorithms", "Algorithms", "degree", "Completed COMP1xxx1 in your degree", 0.2, "degree-done"),
    rung1("linux", "Linux", "degree", "Completed COMP1xxx3 in your degree", 0.18, "degree-done"),
    rung1("javascript", "JavaScript", "github", "Found in your GitHub repos by the Evidence Agent (level 1 of 3 on your Bridge Map)", 0.1, "proven"),
    gap("docker", "Docker", 0.41),
    gap("pytorch", "PyTorch", 0.38),
    gap("sql", "SQL", 0.35),
    gap("aws", "AWS", 0.33),
  ],
};

export function demoSkill(skillId: string): ProofLadder {
  const found = DEMO_LADDER.skills.find((s) => s.skillId === skillId);
  return { ...DEMO_LADDER, skills: found ? [found] : [] };
}
