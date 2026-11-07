// Keystone Labs · Viva Check: shared shapes (client-safe, no server imports).
// A viva is three oral-exam questions written from the student's own pull-request diff. Each question is anchored
// to real lines of that diff and graded against a concept rubric that stays on the server. A pass writes
// keystone-interview evidence (Proof Ladder rung 3, "Can teach it"); a weak or gamed answer flags a re-viva that
// the pod reviewer runs in person. The AI never fails anyone and never grades for credit.
import { z } from "zod";
import { LadderRungZ } from "@/components/ladder/model";

export const VIVA_KINDS = ["break", "order", "tradeoff"] as const;
export type VivaKind = (typeof VIVA_KINDS)[number];

/** Plain labels for the three question kinds (sentence case, shown as text, never as tracked caps). */
export const KIND_LABEL: Record<VivaKind, string> = {
  break: "What would break",
  order: "Why this order",
  tradeoff: "What's the trade-off",
};

export const MAX_ANSWER_CHARS = 3000;
export const MAX_DIFF_CHARS = 12_000;
export const POINTS_PER_QUESTION = 3;
/** A pass needs two thirds of the points and no question left at zero. */
export const PASS_SHARE = 2 / 3;

export const passMark = (questions: number) => Math.ceil(questions * POINTS_PER_QUESTION * PASS_SHARE);

export const DiffLineZ = z.object({
  /** 0-based index into the session's diff (stable id for anchors). */
  i: z.number().int().min(0),
  file: z.string(),
  kind: z.enum(["add", "del", "ctx", "meta"]),
  /** Line number in the new file (added and context lines only). */
  newLine: z.number().int().positive().optional(),
  text: z.string(),
});
export type DiffLine = z.infer<typeof DiffLineZ>;

export const VivaQuestionZ = z.object({
  id: z.string(),
  kind: z.enum(VIVA_KINDS),
  /** The concept the question probes, e.g. "Layer caching" (names the idea, never the answer). */
  topic: z.string(),
  prompt: z.string().min(1).max(600),
  /** Diff line indices the question is about (always added lines that exist in this diff). */
  anchor: z.array(z.number().int().min(0)).min(1).max(3),
  file: z.string(),
  /** A small breaking change to reason about (never a fix): "-" old line, "+" new line. */
  mutation: z.array(z.string().max(200)).max(4).optional(),
  /** True when the AI Tech Lead raised this topic in its review of the same PR. */
  fromReview: z.boolean(),
  maxScore: z.number().int().positive(),
});
export type VivaQuestion = z.infer<typeof VivaQuestionZ>;

export const VivaSourceKindZ = z.enum(["pod-issue", "sample", "custom"]);

export const VivaSourceZ = z.object({
  key: z.string(),
  kind: VivaSourceKindZ,
  podId: z.string().optional(),
  issueIndex: z.number().int().min(0).optional(),
  prNumber: z.number().int().positive(),
  prTitle: z.string(),
  prUrl: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  merged: z.boolean(),
  reviewerUserId: z.string().optional(),
  reviewerName: z.string().optional(),
  /** Added lines in the diff (a real count, shown on the picker). */
  addedLines: z.number().int().min(0),
});
export type VivaSource = z.infer<typeof VivaSourceZ>;

export const FlagZ = z.enum(["too-short", "keyword-list", "repeats-question", "copies-diff", "no-reasoning", "injection"]);
export type Flag = z.infer<typeof FlagZ>;

export const FLAG_LABEL: Record<Flag, string> = {
  "too-short": "Too short to show reasoning",
  "keyword-list": "Reads like a list of terms",
  "repeats-question": "Mostly repeats the question",
  "copies-diff": "Pastes the code instead of explaining it",
  "no-reasoning": "Names ideas without saying why",
  injection: "Text addressed to an AI grader",
};

export const QuestionGradeZ = z.object({
  questionId: z.string(),
  score: z.number().int().min(0),
  maxScore: z.number().int().positive(),
  /** Concept labels the answer covered and missed (labels name ideas, not answers). */
  covered: z.array(z.string()),
  missing: z.array(z.string()),
  /** One Socratic follow-up question. Never the solution. */
  feedback: z.string(),
  flags: z.array(FlagZ),
  verdict: z.enum(["explained", "partial", "missed"]),
  mode: z.enum(["text", "voice"]),
  words: z.number().int().min(0),
});
export type QuestionGrade = z.infer<typeof QuestionGradeZ>;

