// Keystone Labs tool: get_plan_futures (What-if Simulator). Read-only: it simulates, it never changes the roadmap;
// adopting a plan happens on /labs/whatif behind the student's approval.
import "server-only";
import { z } from "zod";
import { contextView, defaultPlans, loadWhatIfWorld, simulateWhatIf } from "@/lib/labs/whatif/agent";
import { dateLabel, type PlanResult, type PlanSpec } from "@/lib/labs/whatif/engine";
import { SkillIdZ } from "@/lib/schemas/community";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const InputZ = z.object({
  hoursPerWeek: z.number().int().min(1).max(40).optional().describe("Study hours a week to try. Omit to keep the student's current hours."),
  firstSkillId: SkillIdZ.optional().describe("A roadmap focus skill to learn first, e.g. \"pytorch\". Omit to keep the Roadmap Agent's order."),
  jobHoursLost: z.number().int().min(0).max(30).optional().describe("Study hours a part-time job would cost each week (0 = no job)."),
  placement: z.boolean().optional().describe("true to add a 10-week summer placement before the target date."),
});

interface PlanOutcome {
  label: string;
  readinessByTarget: { p10: number; p50: number; p90: number };
  firstProof: string | null;
  allProofsBy: string | null;
  allProofsShare: number;
  hoursNeeded: number | null;
}
export interface SimulatePlanOutput {
  target: string;
  readinessNow: number;
  futures: number;
  tried: PlanOutcome;
  current: PlanOutcome | null;
  verdict: string | null;
  adoptAt: string;
}

const outcome = (p: PlanResult): PlanOutcome => ({
  label: p.label,
  readinessByTarget: p.final,
  firstProof: p.firstProofDate,
  allProofsBy: p.allDoneDate,
  allProofsShare: p.allDoneShare,
  hoursNeeded: p.hoursNeeded,
});
const pct = (x: number) => `${Math.round(x * 100)}%`;

function clip(text: string, max = 400): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:(]+$/, "")}…`;
}

const simulatePlan: KeystoneTool<typeof InputZ, SimulatePlanOutput> = {
  name: "get_plan_futures",
  title: "Try a what-if plan",
  description:
    "Use when the student asks \"what if I studied more, learned X first, took a job or a placement?\". Simulates 200 futures to their target date from the Bridge Map, roadmap and demand forecasts. Returns readiness by the target (80% band), first-proof date, when all roadmap proofs land, the hours a week they need, and a verdict against their current plan. Read-only; adopting happens on /labs/whatif.",
  input: InputZ,
  effect: "read",
  requiresApproval: false,
  agent: "roadmap",
  async run(input, ctx) {
    const world = await loadWhatIfWorld(ctx.userId);
    if (!world) throw new ToolError("No Bridge Map yet, so there's nothing to simulate. Ask the student to finish onboarding first.", "not_found");
    if (input.firstSkillId && !world.ctx.queue.includes(input.firstSkillId)) {
      throw new ToolError(`${input.firstSkillId} isn't on the student's roadmap. Pick one of: ${world.ctx.queue.join(", ")}.`, "invalid_input");
    }
    const [current] = defaultPlans(world);
    const view = contextView(world);
    const name = (id: string | null) => view.queue.find((q) => q.skillId === id)?.name ?? id ?? "";
    const tried: PlanSpec = {
      id: "a",
      label: input.firstSkillId ? `${name(input.firstSkillId)} first` : "Your what-if",
      hoursPerWeek: input.hoursPerWeek ?? current.hoursPerWeek,
      firstSkillId: input.firstSkillId ?? current.firstSkillId,
      jobHoursLost: input.jobHoursLost ?? 0,
      placement: input.placement ?? false,
    };
    const same = JSON.stringify({ ...tried, id: "", label: "" }) === JSON.stringify({ ...current, id: "", label: "" });
    const plans = same ? [tried] : [tried, { ...current, id: "b" as const, label: "Your current plan" }];
    const r = await simulateWhatIf({ world, plans, runId: ctx.runId });
    return {
      target: dateLabel(r.targetDate),
      readinessNow: r.readinessNow,
      futures: r.runs,
      tried: outcome(r.plans[0]),
      current: r.plans[1] ? outcome(r.plans[1]) : null,
      verdict: r.comparison?.verdict ?? null,
      adoptAt: "/labs/whatif",
    };
  },
  summarize(o) {
    const t = o.tried;
    const proofs = t.allProofsBy ? `all roadmap proofs by ${dateLabel(t.allProofsBy)} in ${Math.round(t.allProofsShare * 10)} of 10 futures` : `not every roadmap proof lands by ${o.target}`;
    const hours = t.hoursNeeded === null ? "" : ` Needs ${t.hoursNeeded} h a week.`;
    const verdict = o.verdict ? ` ${o.verdict}` : "";
    return clip(`${t.label}: readiness ${pct(o.readinessNow)} → ${pct(t.readinessByTarget.p50)} by ${o.target} (80% band ${pct(t.readinessByTarget.p10)} to ${pct(t.readinessByTarget.p90)}), ${proofs}.${hours}${verdict} The student can adopt it at ${o.adoptAt}.`);
  },
};

export const tool = simulatePlan as unknown as AnyTool;
