// Client-side helpers for the What-if Simulator (types only from the server modules; nothing server-only is bundled).
import type { WhatIfContextView, ProposalView } from "@/lib/labs/whatif/agent";
import type { PlanResult, PlanSpec, SimulationResult } from "@/lib/labs/whatif/engine";

export type { PlanResult, PlanSpec, ProposalView, SimulationResult, WhatIfContextView };
export type SimResponse = SimulationResult & { runId?: string };
export type ProposalResponse = ProposalView & { runId: string };

export const PLAN_COLOR: Record<PlanSpec["id"], string> = { a: "var(--chart-1)", b: "var(--chart-2)" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-06-13" → "13 Jun 2027"; `short` drops the year. */
export function dayLabel(iso: string | null | undefined, short = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${short ? "" : ` ${d.getUTCFullYear()}`}`;
}
/** "2027-06-13" → "Jun 27" for chart ticks. */
export function monthTick(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` : iso;
}
export const pct = (x: number | null | undefined) => `${Math.round((x ?? 0) * 100)}%`;
export const outOfTen = (share: number) => `${Math.round(share * 10)} of 10`;

export interface ChartRow {
  date: string;
  base: number;
  a?: number;
  aBand?: [number, number];
  b?: number;
  bBand?: [number, number];
}

/** One row per simulated week, in percent, for the chart and its table. */
export function chartRows(sim: SimulationResult): ChartRow[] {
  const [a, b] = sim.plans;
  return sim.baseline.map((base, w) => {
    const row: ChartRow = { date: base.date, base: Math.round(base.p50 * 100) };
    const pa = a?.series[w];
    const pb = b?.series[w];
    if (pa) {
      row.a = Math.round(pa.p50 * 100);
      row.aBand = [Math.round(pa.p10 * 100), Math.round(pa.p90 * 100)];
    }
    if (pb) {
      row.b = Math.round(pb.p50 * 100);
      row.bBand = [Math.round(pb.p10 * 100), Math.round(pb.p90 * 100)];
    }
    return row;
  });
}

/** A one-sentence text summary of the chart, from the data. */
export function chartSummary(sim: SimulationResult, target: string): string {
  const parts = sim.plans.map((p) => `${p.label} reaches ${pct(p.final.p50)} (8 of 10 futures between ${pct(p.final.p10)} and ${pct(p.final.p90)})`);
  const base = sim.baseline.at(-1)?.p50 ?? sim.readinessNow;
  return `From ${pct(sim.readinessNow)} today, by ${target} ${parts.join(" and ")}. Your degree on its own reaches ${pct(base)}.`;
}

/** The plan the verdict favours (for the one filled Adopt button). */
export function favoured(sim: SimulationResult): PlanSpec["id"] {
  const [a, b] = sim.plans;
  if (!b || !sim.comparison) return "a";
  if (Math.round(a.final.p50 * 100) !== Math.round(b.final.p50 * 100)) return a.final.p50 > b.final.p50 ? "a" : "b";
  return sim.comparison.bLeads > sim.comparison.aLeads ? "b" : "a";
}

export function sameSpec(x: PlanSpec, y: PlanSpec): boolean {
  return x.hoursPerWeek === y.hoursPerWeek && x.firstSkillId === y.firstSkillId && x.jobHoursLost === y.jobHoursLost && x.placement === y.placement;
}

/**
 * Would adopting this plan change anything? Mirrors the server's proposal: the plan's first skill moves to the front
 * of the weeks still ahead, its study hours (after any job) fill each week, and its hours are saved to the profile.
 * Unknown roadmap (none stored yet) → assume it changes; the server still answers "unchanged" if it doesn't.
 */
export function adoptChanges(spec: PlanSpec, ctx: Pick<WhatIfContextView, "roadmapNow" | "hoursPerWeek">): boolean {
  const now = ctx.roadmapNow;
  if (!now) return true;
  if (spec.hoursPerWeek !== ctx.hoursPerWeek) return true;
  if (Math.max(1, spec.hoursPerWeek - Math.max(0, spec.jobHoursLost)) !== now.weeklyHours) return true;
  if (!spec.firstSkillId) return false;
  const moved = [...now.order.filter((id) => id === spec.firstSkillId), ...now.order.filter((id) => id !== spec.firstSkillId)];
  return moved.some((id, i) => id !== now.order[i]);
}
