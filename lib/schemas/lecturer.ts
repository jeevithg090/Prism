// Lecturer Insights (Teaching pillar, contract F14): API boundary schemas.
// GET /api/lecturer/insights is contract §6 (exact shape). GET /api/lecturer/cohort is additive (role split for the stat cards).
import { z } from "zod";
import { SkillIdZ } from "@/lib/schemas/community";

export const LecturerQueryZ = z.object({ programmeId: z.string().trim().min(1, "programmeId is required") });

/** Contract §6: `{ gaps: {skillId; demandPct; studentsTargeting}[]; labIdeas: string[] }`. Never per-student data. */
export const LecturerInsightsZ = z.object({
  gaps: z.array(z.object({
    skillId: SkillIdZ,
    /** 41 = 41% of job ads for the cohort's most-targeted role (see LecturerCohort.demandRole). */
    demandPct: z.number(),
    /** Students whose first-choice role asks for this skill (≥ 10% of its ads), or who list it as a gap. */
    studentsTargeting: z.number(),
  }).strict()),
  labIdeas: z.array(z.string()),
}).strict();
export type LecturerInsights = z.infer<typeof LecturerInsightsZ>;

/** What the LLM is asked for when writing lab ideas. */
export const LabIdeasDraftZ = z.object({ labIdeas: z.array(z.string().min(10).max(400)).min(1).max(5) });

/** GET /api/lecturer/cohort?programmeId=: anonymous role split (n ≥ 10 only). */
export const LecturerCohortZ = z.object({
  programmeId: z.string(),
  cohortSize: z.number(),
  suppressed: z.boolean(),
  /** The role that `demandPct` in /api/lecturer/insights refers to (most-targeted role with demand data). */
  demandRole: z.object({ roleId: z.string(), roleName: z.string() }).nullable(),
  roles: z.array(z.object({ roleId: z.string(), roleName: z.string(), students: z.number(), pct: z.number() })),
});
export type LecturerCohort = z.infer<typeof LecturerCohortZ>;

const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer",
  "software-engineer": "Software engineer",
  "data-analyst": "Data analyst",
};
export function roleName(id: string): string {
  return ROLE_NAMES[id] ?? id.split("-").map((w, i) => (i === 0 ? w[0]?.toUpperCase() + w.slice(1) : w)).join(" ");
}
