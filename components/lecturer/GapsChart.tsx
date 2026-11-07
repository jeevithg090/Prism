"use client";
// "Industry skills your programme doesn't teach yet": share of job ads per uncovered skill (single series, horizontal bars).
import { useId } from "react";
import { useReducedMotion } from "motion/react";
import { Target } from "lucide-react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { skillName } from "@/lib/schemas/community";
import type { LecturerInsights } from "@/lib/schemas/lecturer";
import { cn } from "@/lib/utils";

type Gap = LecturerInsights["gaps"][number];

const students = (n: number) => `${n} student${n === 1 ? "" : "s"}`;

function listJoin(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Plain-English summary of the chart (shown under it and read by screen readers). */
export function gapsSummary(gaps: Gap[], roleName: string): string {
  if (!gaps.length) return "Every high-demand skill we track is covered by at least one module.";
  const [top, ...rest] = gaps;
  const head =
    `${skillName(top.skillId)} is the biggest gap: ${top.demandPct}% of ${roleName} job ads ask for it, ` +
    `${students(top.studentsTargeting)} in this cohort need it, and no module covers it.`;
  if (!rest.length) return head;
  const others = [...rest].sort((a, b) => b.demandPct - a.demandPct).map((g) => `${skillName(g.skillId)} (${g.demandPct}%)`);
  return `${head} Also missing from the syllabus: ${listJoin(others)}.`;
}

export function NoModuleBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-status-gap/25 bg-status-gap/10 px-3 py-1 text-sm font-medium text-foreground", className)}>
      <Target className="size-4 text-status-gap" aria-hidden />
      No module covers it
    </span>
  );
}

type Row = { name: string; demandPct: number; students: number; label: string };

/** Y-axis tick: skill name, with "8 students" under it (keeps the bar-end label short so it fits on phones). */
function SkillTick({ x, y, payload, rows }: { x?: number | string; y?: number | string; payload?: { value: string; index?: number }; rows: Row[] }) {
  const row = rows.find((r) => r.name === payload?.value);
  return (
    <g transform={`translate(${Number(x ?? 0)},${Number(y ?? 0)})`}>
      <text x={-8} y={-3} textAnchor="end" fill="var(--foreground)" fontSize={16} fontWeight={500}>{payload?.value}</text>
      {row && <text x={-8} y={15} textAnchor="end" fill="var(--muted-foreground)" fontSize={13}>{students(row.students)}</text>}
    </g>
  );
}

function GapTooltip({ active, payload, roleName }: { active?: boolean; payload?: { payload: Row }[]; roleName: string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold">{row.name}</p>
      <p className="tabular-nums">{row.demandPct}% of {roleName} ads</p>
      <p className="tabular-nums text-muted-foreground">{students(row.students)} in your cohort need it</p>
      <p className="mt-1 inline-flex items-center gap-1 text-status-gap"><Target className="size-3.5" aria-hidden />No module covers it</p>
    </div>
  );
}

export function GapsChart({ gaps, roleName }: { gaps: Gap[]; roleName: string }) {
  const reduce = useReducedMotion();
  const summaryId = useId();
  const rows: Row[] = [...gaps]
    .sort((a, b) => b.demandPct - a.demandPct)
    .map((g) => ({ name: skillName(g.skillId), demandPct: g.demandPct, students: g.studentsTargeting, label: `${g.demandPct}%` }));
  const max = Math.max(10, ...rows.map((r) => r.demandPct));

  return (
    <figure aria-describedby={summaryId} className="space-y-4">
      <div className="w-full min-w-0 overflow-hidden" style={{ height: rows.length * 56 + 16 }} data-testid="gaps-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 0 }} barCategoryGap={16}>
            <XAxis type="number" hide domain={[0, max]} />
            <YAxis type="category" dataKey="name" width={124} axisLine={false} tickLine={false} interval={0} tick={<SkillTick rows={rows} />} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<GapTooltip roleName={roleName} />} />
            <Bar dataKey="demandPct" name={`% of ${roleName} ads`} fill="var(--status-gap)" radius={[0, 4, 4, 0]} maxBarSize={26} isAnimationActive={!reduce}>
              <LabelList dataKey="label" position="right" offset={8} fill="var(--foreground)" fontSize={16} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption id={summaryId} className="text-base text-muted-foreground" data-testid="gaps-summary">
        {gapsSummary(gaps, roleName)}
      </figcaption>
      <div className="sr-only">
      <table>
        <caption>Skills no module covers, by share of {roleName} job ads</caption>
        <thead><tr><th scope="col">Skill</th><th scope="col">Share of ads</th><th scope="col">Students who need it</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.name}><th scope="row">{r.name}</th><td>{r.demandPct}%</td><td>{r.students}</td></tr>)}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
