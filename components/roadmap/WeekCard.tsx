"use client";
// One week of the roadmap: focus skill, Why? receipt, tasks, the proof (a PR in your pod repo) and the degree link.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, CheckCircle2, ChevronDown, GraduationCap, HelpCircle } from "lucide-react";
import type { EvidenceItem, RoadmapWeek, SkillStatus } from "@/lib/types";
import { SkillChip } from "@/components/keystone";
import { ReceiptDrawer } from "@/components/keystone/ReceiptDrawer";
import { cn } from "@/lib/utils";
import { isWeekDone, weekHours, weekRange } from "./roadmapUtils";
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
  onToggleTask: (taskId: string, done: boolean) => void;
}

const whyBtn =
  "inline-flex h-10 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

export function WeekCard({ week, skillName, skillStatus, current, thisWeek, defaultExpanded, roleLabel, evidence, podHref, pulse, onToggleTask }: WeekCardProps) {
  const [open, setOpen] = React.useState(!!defaultExpanded);
  const reduce = useReducedMotion();
  const done = isWeekDone(week);
  const hours = weekHours(week);
  const ticked = week.tasks.filter((t) => t.done).length;
  const bodyId = `week-${week.week}-body`;
  const headingId = `week-${week.week}-h`;

  return (
    <motion.article
      id={`skill-${week.focusSkillId}`}
      aria-labelledby={headingId}
      animate={pulse && !reduce ? { scale: [1, 1.015, 1] } : undefined}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "scroll-mt-6 rounded-2xl border bg-card p-5 shadow-sm md:p-6",
        current && "ring-2 ring-primary",
        week.isExamWeek && !current && "bg-muted/40",
      )}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-lg font-semibold">
              Week {week.week} <span className="font-normal text-muted-foreground">· {weekRange(week.startDate)}</span>
            </h3>
            {current && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-foreground">{thisWeek ? "This week" : "Up next"}</span>}
            {week.isExamWeek && <span className="rounded-full border border-dashed px-2.5 py-0.5 text-xs font-medium text-foreground">Lighter week: exams</span>}
            {done && (
              <span className="inline-flex items-center gap-1 rounded-full border border-status-proven/25 bg-status-proven/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
                <CheckCircle2 className="size-3.5 text-status-proven" aria-hidden /> Done
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <SkillChip skillId={week.focusSkillId} name={skillName} status={skillStatus} />
            <span className="font-mono tabular-nums">{hours}h</span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">{ticked}/{week.tasks.length} done</span>
            <span aria-hidden>·</span>
            <span>{week.receipt.demandPct}% of {roleLabel} ads</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReceiptDrawer
            receipt={week.receipt}
            title={`Week ${week.week} · ${skillName}`}
            roleName={roleLabel}
            evidence={evidence}
            trigger={<button type="button" className={whyBtn} aria-label={`Why ${skillName} in week ${week.week}?`}><HelpCircle className="size-4" aria-hidden />Why?</button>}
          />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? `Hide week ${week.week} tasks` : `Show week ${week.week} tasks`}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex size-10 items-center justify-center rounded-xl border bg-card outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>
      </header>

      <p className="mt-3 flex items-start gap-2 text-sm">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
        <span>
          <span className="font-medium">Proof:</span>{" "}
          {podHref ? (
            <Link href={podHref} className="rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{week.proof}</Link>
          ) : week.proof}
        </span>
      </p>

      <div id={bodyId} hidden={!open}>
        <ul className="mt-3 divide-y border-t" aria-label={`Week ${week.week} tasks`}>
          {week.tasks.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={(d) => onToggleTask(t.id, d)} />
          ))}
        </ul>
        {week.degreeLink && (
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-status-degree" aria-hidden />
            {week.degreeLink}
          </p>
        )}
      </div>
    </motion.article>
  );
}
