"use client";
// Presentational parts for /labs/changereq: the diff hunk, the checks, the plan aside and the version history.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, CheckCircle2, History, Lock, Minus, Plus, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChangeRequest, Check, Hunk, PlanVersionSummary, PlanWeekRow, Signal } from "@/lib/labs/changereq/types";

const signed = (g?: number) => (g === undefined ? "n/a" : `${g >= 0 ? "+" : "−"}${Math.abs(Math.round(g * 100))}%`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayMonth = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

function DiffLine({ sign, week, name, hours }: { sign: "-" | "+"; week: number; name: string; hours?: number }) {
  const add = sign === "+";
  const Icon = add ? Plus : Minus;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border-l-4 px-2.5 py-2 font-mono text-sm sm:gap-3 sm:px-3", add ? "border-status-proven bg-status-proven/10" : "border-status-gap bg-status-gap/10")}>
      <Icon className={cn("size-4 shrink-0", add ? "text-status-proven" : "text-status-gap")} aria-hidden />
      <span className="sr-only">{add ? "Added:" : "Removed:"}</span>
      <span className="shrink-0 text-muted-foreground sm:w-20">Week {week}</span>
      <span className="min-w-0 flex-1 truncate font-sans font-medium text-foreground">{name}</span>
      {hours !== undefined && <span className="shrink-0 text-muted-foreground tabular-nums">{hours}h</span>}
    </div>
  );
}

function Compare({ label, before, after, better }: { label: string; before: string; after: string; better?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums">
        <span className="text-muted-foreground">{before}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="to" />
        <span className={cn(better === true && "text-status-proven", better === false && "text-status-gap")}>{after}</span>
      </dd>
    </div>
  );
}

function SkillDelta({ title, b, a }: { title: string; b: Signal; a: Signal }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-3">
        <Compare label="Share of ads" before={`${b.demandPct}%`} after={`${a.demandPct}%`} better={a.demandPct === b.demandPct ? undefined : a.demandPct > b.demandPct} />
        <Compare label="Forecast a year" before={signed(b.growthPerYear)} after={signed(a.growthPerYear)} better={a.growthPerYear === undefined || b.growthPerYear === undefined || Math.round(a.growthPerYear * 100) === Math.round(b.growthPerYear * 100) ? undefined : a.growthPerYear > b.growthPerYear} />
      </dl>
    </div>
  );
}

