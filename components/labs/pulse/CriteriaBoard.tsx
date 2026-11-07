"use client";
// "Where the room is": one row per rubric criterion and hidden test, stacked as has it / working / stuck / not started.
import { CheckCircle2, CircleDashed, Target } from "lucide-react";
import type { CriterionState } from "@/lib/labs/pulse/model";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "met", label: "Have it", cls: "bg-status-proven" },
  { key: "working", label: "Working on it", cls: "bg-chart-4" },
  { key: "stuck", label: "Stuck", cls: "bg-status-gap" },
  { key: "notStarted", label: "Not started", cls: "bg-border" },
] as const;

export function CriteriaLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="Legend">
      {SEGMENTS.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm", s.cls)} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function Row({ c, n, hot }: { c: CriterionState; n: number; hot: boolean }) {
  const parts = SEGMENTS.map((s) => ({ ...s, value: c[s.key] })).filter((p) => p.value > 0);
  const text = `${c.met} have it, ${c.working} working on it, ${c.stuck} stuck${c.notStarted ? `, ${c.notStarted} not started` : ""}`;
  return (
    <li className={cn("rounded-xl px-3 py-3", hot && "border border-status-gap/30 bg-status-gap/10")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-medium">
          {c.title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{c.concept}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm tabular-nums">
          {hot && <><Target className="size-4 text-status-gap" aria-hidden /><span className="font-medium">Most stuck</span></>}
          {!hot && c.met === n && n > 0 && <><CheckCircle2 className="size-4 text-status-proven" aria-hidden /><span>Everyone</span></>}
          {!hot && c.met < n && <span className="text-muted-foreground">{c.met} of {n} have it</span>}
        </p>
      </div>
      <div className="mt-2 flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.title}: ${text}`}>
        {parts.map((p) => (
          <span
            key={p.key}
            className={cn("h-full motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out", p.cls)}
            style={{ width: `${(p.value / Math.max(1, n)) * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{text}</p>
    </li>
  );
}

export function CriteriaBoard({ criteria, cohortSize, hotspotId }: { criteria: CriterionState[]; cohortSize: number; hotspotId: string | null }) {
  const rubric = criteria.filter((c) => c.kind === "rubric");
  const checks = criteria.filter((c) => c.kind === "check");
  return (
    <div className="space-y-5">
      <CriteriaLegend />
      <div>
        <h3 className="mb-1 text-base font-semibold">Rubric criteria</h3>
        <ul className="space-y-1">{rubric.map((c) => <Row key={c.id} c={c} n={cohortSize} hot={c.id === hotspotId} />)}</ul>
      </div>
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <CircleDashed className="size-4 text-muted-foreground" aria-hidden />Hidden tests
        </h3>
        <ul className="space-y-1">{checks.map((c) => <Row key={c.id} c={c} n={cohortSize} hot={c.id === hotspotId} />)}</ul>
      </div>
    </div>
  );
}
