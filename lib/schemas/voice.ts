import { z } from "zod";

const Score = z.number().int().min(1).max(5);

export const InterviewFeedbackZ = z.object({
  userId: z.string(),
  roleId: z.string(),
  scores: z.object({ content: Score, structure: Score, clarity: Score, confidence: Score }),
  fillerWordsPerMin: z.number().min(0),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  transcript: z.string().optional(),
  createdAt: z.string(),
});

export const BriefingZ = z.object({
  userId: z.string(),
  weekOf: z.string(),
  script: z.string().min(1),
  audioUrl: z.string().optional(),
  topTasks: z.array(z.string()),
  marketMoves: z.array(z.string()),
});

export const FeedbackReqZ = z.object({
  userId: z.string(),
  roleId: z.string(),
  transcript: z.string().min(1),
  durationSec: z.number().positive(),
});

export const TtsReqZ = z.object({ text: z.string().min(1).max(2500), voiceId: z.string().optional() });

// `agent=onboard` returns a signed URL for the Onboarding Coach (VoiceOnboardButton) instead of the Interviewer.
export const InterviewConfigQueryZ = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1).optional(),
  agent: z.enum(["interview", "onboard"]).default("interview"),
});

export const WorkflowNameZ = z.enum([
  "pod-kickoff",
  "monday-briefing",
  "market-refresh",
  "pod-nudge",
  "opportunity-watcher",
  "newcomer-welcome",
]);

export const TriggerReqZ = z.object({ payload: z.record(z.string(), z.unknown()).default({}) });

export const CallbackReqZ = z.object({ workflow: z.string().min(1), result: z.record(z.string(), z.unknown()).default({}) });

// Text-mode interview turn (used when voice is unavailable).
export const InterviewTurnZ = z.object({ role: z.enum(["ai", "user"]), text: z.string() });
export const NextQuestionReqZ = z.object({
  history: z.array(InterviewTurnZ).max(40),
  vars: z.record(z.string(), z.string()),
});
