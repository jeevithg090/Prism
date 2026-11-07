// What-if Simulator: zod contracts for the API boundary and the agent's output.
import { z } from "zod";
import { scanForInjection, stripHiddenUnicode } from "@/lib/agents/safety/injection";
import { SkillIdZ } from "@/lib/schemas/community";

export const WhatIfUserIdZ = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/i, "letters, numbers, - and _ only");

/** A plan name the student types. Hidden characters are stripped, and text that tries to instruct an AI is refused. */
export const PlanLabelZ = z
  .string()
  .transform((s) => stripHiddenUnicode(s).replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "give the plan a name").max(40, "keep the name under 40 characters"))
  .refine((s) => scanForInjection(s).risk !== "high", "that name reads like an instruction; try a plain name such as \"Docker first\"")
  .refine((s) => !/[<>{}]/.test(s), "use plain words in the plan name");

export const PlanSpecZ = z.object({
  id: z.enum(["a", "b"]),
  label: PlanLabelZ,
  hoursPerWeek: z.number().int().min(1).max(40),
  firstSkillId: SkillIdZ.nullable(),
  jobHoursLost: z.number().int().min(0).max(30),
  placement: z.boolean(),
});
export type PlanSpecInput = z.infer<typeof PlanSpecZ>;

export const SimulateReqZ = z.object({
  userId: WhatIfUserIdZ,
  plans: z.array(PlanSpecZ).min(1).max(2),
  runId: z.string().regex(/^run_[A-Za-z0-9_-]{4,40}$/).optional(),
});

export const AdoptReqZ = z.discriminatedUnion("action", [
  z.object({ action: z.literal("propose"), userId: WhatIfUserIdZ, plan: PlanSpecZ }),
  z.object({ action: z.enum(["approve", "decline", "undo"]), userId: WhatIfUserIdZ, proposalId: z.string().regex(/^wi_[a-z0-9_-]{4,80}$/i) }),
]);

export const ContextQueryZ = z.object({ userId: WhatIfUserIdZ });

const Share = z.number().min(0).max(1);
const BandPointZ = z.object({ week: z.number().int().min(1), date: z.string(), p10: Share, p50: Share, p90: Share })
  .refine((p) => p.p10 <= p.p50 + 1e-9 && p.p50 <= p.p90 + 1e-9, "bands must be ordered p10 ≤ p50 ≤ p90");

export const PlanResultZ = z.object({
  id: z.enum(["a", "b"]),
  label: z.string(),
  spec: PlanSpecZ,
  series: z.array(BandPointZ).min(1),
  final: z.object({ p10: Share, p50: Share, p90: Share }),
  milestones: z.array(z.object({ skillId: z.string(), name: z.string(), date: z.string().nullable(), doneShare: Share, slowStart: z.boolean() })),
  firstProofDate: z.string().nullable(),
  allDoneShare: Share,
  allDoneDate: z.string().nullable(),
  plannedHours: z.number().min(0),
  hoursNeeded: z.number().int().min(0).max(40).nullable(),
  notes: z.array(z.string()),
});

export const SimulationResultZ = z.object({
  userId: z.string(),
  roleId: z.string(),
  startDate: z.string(),
  targetDate: z.string(),
  weeks: z.number().int().min(1),
  runs: z.number().int().min(1),
  confidence: Share,
  readinessNow: Share,
  queue: z.array(z.object({ skillId: z.string(), name: z.string() })),
  baseline: z.array(z.object({ week: z.number().int(), date: z.string(), p50: Share })),
  plans: z.array(PlanResultZ).min(1).max(2),
  comparison: z.object({
    aFinalWins: Share, bFinalWins: Share, aLeads: Share, bLeads: Share, firstProofGapWeeks: z.number().int(), verdict: z.string().min(1),
  }).nullable(),
  generatedAt: z.string(),
});