export const VivaResultZ = z.object({
  score: z.number().int().min(0),
  maxScore: z.number().int().positive(),
  passMark: z.number().int().positive(),
  passed: z.boolean(),
  perQuestion: z.array(QuestionGradeZ),
  /** keystone-interview evidence written on a pass (rung 3). */
  evidenceId: z.string().optional(),
  evidenceLevel: z.number().int().min(0).max(3).optional(),
  ladderBefore: z.number().int().min(0).max(3),
  ladderAfter: z.number().int().min(0).max(3),
  /** The skill's Proof Ladder after grading (read back from the ladder engine, not computed here). */
  rungs: z.array(LadderRungZ),
  reviewerFlagged: z.boolean(),
  summary: z.string(),
  gradedBy: z.enum(["rules", "rules+llm"]),
  runId: z.string(),
  gradedAt: z.string(),
});
export type VivaResult = z.infer<typeof VivaResultZ>;

export const VivaStatusZ = z.enum(["open", "passed", "re-viva", "cleared"]);
export type VivaStatus = z.infer<typeof VivaStatusZ>;

export const VivaSessionZ = z.object({
  id: z.string(),
  userId: z.string(),
  studentName: z.string(),
  source: VivaSourceZ,
  diff: z.array(DiffLineZ),
  questions: z.array(VivaQuestionZ).min(1).max(3),
  status: VivaStatusZ,
  attempts: z.number().int().min(0),
  /** Sticky integrity flags (e.g. an answer addressed to the AI): only the reviewer can clear them. */
  integrity: z.array(z.string()),
  reviewHints: z.number().int().min(0),
  injectionInDiff: z.boolean(),
  createdAt: z.string(),
  runId: z.string(),
  result: VivaResultZ.optional(),
  reviewerNote: z.string().optional(),
  /** The latest attempt's answers: visible to the student and their reviewer only. */
  answers: z.array(z.object({ questionId: z.string(), text: z.string(), mode: z.enum(["text", "voice"]) })).optional(),
  /** DEMO_MODE only: two prepared answer sets aligned to the questions, so the demo runs in seconds. */
  demo: z.object({ honest: z.array(z.string()), gamed: z.array(z.string()) }).optional(),
});
export type VivaSession = z.infer<typeof VivaSessionZ>;

export type VivaSessionSummary = Pick<VivaSession, "id" | "userId" | "studentName" | "status" | "attempts" | "integrity" | "createdAt"> & {
  prTitle: string; prNumber: number; skillName: string; score?: number; maxScore?: number; weakTopics: string[];
};

export interface VivaOverview {
  userId: string;
  name: string;
  sources: VivaSource[];
  sessions: VivaSessionSummary[];
  reviewQueue: VivaSessionSummary[];
  session: VivaSession | null;
  demo: boolean;
}

// ---------- request bodies ----------

export const SourceRefZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pod-issue"), podId: z.string().min(1).max(64), issueIndex: z.number().int().min(0).max(50) }),
  z.object({ kind: z.literal("sample") }),
  z.object({
    kind: z.literal("custom"),
    title: z.string().trim().min(1).max(120),
    diff: z.string().min(20, "paste a unified diff (at least a few lines)").max(MAX_DIFF_CHARS),
    skillId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
  }),
]);
export type SourceRef = z.infer<typeof SourceRefZ>;

export const StartReqZ = z.object({ userId: z.string().min(1).max(64), source: SourceRefZ.optional() });

export const AnswerZ = z.object({
  questionId: z.string().min(1).max(16),
  text: z.string().max(MAX_ANSWER_CHARS),
  mode: z.enum(["text", "voice"]).default("text"),
});
export const GradeReqZ = z.object({
  userId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(120),
  answers: z.array(AnswerZ).min(1).max(3),
});
export type GradeReq = z.infer<typeof GradeReqZ>;

export const ReviewReqZ = z.object({
  reviewerId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(120),
  decision: z.enum(["cleared", "keep"]),
  note: z.string().trim().max(300).optional(),
});
export type ReviewReq = z.infer<typeof ReviewReqZ>;

export const OverviewQueryZ = z.object({ userId: z.string().min(1).max(64), sessionId: z.string().min(1).max(120).optional() });
