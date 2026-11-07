"use client";
// "Industry skills your programme doesn't teach yet": share of job ads per uncovered skill (single series, horizontal bars).
// A real table drawn as bars (data-viz.md): the biggest gap is the one argued series in coral, the rest stay neutral.
import { useId } from "react";
import { Target } from "lucide-react";
import { skillName } from "@/lib/schemas/community";
import type { LecturerInsights } from "@/lib/schemas/lecturer";
import { cn } from "@/lib/utils";

type Gap = LecturerInsights["gaps"][number];

const students = (n: number) => `${n} student${n === 1 ? "" : "s"}`;

function listJoin(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function summaryParts(gaps: Gap[], roleName: string): { head: string; rest?: string } {
  if (!gaps.length) return { head: "Every high-demand skill we track is covered by at least one module." };
  const [top, ...others] = gaps;
  const head =
    `${skillName(top.skillId)} is the biggest gap: ${top.demandPct}% of ${roleName} job ads ask for it, ` +
    `${students(top.studentsTargeting)} in this cohort need it, and no module covers it.`;
  if (!others.length) return { head };
  const list = [...others].sort((a, b) => b.demandPct - a.demandPct).map((g) => `${skillName(g.skillId)} (${g.demandPct}%)`);
  return { head, rest: `Also missing from the syllabus: ${listJoin(list)}.` };
}

/** Plain-English summary of the chart (the head sentence is shown under it; screen readers get all of it). */
export function gapsSummary(gaps: Gap[], roleName: string): string {
  const { head, rest } = summaryParts(gaps, roleName);
  return rest ? `${head} ${rest}` : head;
}

export function NoModuleBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-status-gap/35 bg-status-gap/10 px-2.5 text-sm font-medium text-foreground", className)}>
      <Target className="size-4 text-status-gap" aria-hidden />
      No module covers it
    </span>
  );
}

type Row = { name: string; demandPct: number; students: number; label: string };

export function GapsChart({ gaps, roleName }: { gaps: Gap[]; roleName: string }) {
  const summaryId = useId();
  const summary = summaryParts(gaps, roleName);
  const rows: Row[] = [...gaps]
    .sort((a, b) => b.demandPct - a.demandPct)
    .map((g) => ({ name: skillName(g.skillId), demandPct: g.demandPct, students: g.studentsTargeting, label: `${g.demandPct}%` }));
  const max = Math.max(10, ...rows.map((r) => r.demandPct));

  return (
    <figure aria-describedby={summaryId} className="space-y-5">
      <div className="w-full max-w-3xl min-w-0" data-testid="gaps-chart">
        <table className="w-full table-fixed border-collapse" aria-label={`Skills no module covers, by share of ${roleName} job ads`}>
          <colgroup>
            <col className="w-28 sm:w-44" />
            <col />
          </colgroup>
          <thead>
            <tr className="text-left text-sm text-muted-foreground">
              <th scope="col" className="pb-3 font-medium">Skill</th>
              <th scope="col" className="pb-3 font-medium">Share of ads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-t last:border-b">
                <th scope="row" className="py-3 pr-3 text-left align-middle font-normal">
                  <span className={cn("block truncate text-base text-foreground", i === 0 ? "font-semibold" : "font-medium")}>{r.name}</span>
                  {/* Sighted readers get the need right under the skill; screen readers hear it in the share cell, so the row header's name stays the skill. */}
                  <span className="block font-mono text-sm text-ink-2 tabular-nums" aria-hidden>{students(r.students)}</span>
                </th>
                <td className="py-3">
                  <span className="flex items-center gap-2 sm:gap-3">
                    <span className="relative block h-5 min-w-0 flex-1" aria-hidden>
                      <span
                        className={cn("absolute inset-y-0 left-0 rounded-r-sm", i === 0 ? "bg-primary" : "bg-field")}
                        style={{ width: `${(r.demandPct / max) * 100}%` }}
                      />
                    </span>
                    <span className={cn("w-12 shrink-0 font-mono text-base text-foreground tabular-nums sm:w-14 sm:text-lg", i === 0 ? "font-semibold" : "font-medium")}>{r.label}</span>
                    <span className="sr-only">, {students(r.students)} need it</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption id={summaryId} className="max-w-[72ch] text-base text-pretty text-muted-foreground" data-testid="gaps-summary">
        {summary.head}
        {summary.rest && " "}
        {summary.rest && <span className="sr-only">{summary.rest}</span>}
      </figcaption>
    </figure>
  );
}
