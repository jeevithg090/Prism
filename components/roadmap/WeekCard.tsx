"use client";
// One week on the roadmap's timeline: the rail marks where you are, the row says what and why,
// and the body holds the tasks, the proof (a PR in your pod repo) and the degree link.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, CheckCircle2, ChevronDown, GraduationCap, HelpCircle } from "lucide-react";
import type { EvidenceItem, RoadmapWeek, SkillStatus } from "@/lib/types";
import { StatusBadge } from "@/components/keystone";
import { ReceiptDrawer } from "@/components/keystone/ReceiptDrawer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isWeekDone, readableModules, weekHours, weekRange } from "./roadmapUtils";
import { TaskRow } from "./TaskRow";

export interface WeekCardProps {
  week: RoadmapWeek;
  skillName: string;
  skillStatus?: SkillStatus;
  current?: boolean;
  thisWeek?: boolean;
  defaultExpanded?: boolean;
  roleLabel: string;
  evidence?: EvidenceItem[];
  podHref?: string;
  pulse?: boolean;
  /** The hours most weeks carry: a week's hours show only when they differ. */
  usualHours?: number;
  /** Module code to full title, so the degree line names modules, not codes. */
  moduleTitles?: Record<string, string>;
  onToggleTask: (taskId: string, done: boolean) => void;
}

const tag = "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-medium whitespace-nowrap text-foreground";

/** The timeline's rail: a line through every week and a marker for this one (you are here, done, exam or planned). */
function Rail({ current, done, exam }: { current?: boolean; done: boolean; exam: boolean }) {
  const line = exam ? "w-0 border-l border-dashed border-input" : "w-px bg-rule-2";
  return (
    <div aria-hidden className="relative w-6 shrink-0">
      <span className={cn("absolute top-0 left-1/2 h-[2.125rem] -translate-x-1/2 group-first/week:hidden", line)} />
      <span className={cn("absolute top-[2.125rem] bottom-0 left-1/2 -translate-x-1/2 group-last/week:hidden", line)} />
      {done ? (
        <CheckCircle2 className="absolute top-[2.125rem] left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card text-status-proven" />
      ) : (
        <span
          className={cn(
            "absolute top-[2.125rem] left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
            current ? "size-3.5 bg-primary ring-4 ring-signal-soft" : exam ? "size-3 border border-input bg-card" : "size-3 border-2 border-input bg-card",
          )}
        />
      )}
    </div>
  );
}

export function WeekCard({ week, skillName, skillStatus, current, thisWeek, defaultExpanded, roleLabel, evidence, podHref, pulse, usualHours, moduleTitles, onToggleTask }: WeekCardProps) {
  const [open, setOpen] = React.useState(!!defaultExpanded);
  const reduce = useReducedMotion();
  const done = isWeekDone(week);
  const hours = weekHours(week);
  const ticked = week.tasks.filter((t) => t.done).length;
  const bodyId = `week-${week.week}-body`;
  const headingId = `week-${week.week}-h`;
  const skillId = `week-${week.week}-skill`;
  // Gap is the plan's default, so only the exceptions get a badge; hours and ticks show only when they say something.
  const badge = skillStatus && skillStatus !== "gap" ? skillStatus : undefined;
  const showHours = usualHours === undefined || hours !== usualHours;
  const showTicks = !!current || ticked > 0;
  const code = week.receipt.moduleCode;
  const receipt = {
    ...week.receipt,
    reason: readableModules(week.receipt.reason, moduleTitles),
    ...(code ? { moduleCode: readableModules(code, moduleTitles) } : {}),
  };

  return (
    <motion.article
      id={`skill-${week.focusSkillId}`}
      aria-labelledby={`${headingId} ${skillId}`}
      animate={pulse && !reduce ? { scale: [1, 1.015, 1] } : undefined}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex scroll-mt-6 gap-3 sm:gap-4"
    >
      <Rail current={current} done={done} exam={week.isExamWeek} />

      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-2 border-t py-5 group-first/week:border-t-0 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
        <div className="flex items-baseline gap-x-3 sm:block">
          <h3 id={headingId} className="text-lg font-semibold">Week {week.week}</h3>
          <p className="text-sm text-muted-foreground tabular-nums">{weekRange(week.startDate)}</p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3 md:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p id={skillId} data-skill={week.focusSkillId} className={cn("text-lg", week.isExamWeek ? "font-medium" : "font-semibold")}>{skillName}</p>
                  {badge && <StatusBadge status={badge} size="sm" />}
                  {current && <span className={cn(tag, "border-primary/35 bg-signal-soft")}>{thisWeek ? "This week" : "Up next"}</span>}
                  {week.isExamWeek && <span className={cn(tag, "border-dashed border-input bg-card")}>Lighter week: exams</span>}
                  {done && (
                    <span className={cn(tag, "border-status-proven/35 bg-status-proven/10")}>
                      <CheckCircle2 className="size-3.5 text-status-proven" aria-hidden />Done
                    </span>
                  )}
                </div>
                {(showHours || showTicks) && (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {showHours && <span className="tabular-nums">{hours}h</span>}
                    {showTicks && <span className="tabular-nums">{ticked} of {week.tasks.length} done</span>}
                  </p>
                )}
              </div>
              <p className="shrink-0 pt-0.5 text-right font-mono text-lg leading-7 font-semibold text-foreground tabular-nums md:w-14">
                {week.receipt.demandPct}%<span className="sr-only"> of {roleLabel} ads</span>
              </p>
            </div>
            <div className={cn("flex shrink-0 items-center gap-1", !current && "max-md:-ml-3")}>
              <ReceiptDrawer
                receipt={receipt}
                title={`${skillName} in week ${week.week}`}
                roleName={roleLabel}
                evidence={evidence}
                trigger={
                  <button type="button" className={cn(buttonVariants({ variant: current ? "outline" : "ghost" }), "h-10 px-3 focus-visible:outline-solid")} aria-label={`Why ${skillName} in week ${week.week}?`}>
                    <HelpCircle className="size-4" aria-hidden />Why?
                  </button>
                }
              />
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                aria-label={open ? `Hide week ${week.week} tasks` : `Show week ${week.week} tasks`}
                onClick={() => setOpen((o) => !o)}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 focus-visible:outline-solid")}
              >
                <ChevronDown className={cn("size-4 transition-transform duration-(--dur-short) ease-(--ease-in-out) motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div id={bodyId} hidden={!open} className="mt-2 space-y-4 sm:col-span-2">
          <ul className="divide-y rounded-xl bg-muted px-4" aria-label={`Week ${week.week} tasks`}>
            {week.tasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={(d) => onToggleTask(t.id, d)} />
            ))}
          </ul>
          <p className="flex items-start gap-2 text-base text-pretty">
            <BadgeCheck className="mt-1 size-4 shrink-0 text-status-proven" aria-hidden />
            <span>
              <span className="font-medium">Your proof this week:</span>{" "}
              {podHref ? (
                <Link
                  href={podHref}
                  className="rounded-sm text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {week.proof}
                </Link>
              ) : week.proof}
            </span>
          </p>
          {week.degreeLink && (
            <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
              <GraduationCap className="mt-0.5 size-4 shrink-0 text-status-degree" aria-hidden />
              {readableModules(week.degreeLink, moduleTitles)}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}
