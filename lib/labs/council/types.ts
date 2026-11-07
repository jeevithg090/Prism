// Keystone Labs · Agent Council: the shared, client-safe shapes (zod first, types inferred).
// Three advocates argue one motion ("Docker in week 1") from different data, rebut each other once, and a judge
// rules with the strongest counter-argument kept on record. The student accepts or overrules.
import { z } from "zod";
import type { AgentName } from "@/lib/types";

export const SEATS = ["market", "degree", "wellbeing"] as const;
export type Seat = (typeof SEATS)[number];

/** The closest existing agent identity for each seat (lib/types AgentName is the contract, so no new names). */
export const SEAT_AGENT: Record<Seat, AgentName> = { market: "market", degree: "syllabus", wellbeing: "roadmap" };
export const JUDGE_AGENT: AgentName = "orchestrator";

export const SEAT_LABEL: Record<Seat, string> = {
  market: "Market advocate",
  degree: "Degree advocate",
  wellbeing: "Wellbeing advocate",
};
export const SEAT_ARGUES_FROM: Record<Seat, string> = {
  market: "job-ad demand and the trend forecast",
  degree: "what your syllabus teaches, and when",
  wellbeing: "your hours, constraints and exam weeks",
};

/** How much each seat's score counts in the judge's net score. Shown on the page; they sum to 1. */
export const SEAT_WEIGHT: Record<Seat, number> = { market: 0.35, degree: 0.35, wellbeing: 0.3 };

export const StanceZ = z.enum(["support", "caution", "oppose"]);
export type Stance = z.infer<typeof StanceZ>;

/** One fact an argument rests on, with where it came from. No receipt, no argument. */
export const CouncilReceiptZ = z.object({
  label: z.string().min(3).max(220),
  source: z.string().min(3).max(120),
  ref: z.string().min(3).max(160),
});
export type CouncilReceipt = z.infer<typeof CouncilReceiptZ>;

export const AdjustmentZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("refresher"), skillId: z.string(), skillName: z.string(), hours: z.number().int().min(1).max(3), moduleCode: z.string().optional(), text: z.string() }),
  z.object({ kind: z.literal("trim"), toHours: z.number().int().min(1).max(40), text: z.string() }),
]);
export type Adjustment = z.infer<typeof AdjustmentZ>;

export const ArgumentZ = z.object({
  seat: z.enum(SEATS),
  agent: z.string(),
  stance: StanceZ,
  /** −1 (against) … +1 (for), two decimals. */
  score: z.number().min(-1).max(1),
  headline: z.string().min(3).max(160),
  body: z.string().min(3).max(600),
  receipts: z.array(CouncilReceiptZ).min(1).max(5),
  adjustment: AdjustmentZ.optional(),
  /** True when an LLM reworded the rule-based text and the grounding check accepted it. */
  polished: z.boolean(),
});
export type CouncilArgument = z.infer<typeof ArgumentZ>;

export const RebuttalZ = z.object({
  from: z.enum(SEATS),
  target: z.enum(SEATS),
  text: z.string().min(3).max(400),
  /** A rebuttal lands when the data backs it; then it moves the target's score toward the rebutter's. */
  lands: z.boolean(),
  shift: z.number().min(0).max(1),
});
export type Rebuttal = z.infer<typeof RebuttalZ>;

export const DecisionKindZ = z.enum(["keep", "adjust", "move", "skip"]);
export type VerdictKind = z.infer<typeof DecisionKindZ>;

export const VerdictZ = z.object({
  decision: DecisionKindZ,
  title: z.string().min(3).max(160),
  summary: z.string().min(3).max(600),
  net: z.number().min(-1).max(1),
  initialScores: z.record(z.enum(SEATS), z.number()),
  finalScores: z.record(z.enum(SEATS), z.number()),
  changes: z.array(AdjustmentZ).max(3),
  /** For "move": the week the judge proposes instead, and what it swaps with. */
  moveTo: z.object({ week: z.number().int().min(1).max(52), gain: z.number().optional(), swapWithSkillId: z.string().optional(), swapWithSkillName: z.string().optional() }).optional(),
  /** The strongest case against the ruling. Never dropped (the dissentKept guardrail restores it). */
  dissent: z.object({ seat: z.enum(SEATS), stance: StanceZ, headline: z.string(), receipt: CouncilReceiptZ }).nullable(),
  agreement: z.enum(["unanimous", "majority", "split"]),
});
export type Verdict = z.infer<typeof VerdictZ>;

export const MotionSourceZ = z.enum(["roadmap", "reschedule", "skipped", "new"]);
export type MotionSource = z.infer<typeof MotionSourceZ>;

