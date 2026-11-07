// Shortest Path to Opportunity: shared types and zod schemas (isomorphic: the page imports the types).
import { z } from "zod";
import type { SkillId, SkillStatus } from "@/lib/types";

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
export const PathSkillIdZ = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case skill id").max(40);

export const OpportunityKindZ = z.enum([
  "summer-internship", "placement-year", "spring-insight", "research-internship", "open-source-programme", "graduate-role",
]);
export type OpportunityKind = z.infer<typeof OpportunityKindZ>;

/** A placement or internship. `requires` is AND over groups, OR inside a group ("PyTorch or TensorFlow"). */
export const OpportunityZ = z.object({
  id: z.string().regex(SAFE_ID),
  title: z.string().min(1).max(120),
  employer: z.string().min(1).max(80),
  kind: OpportunityKindZ,
  roleId: z.string().regex(SAFE_ID),
  location: z.string().max(60),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  requires: z.array(z.array(PathSkillIdZ).min(1).max(4)).min(1).max(8),
  nice: z.array(PathSkillIdZ).max(8).default([]),
  blurb: z.string().max(240),
  source: z.enum(["demo", "firecrawl"]),
  url: z.string().url().optional(),
});
export type Opportunity = z.infer<typeof OpportunityZ>;

export const OpportunityFileZ = z.object({
  label: z.literal("demo"),
  note: z.string(),
  snapshotAt: z.string(),
  opportunities: z.array(OpportunityZ).min(1).max(40),
});

export const EffortFileZ = z.object({
  label: z.string(),
  note: z.string(),
  hours: z.record(z.string(), z.number().min(1).max(200)),
  byCategory: z.record(z.string(), z.number().min(1).max(200)),
});
export type EffortTable = z.infer<typeof EffortFileZ>;

/** have = you can already show it · degree = a module teaches it before the deadline · learn = self-study. */
export type StepMode = "have" | "degree" | "learn";

export interface PathStep {
  skillId: SkillId;
  name: string;
  mode: StepMode;
  status: SkillStatus;
  /** Self-study hours (0 for have/degree). */
  hours: number;
  hoursSource: "roadmap" | "estimate" | "none";
  /** The roadmap week that already plans this skill, if any. */
  roadmapWeek?: number;
  /** Your evidence already shows level 1 ("tried it"), so the hours are reduced. */
  started?: boolean;
  /** ISO date the step begins (learn) and the date you'll have it by (learn and degree). */
  startsOn?: string;
  readyBy?: string;
  moduleCode?: string;
  moduleTitle?: string;
  /** Prerequisites inside this path (for the graph and the order). */
  prereqs: SkillId[];
  /** The opportunity asks for it directly (not only as a prerequisite). */
  required: boolean;
  /** Share of the opportunity's role ads that ask for it, 0..100, when the Market Agent has it. */
  demandPct?: number;
}

export interface PathEdge { source: SkillId; target: SkillId | "goal"; kind: "prereq" | "requires" | "alternative" }

/** A rejected option of an "A or B" requirement and what it would have cost on top. */
export interface PathAlternative {
  chosen: SkillId;
  chosenName: string;
  instead: SkillId;
  insteadName: string;
  extraHours: number;
  extraSkills: string[];
  reason: string;
}

export type PathState = "apply-now" | "within-reach" | "next-round" | "no-deadline";

export interface OpportunityPath {
  opportunity: Opportunity;
  state: PathState;
  skillsToLearn: number;
  degreeSkills: number;
  studyHours: number;
  studyWeeks: number;
  /** ISO date you could apply from (today when state is apply-now). */
  readyBy: string;
  /** Days between readyBy and the deadline (negative: you'd miss it). */
  slackDays?: number;
  /** Fit 0..100 today and once the path is done. */
  fitNow: number;
  fitReady: number;
  steps: PathStep[];
  edges: PathEdge[];
  alternatives: PathAlternative[];
  /** Skill combinations the search compared for this opportunity. */
  combosSearched: number;
  headline: string;
}

export interface KeystoneSkill { skillId: SkillId; name: string; count: number; of: number }

export interface PathwayResult {
  userId: string;
  firstName: string;
  roleId: string;
  /** "now" used for the dates (fixed in DEMO_MODE so the demo is deterministic). */
  asOf: string;
  hoursPerWeek: number;
  source: "demo" | "demo+live";
  paths: OpportunityPath[];
  /** The learn skill that sits on the most open paths. */
  keystone?: KeystoneSkill;
  /** Listings whose deadline has already passed (left out). */
  closed: number;
  /** Live search results dropped by the injection shield. */
  droppedUnsafe: number;
  combosSearched: number;
  /** Whether your roadmap already holds a path from this page (for Undo). */
  applied?: { opportunityId: string; title: string; employer: string; version: number };
  runId?: string;
}

export interface RoadmapChange {
  skillId: SkillId;
  name: string;
  kind: "moved" | "added";
  fromWeek?: number;
  toWeek: number;
  hours: number;
}

export interface RoadmapPreview {
  opportunityId: string;
  title: string;
  employer: string;
  currentVersion: number;
  nextVersion: number;
  changes: RoadmapChange[];
  degreeNotes: string[];
  /** Steps that start after a module ends, beyond the roadmap's weeks: they join at the next re-plan. */
  laterNotes: string[];
  weeks: { week: number; startDate: string; skillId: SkillId; name: string; changed: boolean }[];
}

// ---------- request schemas ----------
export const PathwayQueryZ = z.object({ demo: z.enum(["1", "true"]).optional() });
export const AddToRoadmapReqZ = z.object({
  opportunityId: z.string().regex(SAFE_ID),
  /** Only a person sets this, by pressing "Approve and add" in the dialog. */
  approved: z.boolean().default(false),
  rememberGoal: z.boolean().default(false),
  demo: z.boolean().optional(),
});
export const UndoReqZ = z.object({ demo: z.boolean().optional() });
