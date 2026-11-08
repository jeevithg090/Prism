"use client";
// The readiness strip: where you are, where the plan takes you, the shape of the weeks between, and the Re-plan action.
import { GraduationCap, RefreshCw } from "lucide-react";
import type { Roadmap } from "@/lib/types";
import { DemoDataNote, ReadinessRing } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { monthYear } from "@/lib/graph/roles";
import { cn } from "@/lib/utils";
import { currentWeekIndex, dayMonth, isWeekDone } from "./roadmapUtils";

type Side = "left" | "right" | "top" | "bottom";
const RING_ROOM: Record<Side, string> = { left: "pl-11", right: "pr-11", top: "pt-6", bottom: "pb-6" };
const LABEL_AT: Record<Side, string> = {
  left: "-translate-x-full -translate-y-1/2 pr-1.5",
  right: "-translate-y-1/2 pl-1.5",
  top: "-translate-x-1/2 -translate-y-full pb-1",
  bottom: "-translate-x-1/2 pt-1",
};

/** The readiness ring with the end of its ghost arc labelled, so the plan's figure sits where the plan ends. */
function PlanRing({ now, projected }: { now: number; projected: number }) {
  const then = Math.min(1, Math.max(0, projected));
  const pct = Math.round(then * 100);
  const showEnd = pct > Math.round(Math.min(1, Math.max(0, now)) * 100);
  const angle = then * 2 * Math.PI;
  const x = Math.sin(angle);
  const y = -Math.cos(angle);
  const side: Side = Math.abs(x) >= Math.abs(y) ? (x < 0 ? "left" : "right") : y < 0 ? "top" : "bottom";
  return (
    <div className={cn("shrink-0 self-start md:self-center", showEnd && RING_ROOM[side])}>
      <div className="relative">
        <ReadinessRing value={now} projected={projected} label="today" />
        {showEnd && (
          <span
            aria-hidden
            className={cn("absolute font-mono text-sm leading-none font-semibold whitespace-nowrap text-foreground tabular-nums", LABEL_AT[side])}
            style={{ left: `${50 + 50 * x}%`, top: `${50 + 50 * y}%` }}
          >
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}

/** A week that starts early on a skill your degree teaches after your target date. */
const headStart = (w: Roadmap["weeks"][number]) => w.receipt.coveredByDegree === "upcoming";

/**
 * The plan drawn as one bar a week, as tall as that week's skill's share of job ads (from zero): the week
 * you're on in coral and named, done weeks green, head starts on a later module blue under a cap, exam weeks dashed.
 */
function PlanStrip({ roadmap, currentSkillName, roleLabel }: { roadmap: Roadmap; currentSkillName?: string; roleLabel: string }) {
  const { weeks } = roadmap;
  const cur = currentWeekIndex(roadmap);
  const pcts = weeks.map((w) => w.receipt.demandPct);
  const max = Math.max(1, ...pcts);
  const height = (p: number) => Math.max(6, Math.round((p / max) * 100));
  const exams = weeks.filter((w) => w.isExamWeek);
  const done = weeks.filter(isWeekDone).length;
  const starts = weeks.filter(headStart);
  const current = weeks[cur];
  const name = currentSkillName ?? current?.focusSkillId;
  // The name runs right from its bar (left near the end), so it sits above the tallest bar it crosses.
  const toLeft = cur > weeks.length - 4;
  const span = toLeft ? weeks.slice(Math.max(0, cur - 3), cur + 1) : weeks.slice(cur, cur + 4);
  const labelAt = Math.max(...span.map((w) => height(w.receipt.demandPct)));
  const summary = [
    `${weeks.length} weeks, each as tall as its skill's share of ${roleLabel} ads, from ${Math.max(...pcts)}% down to ${Math.min(...pcts)}%.`,
    current ? `You're on week ${current.week}, ${name}, at ${current.receipt.demandPct}%.` : "",
    done ? `${done} ${done === 1 ? "week" : "weeks"} done.` : "",
    starts.length ? `${starts.length === 1 ? "Week" : "Weeks"} ${starts.map((w) => w.week).join(" and ")} ${starts.length === 1 ? "is a head start" : "are head starts"} on a later module.` : "",
    exams.length ? `Exam ${exams.length === 1 ? "week" : "weeks"} ${exams.map((w) => w.week).join(" and ")} ${exams.length === 1 ? "is" : "are"} lighter.` : "",
  ].filter(Boolean).join(" ");
  return (
    <div className="shrink-0 pt-6">
      <div role="img" data-kind="chart" aria-label={summary} className="flex h-16 items-end gap-1.5 sm:gap-2">
        {weeks.map((w, i) => (
          <span key={w.week} className="relative flex h-full w-4 flex-col justify-end sm:w-6">
            {i !== cur && !isWeekDone(w) && headStart(w) && (
              <GraduationCap
                aria-hidden
                className="absolute left-1/2 mb-1 size-3.5 -translate-x-1/2 text-status-degree"
                style={{ bottom: `${height(w.receipt.demandPct)}%` }}
              />
            )}
            {i === cur && name && (
              <span
                aria-hidden
                className={cn("absolute mb-1 text-sm leading-none font-semibold whitespace-nowrap text-foreground", toLeft ? "right-0" : "left-0")}
                style={{ bottom: `${labelAt}%` }}
              >
                {name}
              </span>
            )}
            <span
              className={cn(
                "block w-full rounded-t-sm",
                i === cur ? "bg-primary" : isWeekDone(w) ? "bg-status-proven" : w.isExamWeek ? "border border-b-0 border-dashed border-input" : headStart(w) ? "bg-status-degree/40" : "bg-rule-2",
              )}
              style={{ height: `${height(w.receipt.demandPct)}%` }}
            />
          </span>
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex gap-1.5 border-t border-rule-2 pt-1.5 sm:gap-2">
        {weeks.map((w, i) => (
          <span key={w.week} className={cn("w-4 text-center text-xs tabular-nums sm:w-6", i === cur ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {w.week}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RoadmapHeader({
  roadmap, targetDate, hoursPerWeek, demo, replanning, onReplan, currentSkillName, roleLabel = "job",
}: {
  roadmap: Roadmap; targetDate?: string; hoursPerWeek?: number; demo?: boolean; replanning?: boolean; onReplan: () => void;
  currentSkillName?: string; roleLabel?: string;
}) {
  const exams = roadmap.weeks.filter((w) => w.isExamWeek).length;
  const anyDone = roadmap.weeks.some(isWeekDone);
  const anyStart = roadmap.weeks.some(headStart);
  const when = monthYear(targetDate);
  const then = Math.round(roadmap.readinessProjected * 100);
  const facts = [
    `${roadmap.weeks.length} weeks from ${roadmap.weeks[0] ? dayMonth(roadmap.weeks[0].startDate) : "next Monday"}`,
    hoursPerWeek ? `${hoursPerWeek} hours a week` : "",
    exams ? `${exams} lighter exam ${exams === 1 ? "week" : "weeks"}` : "",
  ].filter(Boolean).join(", ");
  const key = [
    anyStart ? "blue weeks start early on a module you take later" : "",
    anyDone ? "green weeks are done" : "",
    exams ? "dashed weeks are exams" : "",
  ].filter(Boolean).join("; ");
  const caption = `Each bar is a week, as tall as its skill's share of ${roleLabel} ads.${key ? ` ${key[0].toUpperCase()}${key.slice(1)}.` : ""}`;
  return (
    <section aria-labelledby="roadmap-readiness-h" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        <PlanRing now={roadmap.readinessNow} projected={roadmap.readinessProjected} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h2 id="roadmap-readiness-h" className="text-2xl font-semibold text-balance md:text-3xl">
                Up to <span className="font-mono tabular-nums">{then}%</span> ready {when ? `by ${when}` : "by your target date"}
              </h2>
              <p className="mt-2 text-base text-pretty text-muted-foreground">{facts}.</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <Button
                type="button"
                variant="outline"
                onClick={onReplan}
                disabled={replanning}
                aria-busy={replanning || undefined}
                className="h-10 px-4 focus-visible:outline-solid active:translate-y-px"
              >
                <RefreshCw className={cn("size-4", replanning && "motion-safe:animate-spin")} aria-hidden />
                {replanning ? "Re-planning…" : "Re-plan"}
              </Button>
              <p className="text-sm text-muted-foreground">Version {roadmap.version}, planned {dayMonth(roadmap.generatedAt)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-8">
            <PlanStrip roadmap={roadmap} currentSkillName={currentSkillName} roleLabel={roleLabel} />
            <div className="flex min-w-0 flex-col items-start gap-3 pb-0.5">
              <p className="max-w-[36ch] text-sm text-pretty text-muted-foreground">{caption}</p>
              {demo && <DemoDataNote />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
