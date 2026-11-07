// Live Lab Pulse: shared shapes (client-safe, no server imports).
// A lecturer's projector board for a live lab: where the room is stuck on a micro-challenge, aggregated and
// anonymous (groups of 10 or more only), plus an intervention suggestion the lecturer accepts or skips.
import { z } from "zod";

/** Aggregates about fewer students than this are never shown (same rule as Lecturer Insights). */
export const PULSE_ANONYMITY_MIN = 10;
/** A student is "stuck" on a criterion when it stayed unmet in this many checks in a row (wheel-spinning, Beck and Gong 2013). */
export const STUCK_CHECKS = 3;
/** No help is suggested before this minute: the productive-struggle window (Kapur, 2008). */
export const PRODUCTIVE_STRUGGLE_MIN = 5;
/** A criterion becomes a sticking point when nearly a third of the room (30%) is stuck on it. */
export const STUCK_TRIGGER = 0.3;
/** Peer Instruction bands (Crouch and Mazur, 2001): under 30% have it, re-teach; 30–70%, peer discussion; above, move on. */
export const MAZUR_RETEACH_BELOW = 0.3;
export const MAZUR_PEER_UP_TO = 0.7;
/** After a lecturer acts on (or skips) a criterion, the board watches it for this long before suggesting again. */
export const WATCH_MINUTES = 6;
export const SNOOZE_MINUTES = 3;

export const PulseSourceZ = z.enum(["simulated", "live"]);
export type PulseSource = z.infer<typeof PulseSourceZ>;

export const InterventionKindZ = z.enum(["explain", "peer", "nudge"]);
export type InterventionKind = z.infer<typeof InterventionKindZ>;

export const SuggestionKindZ = z.enum(["hold", "explain", "peer", "nudge", "watch"]);
export type SuggestionKind = z.infer<typeof SuggestionKindZ>;

export const CriterionStateZ = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["rubric", "check"]),
  /** Short teaching name, e.g. "layer caching". */
  concept: z.string(),
  met: z.number().int().min(0),
  stuck: z.number().int().min(0),
  working: z.number().int().min(0),
  notStarted: z.number().int().min(0),
  /** Whole percentages of the cohort (cohortSize). */
  metPct: z.number().int().min(0).max(100),
  stuckPct: z.number().int().min(0).max(100),
});
export type CriterionState = z.infer<typeof CriterionStateZ>;

export const TimeBucketIdZ = z.enum(["not-started", "lt2", "2to4", "4to6", "6plus", "finished"]);
export const TimeBucketZ = z.object({ id: TimeBucketIdZ, label: z.string(), students: z.number().int().min(0) });
export type TimeBucket = z.infer<typeof TimeBucketZ>;

export const ExplainerZ = z.object({
  title: z.string().min(1).max(120),
  minutes: z.number().int().min(1).max(10),
  points: z.array(z.string().min(1).max(400)).min(1).max(4),
  /** A Socratic question for the room (the rubric's own hint). */
  askTheRoom: z.string().min(1).max(400),
  /** What the lecturer should not do, so students still make the change themselves. */
  avoid: z.string().min(1).max(200),
});
export type Explainer = z.infer<typeof ExplainerZ>;

export const SuggestionZ = z.object({
  kind: SuggestionKindZ,
  criterionId: z.string().nullable(),
  headline: z.string(),
  action: z.string(),
  rationale: z.string(),
  minutes: z.number().int().min(0).max(10),
  explainer: ExplainerZ.nullable(),
});
export type Suggestion = z.infer<typeof SuggestionZ>;

export const InterventionZ = z.object({
  id: z.string(),
  minute: z.number().min(0),
  criterionId: z.string(),
  concept: z.string(),
  kind: InterventionKindZ,
  decision: z.enum(["run", "skip"]),
  decidedAt: z.string(),
  /** Students who had met the criterion, and who were stuck on it, when the lecturer decided. */
  metBefore: z.number().int().min(0),
  stuckBefore: z.number().int().min(0),
});
export type Intervention = z.infer<typeof InterventionZ>;

export const EffectZ = z.object({
  interventionId: z.string(),
  criterionId: z.string(),
  concept: z.string(),
  kind: InterventionKindZ,
  minute: z.number(),
  minutesSince: z.number(),
  metBefore: z.number().int(),
  metNow: z.number().int(),
  stuckBefore: z.number().int(),
  stuckNow: z.number().int(),
});
export type Effect = z.infer<typeof EffectZ>;

