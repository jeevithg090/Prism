// P4 · Voice + automation zod schemas (mock interview, briefing, TTS, n8n, ElevenLabs tools).
// Mirrors lib/types.ts (InterviewFeedback, Briefing); additive response fields are documented inline.
import { z } from "zod";
import { SkillIdZ } from "@/lib/schemas/community";

const Score = z.number().int().min(1).max(5);

export const InterviewScoresZ = z.object({ content: Score, structure: Score, clarity: Score, confidence: Score });

export const InterviewFeedbackZ = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  scores: InterviewScoresZ,
  fillerWordsPerMin: z.number().min(0),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  transcript: z.string().optional(),
  createdAt: z.string(),
});

/** POST /api/interview/feedback response: InterviewFeedback + what was saved as proof (additive). */
export const InterviewResultZ = InterviewFeedbackZ.extend({
  id: z.string(),
  durationSec: z.number(),
  /** The skill the interview asked about (the PR you merged), e.g. "docker". */
  skillId: SkillIdZ,
  skillName: z.string(),
  /** Evidence written with source "keystone-interview" (rung 3: "explained it"). */
  evidence: z.array(z.object({ id: z.string(), skillId: SkillIdZ, label: z.string(), level: z.number() })),
  /** "rules" = deterministic scoring only; "rules+llm" = refined by the LLM. */
  scoredBy: z.enum(["rules", "rules+llm"]),
});
export type InterviewResult = z.infer<typeof InterviewResultZ>;

export const FeedbackReqZ = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  transcript: z.string().trim().min(1, "transcript can't be empty").max(40_000),
  durationSec: z.number().positive().max(3600),
  /** Optional: the skill discussed; defaults to the skill of the user's latest merged pod PR. */
  skillId: SkillIdZ.optional(),
});
export type FeedbackReq = z.infer<typeof FeedbackReqZ>;

export const InterviewConfigQueryZ = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1).optional(),
});

/** agentId when ElevenLabs isn't configured: /interview runs Practice mode in the browser. */
export const PRACTICE_AGENT_ID = "practice";

export const InterviewConfigZ = z.object({
  agentId: z.string(),
  signedUrl: z.string().optional(),
  dynamicVariables: z.record(z.string(), z.string()),
});
export type InterviewConfig = z.infer<typeof InterviewConfigZ>;

export const BriefingZ = z.object({
  userId: z.string().min(1),
  weekOf: z.string(),
  script: z.string().min(1),
  audioUrl: z.string().optional(),
  topTasks: z.array(z.string()),
  marketMoves: z.array(z.string()),
});

export const TtsReqZ = z.object({ text: z.string().trim().min(1).max(2500), voiceId: z.string().regex(/^[A-Za-z0-9]{8,40}$/).optional() });

export const WORKFLOWS = ["market-refresh", "monday-briefing", "pod-kickoff", "pod-nudge", "opportunity-watcher", "newcomer-welcome"] as const;
export const WorkflowNameZ = z.enum(WORKFLOWS);

export const TriggerReqZ = z.object({ payload: z.record(z.string(), z.unknown()).default({}) });
export const CallbackReqZ = z.object({ workflow: z.string().min(1), result: z.record(z.string(), z.unknown()).default({}) });

export const VOICE_TOOLS = ["get_profile", "get_role_skills", "log_interview", "save_dna"] as const;
export const VoiceToolZ = z.enum(VOICE_TOOLS);

export const SaveDnaReqZ = z.object({
  userId: z.string().min(1),
  targetRoles: z.array(z.string().min(1)).max(2).optional(),
  timelineLabel: z.string().max(120).optional(),
  hoursPerWeek: z.number().optional(),
  theoryPractice: z.number().optional(),
  budget: z.enum(["free", "paid-ok"]).optional(),
  constraints: z.array(z.string().max(80)).max(8).optional(),
});
