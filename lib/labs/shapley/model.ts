// Readiness Explained · the explanation contract shared by the agent, the API route, the Coach tool and the page.
import { z } from "zod";

export const SourceKindZ = z.enum(["evidence", "module", "record", "beyond-map"]);
export type SourceKind = z.infer<typeof SourceKindZ>;

/** One source of readiness: a piece of evidence, a degree module, a recorded skill, or role demand off the map. */
export const ContributorZ = z.object({
  id: z.string(),
  kind: SourceKindZ,
  label: z.string(),
  detail: z.string(),
  /** Evidence source (github, keystone-pod, micro-challenge, …) or module term label. */
  origin: z.string().optional(),
  url: z.string().optional(),
  createdAt: z.string().optional(),
  /** Exact Shapley share of readiness, in percentage points (2 dp). */
  points: z.number(),
  /** Points readiness would lose if only this source disappeared. Less than `points` means it overlaps another. */
  leaveOneOut: z.number(),
  skills: z.array(z.object({ skillId: z.string(), name: z.string(), points: z.number() })),
  /** Evidence that counts for nothing yet because it's below the proof bar (level 2 at 60% confidence). */
  belowBar: z.object({ level: z.number(), confidence: z.number() }).optional(),
});
export type Contributor = z.infer<typeof ContributorZ>;

export const SkillShareZ = z.object({
  skillId: z.string(),
  name: z.string(),
  status: z.enum(["proven", "degree-done", "degree-upcoming", "gap"]),
  demandPct: z.number(),
  /** The most this skill can add to readiness (its demand weight), in points. */
  maxPoints: z.number(),
  points: z.number(),
  shares: z.array(z.object({ contributorId: z.string(), label: z.string(), kind: SourceKindZ, points: z.number() })),
  coalitions: z.number(),
});
export type SkillShare = z.infer<typeof SkillShareZ>;

export const ActionZ = z.object({
  id: z.string(),
  kind: z.enum(["roadmap", "challenge"]),
  skillId: z.string(),
  skillName: z.string(),
  title: z.string(),
  hours: z.number(),
  gainPoints: z.number(),
  pointsPerHour: z.number(),
  rung: z.enum(["Tried it", "Built it"]),
  href: z.string(),
  why: z.string(),
  week: z.number().optional(),
});
export type NextAction = z.infer<typeof ActionZ>;

export const MoverZ = z.object({ contributorId: z.string(), label: z.string(), kind: SourceKindZ, points: z.number() });
export type Mover = z.infer<typeof MoverZ>;

export const ExplanationZ = z.object({
  userId: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  firstName: z.string(),
  generatedAt: z.string(),
  /** "full": per-source Shapley · "skills": per-skill only (the fallback when sources can't be read). */
  mode: z.enum(["full", "skills"]),
  readiness: z.object({
    /** The Bridge Map's headline readiness, 0..1. */
    now: z.number(),
    projected: z.number(),
    /** The same formula over the skills on the map, in points. */
    mappedPoints: z.number(),
    /** Headline minus mapped, in points: demand the map's headline counts beyond the skills it shows. */
    beyondMapPoints: z.number(),
  }),
  contributors: z.array(ContributorZ),
  skills: z.array(SkillShareZ),
  groups: z.array(z.object({ kind: SourceKindZ, label: z.string(), points: z.number(), count: z.number() })),
  week: z.object({
    since: z.string(),
    fromPoints: z.number(),
    toPoints: z.number(),
    deltaPoints: z.number(),
    movers: z.array(MoverZ),
    lastChange: z.object({ weekOf: z.string(), deltaPoints: z.number() }).nullable(),
  }),
  timeline: z.array(z.object({ weekOf: z.string(), points: z.number() })),
  next: z.object({
    best: ActionZ.nullable(),
    firstStep: ActionZ.nullable(),
    actions: z.array(ActionZ),
    hoursPerWeek: z.number().nullable(),
  }),
  insights: z.array(z.string()),
  checks: z.object({
    players: z.number(),
    coalitions: z.number(),
    /** |Σ shares − readiness| in points; the efficiency axiom says 0. */
    efficiencyGap: z.number(),
    /** Largest |closed form − enumeration| across skills; 0 up to float error. */
    closedFormGap: z.number(),
  }),
});
export type Explanation = z.infer<typeof ExplanationZ>;

/** What the explainer writes to the store (`readiness_explanations`) for the Coach and other screens. */
export interface StoredExplanation {
  id: string;
  userId: string;
  roleId: string;
  readinessPct: number;
  top: { label: string; points: number }[];
  weekDeltaPoints: number;
  best: Pick<NextAction, "id" | "title" | "skillId" | "gainPoints" | "hours" | "pointsPerHour"> | null;
  generatedAt: string;
}

export const EXPLANATIONS = "readiness_explanations";
export const COMMITS = "readiness_commitments";
