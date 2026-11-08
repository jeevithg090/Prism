// P5 · Proof Ladder: shared shapes (client-safe, no server imports).
// Every skill climbs three rungs, each proven by a different agent and confirmed by a person:
//   1 · Tried it      a micro-challenge pass, a completed module or GitHub evidence
//   2 · Built it      a merged pod PR (a peer approved it; the AI never merges)
//   3 · Can teach it  you reviewed a peer's PR in that skill, or explained it in the mock interview
import { z } from "zod";

export const RUNGS = [1, 2, 3] as const;
export type RungNumber = (typeof RUNGS)[number];

export const RUNG_LABEL: Record<RungNumber, "Tried it" | "Built it" | "Can teach it"> = {
  1: "Tried it",
  2: "Built it",
  3: "Can teach it",
};

/** What each rung means, in one sentence (tooltips, screen readers, the passport legend). */
export const RUNG_MEANING: Record<RungNumber, string> = {
  1: "Passed a 20-minute micro-challenge, completed a module, or showed it in your own repos.",
  2: "Merged a pod pull request in this skill, approved by a peer who knows it.",
  3: "Reviewed a peer's pull request in this skill, or explained it in a mock interview.",
};

/** Contract evidence sources plus the two the ladder derives: a completed module and a peer code review. */
export const LadderSourceZ = z.enum([
  "github", "leetcode", "hackerrank", "codeforces", "stackoverflow", "kaggle", "devto", "linkedin-pdf",
  "certificate", "keystone-pod", "keystone-interview", "micro-challenge", "degree", "code-review",
]);
export type LadderSource = z.infer<typeof LadderSourceZ>;

export const SOURCE_LABEL: Record<LadderSource, string> = {
  github: "GitHub",
  leetcode: "LeetCode",
  hackerrank: "HackerRank",
  codeforces: "Codeforces",
  stackoverflow: "Stack Overflow",
  devto: "DEV",
  kaggle: "Kaggle",
  "linkedin-pdf": "LinkedIn export",
  certificate: "Certificate",
  "keystone-pod": "Pod PR",
  "keystone-interview": "Mock interview",
  "micro-challenge": "Micro-challenge",
  degree: "Completed module",
  "code-review": "Peer code review",
};

export const LadderEvidenceZ = z.object({
  id: z.string(),
  source: LadderSourceZ,
  /** Link to the proof. Empty when there's nothing to open (rare). */
  url: z.string(),
  quote: z.string(),
  createdAt: z.string(),
});
export type LadderEvidence = z.infer<typeof LadderEvidenceZ>;

export const LadderRungZ = z.object({
  rung: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  label: z.enum(["Tried it", "Built it", "Can teach it"]),
  status: z.enum(["done", "open"]),
  evidence: LadderEvidenceZ.optional(),
  /** Done because a higher rung is proven (a merged PR shows you've tried it), with no separate evidence. */
  impliedBy: z.union([z.literal(2), z.literal(3)]).optional(),
});
export type LadderRung = z.infer<typeof LadderRungZ>;

export const SkillLadderZ = z.object({
  skillId: z.string(),
  skillName: z.string(),
  rungs: z.array(LadderRungZ).length(3),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  /** Bridge Map status and demand (share of ads for the primary role), when the skill is on the map. */
  status: z.enum(["proven", "degree-done", "degree-upcoming", "gap"]).optional(),
  demand: z.number().optional(),
});
export type SkillLadder = z.infer<typeof SkillLadderZ>;

export const ProofLadderZ = z.object({
  userId: z.string(),
  skills: z.array(SkillLadderZ),
  generatedAt: z.string(),
});
export type ProofLadder = z.infer<typeof ProofLadderZ>;

/** GET /api/proof/latest/[userId]: the newest merged pod PR, for the mock interview's dynamic variables. */
export const LatestProofZ = z.object({
  userId: z.string(),
  podId: z.string(),
  podName: z.string(),
  issueIndex: z.number(),
  skillId: z.string(),
  skillName: z.string(),
  prTitle: z.string(),
  prUrl: z.string(),
  repo: z.string(),
  reviewerUserId: z.string(),
  reviewerName: z.string(),
  /** "merged": a real proof exists. "in-progress": nothing merged yet, so this is the issue they're working on. */
  status: z.enum(["merged", "in-progress"]),
  mergedAt: z.string().optional(),
  readinessBefore: z.number(),
  readinessAfter: z.number(),
  ladderLevel: z.number(),
  message: z.string(),
  /** true when nothing has merged yet and this comes from the seeded demo pod. */
  isDemo: z.boolean(),
  /** Flat strings, ready to pass to ElevenLabs as dynamic variables. */
  dynamicVariables: z.record(z.string(), z.string()),
});
export type LatestProof = z.infer<typeof LatestProofZ>;

/** GET /api/proof-ladder/[userId]/passport: everything the Skill Passport renders. */
export const PassportZ = z.object({
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  programme: z.string(),
  year: z.number().optional(),
  badges: z.array(z.string()),
  roleName: z.string().optional(),
  readinessNow: z.number().optional(),
  readinessProjected: z.number().optional(),
  isPublic: z.boolean(),
  isOwner: z.boolean(),
  isDemo: z.boolean(),
  skills: z.array(SkillLadderZ),
});
export type Passport = z.infer<typeof PassportZ>;

export const PassportVisibilityReqZ = z.object({ public: z.boolean() });

/** Level from rungs: the highest done rung (lower rungs count as done once a higher one is proven). */
export function levelOf(rungs: Pick<LadderRung, "rung" | "status">[]): 0 | 1 | 2 | 3 {
  return rungs.reduce<0 | 1 | 2 | 3>((m, r) => (r.status === "done" && r.rung > m ? r.rung : m), 0);
}

/** "Docker: Tried it and Built it done, Can teach it open." */
export function describeLadder(l: Pick<SkillLadder, "skillName" | "rungs">): string {
  const done = l.rungs.filter((r) => r.status === "done").map((r) => r.label);
  const open = l.rungs.filter((r) => r.status === "open").map((r) => r.label);
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  if (!done.length) return `${l.skillName}: no rungs proven yet.`;
  if (!open.length) return `${l.skillName}: all three rungs proven.`;
  return `${l.skillName}: ${join(done)} done, ${join(open)} open.`;
}