export function DiffHunk({ hunk, index, hoursByWeek }: { hunk: Hunk; index: number; hoursByWeek: Map<number, number> }) {
  const reduce = useReducedMotion();
  const out = hunk.outgoing.after, inc = hunk.incoming.after;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : index * 0.04 }}
      className="rounded-xl bg-muted/60 p-3 sm:p-4"
      aria-label={`Change ${index + 1}: week ${hunk.week}, ${out.name} to ${inc.name}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {hunk.kind === "reorder" ? `Move ${inc.name} up ${hunk.weeksSooner} ${hunk.weeksSooner === 1 ? "week" : "weeks"}` : `Swap in ${inc.name}`}
        </p>
        <span className="text-sm text-muted-foreground">Week {hunk.week} starts {dayMonth(hunk.startDate)}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        <DiffLine sign="-" week={hunk.week} name={out.name} hours={hoursByWeek.get(hunk.week)} />
        <DiffLine sign="+" week={hunk.week} name={inc.name} hours={hoursByWeek.get(hunk.week)} />
        {hunk.kind === "reorder" && hunk.otherWeek && (
          <>
            <DiffLine sign="-" week={hunk.otherWeek} name={inc.name} hours={hoursByWeek.get(hunk.otherWeek)} />
            <DiffLine sign="+" week={hunk.otherWeek} name={out.name} hours={hoursByWeek.get(hunk.otherWeek)} />
          </>
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SkillDelta title={`${inc.name} (moves in)`} b={hunk.incoming.before} a={inc} />
        <SkillDelta title={`${out.name} (moves out)`} b={hunk.outgoing.before} a={out} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground"><span className="font-medium text-foreground">Receipt: </span>{hunk.receipt}</p>
    </motion.li>
  );
}

const CHECK_ICON = {
  pass: { icon: CheckCircle2, cls: "text-status-proven", label: "Passed" },
  warn: { icon: AlertTriangle, cls: "text-status-rising", label: "Warning" },
  fail: { icon: XCircle, cls: "text-status-gap", label: "Failed" },
} as const;

export function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y">
      {checks.map((c) => {
        const s = CHECK_ICON[c.status];
        const Icon = s.icon;
        return (
          <li key={c.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <Icon className={cn("mt-0.5 size-5 shrink-0", s.cls)} aria-hidden />
            <div className="min-w-0">
              <p className="font-medium"><span className="sr-only">{s.label}: </span>{c.label}</p>
              <p className="text-sm text-muted-foreground">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RiskPill({ risk }: { risk: ChangeRequest["risk"] }) {
  const cls = risk === "low" ? "border-status-proven/30 bg-status-proven/10" : risk === "medium" ? "border-status-rising/30 bg-status-rising/10" : "border-status-gap/30 bg-status-gap/10";
  const Icon = risk === "low" ? CheckCircle2 : AlertTriangle;
  const ic = risk === "low" ? "text-status-proven" : risk === "medium" ? "text-status-rising" : "text-status-gap";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground", cls)}>
      <Icon className={cn("size-3.5", ic)} aria-hidden />{risk[0].toUpperCase() + risk.slice(1)} risk
    </span>
  );
}

const STATUS_LABEL: Record<ChangeRequest["status"], string> = {
  open: "Open", approved: "Merged", rejected: "Rejected", reverted: "Reverted", closed: "Closed", superseded: "Replaced",
};
export function StatusPill({ status }: { status: ChangeRequest["status"] }) {
  const cls = status === "open" ? "border-primary/30 bg-primary/10" : status === "approved" ? "border-status-proven/30 bg-status-proven/10" : "bg-muted border-border";
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground", cls)}>{STATUS_LABEL[status]}</span>;
}

/** The 12 weeks, with the weeks a pending change would touch highlighted and the incoming skill shown. */
export function PlanWeeks({ weeks, pending }: { weeks: PlanWeekRow[]; pending: Map<number, string> }) {
  return (
    <ol className="divide-y" aria-label="Your roadmap weeks">
      {weeks.map((w) => {
        const next = pending.get(w.week);
        return (
          <li key={w.week} className={cn("flex items-center gap-3 py-2.5", next && "-mx-2 rounded-lg bg-primary/5 px-2")}>
            <span className="w-16 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">Week {w.week}</span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate", next && "text-muted-foreground line-through")}>{w.name}</span>
              {next && <span className="flex items-center gap-1 truncate font-medium"><ArrowRight className="size-3.5 shrink-0 text-primary" aria-hidden /><span className="sr-only">changes to</span>{next}</span>}
            </span>
            {w.locked ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground" title="This week has started or starts within 7 days, so no change request can touch it">
                <Lock className="size-3.5" aria-hidden />Locked
              </span>
            ) : (
              <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">{w.hours}h</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const CAUSE: Record<PlanVersionSummary["cause"], string> = { base: "Original plan", "change-request": "Merged", revert: "Revert" };

export function VersionHistory({ versions, onRevert, busy }: { versions: PlanVersionSummary[]; onRevert: (v: number) => void; busy: boolean }) {
  if (!versions.length) return null;
  return (
    <ol className="divide-y" aria-label="Roadmap versions">
      {versions.map((v) => (
        <li key={v.version} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              <span className="font-mono tabular-nums">v{v.version}</span> {CAUSE[v.cause]}
              {v.current && <span className="ml-2 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium">Live</span>}
            </p>
            <p className="truncate text-sm text-muted-foreground">{v.summary}</p>
          </div>
          {!v.current && (
            <Button variant="outline" className="h-10 shrink-0 rounded-xl px-3" disabled={busy} onClick={() => onRevert(v.version)} aria-label={`Revert your roadmap to version ${v.version}`}>
              <Undo2 aria-hidden />Revert
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}
