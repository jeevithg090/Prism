"use client";
// The readiness strip: where you are, where the plan takes you, and the Re-plan action.
import { RefreshCw } from "lucide-react";
import type { Roadmap } from "@/lib/types";
import { DemoDataNote, ReadinessRing } from "@/components/keystone";
import { monthYear } from "@/lib/graph/roles";
import { cn } from "@/lib/utils";
import { dayMonth } from "./roadmapUtils";

export function RoadmapHeader({
  roadmap, targetDate, hoursPerWeek, demo, replanning, onReplan,
}: { roadmap: Roadmap; targetDate?: string; hoursPerWeek?: number; demo?: boolean; replanning?: boolean; onReplan: () => void }) {
  const exams = roadmap.weeks.filter((w) => w.isExamWeek).length;
  const when = monthYear(targetDate);
  const now = Math.round(roadmap.readinessNow * 100);
  const then = Math.round(roadmap.readinessProjected * 100);
  return (
    <section aria-labelledby="roadmap-readiness-h" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-10">
        <ReadinessRing value={roadmap.readinessNow} projected={roadmap.readinessProjected} label="today" />
        <div className="min-w-0 space-y-2">
          <h2 id="roadmap-readiness-h" className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            <span className="font-mono tabular-nums">{now}%</span> today → <span className="font-mono text-primary tabular-nums">{then}%</span> {when ? `by ${when}` : "by your target date"}
          </h2>
          <p className="text-base text-muted-foreground">
            {roadmap.weeks.length} weeks from {roadmap.weeks[0] ? dayMonth(roadmap.weeks[0].startDate) : "next Monday"}
            {hoursPerWeek ? ` · ${hoursPerWeek} hours a week` : ""}
            {exams ? ` · ${exams} lighter exam ${exams === 1 ? "week" : "weeks"}` : ""}
            {` · version ${roadmap.version}, planned ${dayMonth(roadmap.generatedAt)}`}
          </p>
          {demo && <DemoDataNote />}
        </div>
        <button
          type="button"
          onClick={onReplan}
          disabled={replanning}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <RefreshCw className={cn("size-4", replanning && "animate-spin")} aria-hidden />
          {replanning ? "Re-planning…" : "Re-plan"}
        </button>
      </div>
    </section>
  );
}
