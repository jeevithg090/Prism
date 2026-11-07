import "server-only";
import { z } from "zod";
import { nanoid } from "nanoid";
import { llmJSON } from "@/lib/llm";
import { getStore } from "@/lib/store";
import type { EvidenceItem, InterviewFeedback, Level } from "@/lib/types";
import { roleName } from "./roles";

// ---------- Filler words ----------

const FILLER_RE = /\b(um+|uh+|erm+|you know|sort of|kind of|basically|literally)\b/gi;
// "like" only counts as a filler between commas (", like,") or at the start of a clause ("Like, ...", "... fine. Like, ...").
// "I like Python" is not a filler.
const LIKE_FILLER_RE = /(?:^|[,.;:!?])\s*like\s*,/gi;

function userLines(transcript: string): string[] {
  return transcript
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*user\s*:\s*(.*)$/i)?.[1])
    .filter((l): l is string => typeof l === "string");
}

function countFillers(line: string): number {
  return (line.match(FILLER_RE)?.length ?? 0) + (line.match(LIKE_FILLER_RE)?.length ?? 0);
}

// Filler words per minute in the candidate's lines only (`user:` prefix), rounded to 1 decimal place.
export function fillerWordsPerMin(transcript: string, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const count = userLines(transcript).reduce((n, l) => n + countFillers(l), 0);
  return Math.round((count / (durationSec / 60)) * 10) / 10;
}

// ---------- Scoring ----------

const SYSTEM =
  "You are an encouraging interview coach for university students. Score the CANDIDATE's answers only, 1-5 each for content (accuracy, depth), structure (clear situation→action→result), clarity (plain, concise), confidence (decisive, ownership). Give 2 specific strengths and 2 specific, actionable improvements quoting their words where possible.";

const Score = z.number().int().min(1).max(5);
export const InterviewScoringZ = z.object({
  scores: z.object({ content: Score, structure: Score, clarity: Score, confidence: Score }),
  strengths: z.array(z.string()).length(2),
  improvements: z.array(z.string()).length(2),
});
type Scoring = z.infer<typeof InterviewScoringZ>;

export const FILLER_TARGET_PER_MIN = 4;

// Used when the LLM is unavailable (no key, timeout, bad output): neutral scores and kind, generic tips.
function fallbackScoring(fillerRate: number): Scoring {
  const fillerTip = `You used about ${fillerRate} filler words a minute (aim for under ${FILLER_TARGET_PER_MIN}). When you need a moment to think, try a short pause instead of "um".`;
  const structureTip = "Shape each answer as situation → action → result, so every story has a clear ending.";
  const numberTip = "Add one concrete detail or number to each answer, such as what you built, how big it was, or what improved.";
  return {
    scores: { content: 3, structure: 3, clarity: 3, confidence: 3 },
    strengths: [
      "You practised out loud from start to finish. That's the best way to make real interviews feel familiar.",
      "You talked about your own experience, which is exactly what interviewers want to hear.",
    ],
    improvements: fillerRate > FILLER_TARGET_PER_MIN ? [fillerTip, structureTip] : [structureTip, numberTip],
  };
}

async function gradeWithLLM(roleId: string, transcript: string): Promise<Scoring> {
  const raw = await llmJSON({
    agent: "voice",
    system: SYSTEM,
    user: `ROLE: ${roleName(roleId)}\nTRANSCRIPT:\n${transcript.slice(0, 12000)}`,
    schema: InterviewScoringZ,
    schemaName: "interview_feedback",
    temperature: 0.3,
  });
  // Re-check the shape so a loosely-typed model response can never leak out-of-range scores.
  return InterviewScoringZ.parse(raw);
}

// Scoped per user: the store key is (collection, id), so a shared id would overwrite other students' evidence.
const evidenceId = (userId: string) => `ev_communication_keystone-interview_${userId}`;

function communicationEvidence(fb: InterviewFeedback, previous: EvidenceItem | null): EvidenceItem {
  const mean = (fb.scores.clarity + fb.scores.confidence) / 2;
  const level: Level = mean >= 3.5 ? 2 : 1;
  // Evidence is proof of what you've shown at least once, so a weaker practice run never lowers it.
  const keepPrevious = previous?.userId === fb.userId && previous.level > level;
  return {
    id: evidenceId(fb.userId),
    userId: fb.userId,
    skillId: "communication",
    level: keepPrevious ? previous.level : level,
    confidence: 0.6,
    source: "keystone-interview",
    url: "/interview",
    quote: keepPrevious
      ? previous.quote
      : `Practice interview for ${roleName(fb.roleId)}: clarity ${fb.scores.clarity}/5, confidence ${fb.scores.confidence}/5`,
    createdAt: fb.createdAt,
  };
}

export async function scoreInterview(i: {
  userId: string;
  roleId: string;
  transcript: string;
  durationSec: number;
}): Promise<InterviewFeedback> {
  const fillerRate = fillerWordsPerMin(i.transcript, i.durationSec);

  let scoring: Scoring;
  try {
    scoring = await gradeWithLLM(i.roleId, i.transcript);
  } catch {
    scoring = fallbackScoring(fillerRate);
  }

  const createdAt = new Date().toISOString();
  const fb: InterviewFeedback = {
    userId: i.userId,
    roleId: i.roleId,
    scores: scoring.scores,
    fillerWordsPerMin: fillerRate,
    strengths: scoring.strengths,
    improvements: scoring.improvements,
    transcript: i.transcript,
    createdAt,
  };

  // Persistence is best-effort: a store hiccup must never cost the student their feedback.
  const store = getStore();
  const interviewId = `${i.userId}_${Date.now()}`;
  const momentumId = nanoid();
  const previousEvidence = await store.get<EvidenceItem>("evidence", evidenceId(i.userId)).catch(() => null);
  const writes = await Promise.allSettled([
    store.upsert("interviews", interviewId, { id: interviewId, ...fb }, i.userId),
    store.upsert("momentum_events", momentumId, { id: momentumId, userId: i.userId, kind: "mock-interview", ts: createdAt }, i.userId),
    store.upsert("evidence", evidenceId(i.userId), communicationEvidence(fb, previousEvidence), i.userId),
  ]);
  for (const w of writes) if (w.status === "rejected") console.warn("[interview] could not save:", String(w.reason));

  return fb;
}
