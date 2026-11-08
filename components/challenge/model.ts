// P5 · Micro-challenges (rung 1 of the Proof Ladder): shared shapes (client-safe, no server imports).
// The full Challenge (with grading rules and the sample answer) never leaves the server;
// the client gets a PublicChallenge.
import { z } from "zod";

/** AST-lite grading rules, run on the submission with comments stripped. Patterns are JS regex sources. */
export const RuleZ = z.discriminatedUnion("kind", [
  /** The pattern must match. */
  z.object({ kind: z.literal("match"), pattern: z.string(), flags: z.string().optional() }),
  /** The pattern must not match. */
  z.object({ kind: z.literal("absent"), pattern: z.string(), flags: z.string().optional() }),
  /** Both match, and `first` starts before `then`. */
  z.object({ kind: z.literal("order"), first: z.string(), then: z.string(), flags: z.string().optional() }),
  /** The LAST match of `pattern` has a group 1 that does not match `not` (e.g. the final USER isn't root). */
  z.object({ kind: z.literal("last"), pattern: z.string(), not: z.string(), flags: z.string().optional() }),
  /** The submission parses as JSON. */
  z.object({ kind: z.literal("json") }),
]);
export type Rule = z.infer<typeof RuleZ>;

export const CriterionZ = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** A Socratic question shown when the criterion isn't met. Never the fix itself. */
  hint: z.string(),
  rules: z.array(RuleZ),
});
export type Criterion = z.infer<typeof CriterionZ>;

export const ChallengeLanguageZ = z.enum(["dockerfile", "python", "sql", "json", "shell"]);
export type ChallengeLanguage = z.infer<typeof ChallengeLanguageZ>;

export const ChallengeZ = z.object({
  id: z.string(),
  skillId: z.string(),
  title: z.string(),
  minutes: z.number().int().min(5).max(60),
  /** Why this matters, tied to the pod project. */
  context: z.string(),
  prompt: z.string(),
  language: ChallengeLanguageZ,
  fileName: z.string(),
  starter: z.string(),
  rubric: z.array(CriterionZ).length(4),
  checks: z.array(CriterionZ).length(3),
  sampleAnswer: z.string(),
  /** Free, official reading for after the attempt. */
  resources: z.array(z.object({ title: z.string(), url: z.string().url() })),
});
export type Challenge = z.infer<typeof ChallengeZ>;

export const PublicChallengeZ = z.object({
  id: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  title: z.string(),
  minutes: z.number(),
  context: z.string(),
  prompt: z.string(),
  language: ChallengeLanguageZ,
  fileName: z.string(),
  starter: z.string(),
  rubric: z.array(z.object({ id: z.string(), title: z.string(), description: z.string() })),
  checksCount: z.number(),
  resources: z.array(z.object({ title: z.string(), url: z.string() })),
  /** The roadmap week this challenge belongs to, when there is one. */
  roadmapWeek: z.number().optional(),
  source: z.enum(["fixture", "llm"]),
  runId: z.string().optional(),
});
export type PublicChallenge = z.infer<typeof PublicChallengeZ>;

export const CriterionResultZ = z.object({
  id: z.string(),
  title: z.string(),
  met: z.boolean(),
  /** Present only when not met: a question to think about. */
  hint: z.string().optional(),
});
export type CriterionResult = z.infer<typeof CriterionResultZ>;

export const GradeResultZ = z.object({
  challengeId: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  passed: z.boolean(),
  rubric: z.array(CriterionResultZ),
  checks: z.array(CriterionResultZ),
  rubricMet: z.number(),
  checksPassed: z.number(),
  /** Socratic, formative feedback: what went well and questions to think about. Never the answer. */
  feedback: z.string(),
  feedbackSource: z.enum(["llm", "rules"]),
  /** The rung-1 evidence written on a pass. */
  evidenceId: z.string().optional(),
  /** true when the submission is the sample answer (the evidence says so). */
  usedSample: z.boolean(),
  runId: z.string().optional(),
});
export type GradeResult = z.infer<typeof GradeResultZ>;

/** GET /api/challenges?userId=: the skills you can try, the roadmap week's focus first. */
export const ChallengeMenuZ = z.object({
  userId: z.string(),
  focusSkillId: z.string().optional(),
  focusWeek: z.number().optional(),
  options: z.array(z.object({
    skillId: z.string(),
    skillName: z.string(),
    /** Share of ads for the primary target role, 0..1. */
    demand: z.number().optional(),
    status: z.enum(["proven", "degree-done", "degree-upcoming", "gap"]).optional(),
    /** Rung 1 already done for this skill. */
    tried: z.boolean(),
  })),
});
export type ChallengeMenu = z.infer<typeof ChallengeMenuZ>;

export const ChallengeGenerateReqZ = z.object({ userId: z.string().min(1), skillId: z.string().min(1) });
export const ChallengeGradeReqZ = z.object({
  userId: z.string().min(1),
  challengeId: z.string().min(1),
  submission: z.string().max(20_000),
});
export const ChallengeSampleReqZ = z.object({ challengeId: z.string().min(1) });

/** Pass rule: every hidden test passes and at least 3 of the 4 rubric criteria are met. */
export const PASS_RUBRIC_MIN = 3;