export const TimelinePointZ = z.object({
  minute: z.number(),
  /** Share of the cohort (0–100) who have met the focus criterion. */
  focusMetPct: z.number().int().min(0).max(100),
  /** Share of the cohort (0–100) who have passed the challenge. */
  passedPct: z.number().int().min(0).max(100),
});
export type TimelinePoint = z.infer<typeof TimelinePointZ>;

/** Why this lab matters, from Lecturer Insights (the skill's rank among gaps no module covers). */
export const PulseContextZ = z.object({
  gapRank: z.number().int().nullable(),
  demandPct: z.number().int().nullable(),
  roleName: z.string().nullable(),
});
export type PulseContext = z.infer<typeof PulseContextZ>;

export const PulseSnapshotZ = z.object({
  sessionId: z.string(),
  source: PulseSourceZ,
  challengeId: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  challengeTitle: z.string(),
  labMinutes: z.number().int(),
  minute: z.number().min(0),
  cohortSize: z.number().int().min(0),
  started: z.number().int().min(0),
  passed: z.number().int().min(0),
  finished: z.number().int().min(0),
  submissions: z.number().int().min(0),
  medianPassMinutes: z.number().nullable(),
  suppressed: z.boolean(),
  criteria: z.array(CriterionStateZ),
  timeOnTask: z.array(TimeBucketZ),
  focusCriterionId: z.string().nullable(),
  hotspot: z.object({
    criterionId: z.string(), concept: z.string(), title: z.string(),
    stuck: z.number().int(), stuckPct: z.number().int(), met: z.number().int(), metPct: z.number().int(),
  }).nullable(),
  suggestion: SuggestionZ.nullable(),
  effects: z.array(EffectZ),
  timeline: z.array(TimelinePointZ),
  context: PulseContextZ.nullable(),
  /** One plain sentence on where every number came from. */
  receipt: z.string(),
});
export type PulseSnapshot = z.infer<typeof PulseSnapshotZ>;

export const PulseSessionZ = z.object({
  id: z.string(),
  challengeId: z.string(),
  programmeId: z.string(),
  source: PulseSourceZ,
  startedAt: z.string(),
  labMinutes: z.number().int(),
  runId: z.string(),
  interventions: z.array(InterventionZ),
  /** Suggestion keys already announced on the Activity panel (so each is announced once). */
  announced: z.array(z.string()),
  /** Seed of the simulated cohort (fixed in DEMO_MODE so every demo plays the same lab). */
  seed: z.string().optional(),
  /** The lab minute the board last showed (so the Coach tool reads what the lecturer sees). */
  lastMinute: z.number().optional(),
});
export type PulseSession = z.infer<typeof PulseSessionZ>;

// ---------- API requests ----------

const IdZ = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/, "letters, digits, _ and - only");

export const SessionCreateReqZ = z.object({
  challengeId: IdZ.optional(),
  programmeId: IdZ.optional(),
  source: PulseSourceZ.optional(),
});
export const SnapshotQueryZ = z.object({
  sessionId: IdZ,
  minute: z.coerce.number().min(0).max(120).optional(),
});
export const DecideReqZ = z.object({
  sessionId: IdZ,
  minute: z.number().min(0).max(120),
  criterionId: IdZ,
  kind: InterventionKindZ,
  decision: z.enum(["run", "skip"]),
  /** Optional steer from the lecturer, e.g. "use the coffee-order analogy". Treated as untrusted text. */
  note: z.string().max(280).optional(),
});
export type DecideReq = z.infer<typeof DecideReqZ>;

export const SessionStartZ = z.object({ session: PulseSessionZ, snapshot: PulseSnapshotZ, runId: z.string() });
export type SessionStart = z.infer<typeof SessionStartZ>;
export const DecisionResultZ = z.object({
  intervention: InterventionZ,
  explainer: ExplainerZ.nullable(),
  runId: z.string(),
  usedFallback: z.boolean(),
});
export type DecisionResult = z.infer<typeof DecisionResultZ>;

export const KIND_LABEL: Record<InterventionKind, string> = {
  explain: "mini-explanation",
  peer: "peer discussion",
  nudge: "hint on screen",
};

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