export const MotionZ = z.object({
  skillId: z.string(),
  skillName: z.string(),
  week: z.number().int().min(1).max(12),
  /** "Docker in week 1", "Statistics now". */
  label: z.string(),
  source: MotionSourceZ,
  /** The roadmap week that holds this skill today (null when it isn't on the plan). */
  plannedWeek: z.number().int().nullable(),
  startDate: z.string(),
});
export type Motion = z.infer<typeof MotionZ>;

export const DecisionZ = z.object({
  choice: z.enum(["accept", "overrule"]),
  decidedAt: z.string(),
  /** True when the decision rewrote the roadmap (store `roadmaps`). */
  applied: z.boolean(),
  roadmapVersion: z.number().int().optional(),
  changedWeeks: z.array(z.number().int()),
  summary: z.string(),
  reason: z.string().max(240).optional(),
  ledgerEntryId: z.string().optional(),
});
export type CouncilDecision = z.infer<typeof DecisionZ>;

export const CouncilSessionZ = z.object({
  id: z.string(),
  userId: z.string(),
  runId: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  motion: MotionZ,
  /** The student's own words, PII-redacted and scanned; shown as data, never used as instructions. */
  question: z.string().max(240).optional(),
  injection: z.object({ risk: z.enum(["none", "low", "high"]), findings: z.number().int() }).optional(),
  arguments: z.array(ArgumentZ).length(3),
  rebuttals: z.array(RebuttalZ).max(3),
  verdict: VerdictZ,
  /** What each choice would do to the roadmap, in one plain sentence (shown before the student decides). */
  consequences: z.object({ accept: z.string(), overrule: z.string() }),
  ledgerEntryIds: z.array(z.string()),
  roadmapVersion: z.number().int().nullable(),
  createdAt: z.string(),
  decision: DecisionZ.optional(),
});
export type CouncilSession = z.infer<typeof CouncilSessionZ>;

export interface MotionOption {
  skillId: string;
  skillName: string;
  week: number;
  label: string;
  source: MotionSource;
  group: "roadmap" | "skipped";
}

export interface CouncilSummary {
  id: string;
  motion: string;
  verdict: string;
  decision: VerdictKind;
  choice: CouncilDecision["choice"] | null;
  createdAt: string;
}

export interface CouncilOverview {
  userId: string;
  name: string;
  roleName: string;
  roadmapVersion: number | null;
  options: MotionOption[];
  skills: { skillId: string; name: string }[];
  weeks: { week: number; startDate: string; focusSkillId: string; isExamWeek: boolean }[];
  sessions: CouncilSummary[];
  current: CouncilSession | null;
  /** What each seat will read, with real counts (shown before the first debate). */
  sources: {
    ads: number | null; trendSeries: number; trendMonths: number | null; modules: number; programme: string | null;
    hoursPerWeek: number; constraints: number; examWeeks: number; weeks: number;
  };
  demo: boolean;
}

// ---------- requests ----------

const SafeId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "a Keystone id like \"aisha\"");
const SkillId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case skill id").max(40);

export const ConveneReqZ = z.object({
  userId: SafeId,
  skillId: SkillId.optional(),
  week: z.number().int().min(1).max(12).optional(),
  question: z.string().max(240).optional(),
  runId: z.string().regex(/^run_[A-Za-z0-9_-]{6,16}$/).optional(),
});
export type ConveneReq = z.infer<typeof ConveneReqZ>;

export const DecideReqZ = z.object({
  userId: SafeId,
  sessionId: z.string().regex(/^council_[A-Za-z0-9_-]{6,40}$/),
  choice: z.enum(["accept", "overrule"]),
  reason: z.string().max(240).optional(),
});
export type DecideReq = z.infer<typeof DecideReqZ>;

export const OverviewQueryZ = z.object({ userId: SafeId, session: z.string().regex(/^council_[A-Za-z0-9_-]{6,40}$/).optional() });

// ---------- shared formatting ----------

export const STANCE_LABEL: Record<Stance, string> = { support: "Supports", caution: "Cautions", oppose: "Opposes" };

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  keep: "Keep it",
  adjust: "Keep it, with changes",
  move: "Move it",
  skip: "Skip it",
};

/** How the kept dissent is introduced: against a "yes", or for a "no" (softer when it shares the ruling's side). */
export function dissentLabel(decision: VerdictKind, stance: Stance): string {
  const pro = decision === "keep" || decision === "adjust";
  if (pro) return stance === "support" ? "Strongest reservation" : "On record against";
  return stance === "oppose" ? "Closest to a case for it" : "On record for it";
}

/** +0.47 / −0.12, for scores on the page. */
export function signed(x: number): string {
  const v = Math.round(x * 100) / 100;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
}
