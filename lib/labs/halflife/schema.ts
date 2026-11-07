// Skill Half-life Radar: the typed contract shared by the agent, the API routes, the Coach tool and the page.
// Pure zod, safe to import on the client.
import { z } from "zod";

export const SAFE_PROGRAMME_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
export const MODULE_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/;

export const HalfLifeQueryZ = z.object({
  programmeId: z.string().regex(SAFE_PROGRAMME_ID, "programme id: letters, digits, - and _").default("uom-bsc-cs"),
  horizonYears: z.coerce.number().int().min(1).max(6).default(3),
  /** "1" forces the deterministic path (recorded trends, template notes, no model call). */
  demo: z.enum(["1", "true"]).optional(),
});
export type HalfLifeQuery = z.infer<typeof HalfLifeQueryZ>;

export const TrendLabelZ = z.enum(["rising", "stable", "declining"]);

export const TaughtSkillZ = z.object({
  skillId: z.string(),
  name: z.string(),
  level: z.number().int().min(1).max(3),
  /** "syllabus" = listed on the module; "topics" = found in its topics or learning outcomes. */
  source: z.enum(["syllabus", "topics"]),
  tracked: z.boolean(),
  label: TrendLabelZ.optional(),
  growthPerYear: z.number().optional(),
  /** Share of hiring posts that mention the skill (fitted value at the last month), 0..1. */
  shareNow: z.number().optional(),
  shareAtHorizon: z.number().optional(),
  /** Years until this one skill's share halves; null when it is not falling. */
  halfLifeYears: z.number().nullable().optional(),
});
export type TaughtSkill = z.infer<typeof TaughtSkillZ>;

export const DriftSkillZ = z.object({
  skillId: z.string(),
  name: z.string(),
  growthPerYear: z.number(),
  /** Cohort-weighted share of target-role job ads asking for it, as a whole percent. */
  cohortDemandPct: z.number(),
  /** The taught skill it sits next to, and how. */
  via: z.object({ skillId: z.string(), name: z.string(), kind: z.enum(["prereq", "co-occurs"]), why: z.string() }),
  /** Other modules in the programme that already teach it (then it is not counted as drift). */
  coveredBy: z.array(z.string()),
  /** Contribution to the drift score, in urgency points. */
  points: z.number(),
});
export type DriftSkill = z.infer<typeof DriftSkillZ>;

export const CurvePointZ = z.object({
  month: z.string(),
  /** Module demand index, today = 100. */
  index: z.number(),
  kind: z.enum(["history", "forecast"]),
});

export const RefreshNoteZ = z.object({
  kind: z.enum(["rebalance", "extend"]),
  text: z.string().min(1).max(600),
  skillIds: z.array(z.string()).min(1),
  learningOutcomeIndex: z.number().int().min(0),
  learningOutcome: z.string(),
  source: z.enum(["template", "llm"]),
  /** For a rebalance note: the rising skill demand is moving to, with the numbers the note quotes (its receipt). */
  successor: z.object({
    skillId: z.string(),
    name: z.string(),
    growthPerYear: z.number(),
    /** Share of hiring posts that mention it today (fitted value at the last month), 0..1. */
    shareNow: z.number(),
  }).optional(),
});
export type RefreshNote = z.infer<typeof RefreshNoteZ>;

export const DecisionZ = z.object({
  id: z.string(),
  programmeId: z.string(),
  moduleCode: z.string(),
  decision: z.enum(["adopted", "dismissed"]),
  note: z.string(),
  learningOutcome: z.string().optional(),
  skillIds: z.array(z.string()),
  urgency: z.number(),
  halfLifeYears: z.number().nullable(),
  decidedAt: z.string(),
  decidedBy: z.literal("module-lead"),
  runId: z.string(),
});
export type Decision = z.infer<typeof DecisionZ>;

export const ModuleHalfLifeZ = z.object({
  code: z.string(),
  title: z.string(),
  year: z.number(),
  semester: z.string(),
  taught: z.array(TaughtSkillZ),
  /** Share of the module's taught weight that has a market forecast, 0..1. */
  trackedShare: z.number(),
  /** Years until demand for the module's tracked topics halves; null when it does not halve within the cap. */
  halfLifeYears: z.number().nullable(),
  status: z.enum(["decaying", "durable", "growing", "no-signal"]),
  /** Module demand index at the horizon, today = 1. Null with no tracked skills. */
  retainedAtHorizon: z.number().nullable(),
  curve: z.array(CurvePointZ),
  drift: z.array(DriftSkillZ),
  urgency: z.number().min(0).max(100),
  urgencyParts: z.object({ decay: z.number(), drift: z.number() }),
  refreshNote: RefreshNoteZ.nullable(),
  /** Set when the syllabus text for this module looked like an instruction to an AI (it is then never sent to a model). */
  flagged: z.boolean(),
  decision: DecisionZ.nullable(),
});
export type ModuleHalfLife = z.infer<typeof ModuleHalfLifeZ>;

export const HalfLifeReportZ = z.object({
  programmeId: z.string(),
  programmeName: z.string(),
  university: z.string(),
  horizonYears: z.number(),
  horizonMonth: z.string(),
  lastDataMonth: z.string(),
  modules: z.array(ModuleHalfLifeZ),
  stats: z.object({
    modules: z.number(),
    forecastsUsed: z.number(),
    edgesUsed: z.number(),
    needsRefresh: z.number(),
    decaying: z.number(),
  }),
  cohort: z.object({
    size: z.number(),
    suppressed: z.boolean(),
    roleMix: z.array(z.object({ roleId: z.string(), pct: z.number() })),
  }),
  trace: z.array(z.string()),
  generatedAt: z.string(),
  runId: z.string(),
});
export type HalfLifeReport = z.infer<typeof HalfLifeReportZ>;

export const DecideReqZ = z.object({
  programmeId: z.string().regex(SAFE_PROGRAMME_ID).default("uom-bsc-cs"),
  moduleCode: z.string().regex(MODULE_CODE, "module code"),
  decision: z.enum(["adopted", "dismissed"]),
  /** The module lead's edited note (optional; defaults to the drafted note). */
  note: z.string().trim().min(1).max(600).optional(),
  /** The horizon the module lead was looking at, so the stored urgency matches what they saw. */
  horizonYears: z.number().int().min(1).max(6).default(3),
  /** true when the page was on the recorded demo data (?demo=1), so the decision uses the same numbers. */
  demo: z.boolean().optional(),
});
export type DecideReq = z.infer<typeof DecideReqZ>;

/** A module needs a refresh at this urgency or above. */
export const REFRESH_AT = 10;
