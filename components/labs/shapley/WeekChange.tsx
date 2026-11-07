"use client";
// Readiness Explained · what moved this week: the change since 7 days ago, split by the same Shapley shares,
// and the last six weeks replayed from evidence dates and module term ends.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Explanation } from "@/lib/labs/shapley/model";
import { cn } from "@/lib/utils";
import { KIND, shortDate, signed } from "./format";

export function WeekChange({ x }: { x: Explanation }) {
  const reduce = useReducedMotion();
  const { week, timeline } = x;
  const max = Math.max(...timeline.map((t) => t.points), 1);
  const up = week.deltaPoints >= 0;
  const flat = Math.abs(week.deltaPoints) < 0.05;
  const summary = flat
    ? week.lastChange
      ? `Nothing changed in the last 7 days. Your last move was ${signed(week.lastChange.deltaPoints)} points in the week to ${shortDate(week.lastChange.weekOf)}.`
      : "Nothing changed in the last six weeks."
    : `Since ${shortDate(week.since)} your readiness moved ${signed(week.deltaPoints)} points, from ${Math.round(week.fromPoints)}% to ${Math.round(week.toPoints)}%.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{flat ? "0.0" : signed(week.deltaPoints)}</p>
        <p className="pb-1 text-muted-foreground">
          points since {shortDate(week.since)}
          {!flat && (up ? <TrendingUp className="ml-1.5 inline size-4 text-status-proven" aria-hidden /> : <TrendingDown className="ml-1.5 inline size-4 text-status-gap" aria-hidden />)}
        </p>
      </div>

      <figure className="space-y-3">
        <div className="flex items-end gap-2 sm:gap-3" aria-hidden>
          {timeline.map((t, i) => (
            <div key={t.weekOf} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(t.points)}%</span>
              <span className="flex h-24 w-full items-end">
                <motion.span
                  className={cn("block w-full rounded-t-lg", i === timeline.length - 1 ? "bg-primary" : "bg-chart-1/45")}
                  style={{ height: `${Math.max((t.points / max) * 100, 2)}%`, transformOrigin: "bottom center" }}
                  initial={reduce ? false : { opacity: 0, scaleY: 0 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.22, ease: "easeOut", delay: reduce ? 0 : i * 0.04 }}
                />
              </span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{shortDate(t.weekOf)}</span>
            </div>
          ))}
        </div>
        <figcaption className="text-sm text-muted-foreground" aria-live="polite">{summary}</figcaption>
        <div className="sr-only">
          <table>
            <caption>Readiness per week, replayed from your evidence dates</caption>
            <thead><tr><th scope="col">Week of</th><th scope="col">Readiness</th></tr></thead>
            <tbody>{timeline.map((t) => <tr key={t.weekOf}><td>{shortDate(t.weekOf)}</td><td>{Math.round(t.points)}%</td></tr>)}</tbody>
          </table>
        </div>
      </figure>

      {week.movers.length > 0 && (
        <div>
          <h3 className="font-semibold">What moved it</h3>
          <ul className="mt-2 divide-y">
            {week.movers.map((m) => (
              <li key={m.contributorId} className="flex items-center justify-between gap-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("size-2.5 shrink-0 rounded-full", KIND[m.kind].dot)} aria-hidden />
                  <span className="truncate">{m.label}</span>
                  <span className="sr-only">({KIND[m.kind].label})</span>
                </span>
                <span className="font-mono font-semibold tabular-nums">{signed(m.points)}</span>
              </li>
            ))}
          </ul>
          {week.movers.some((m) => m.points < 0) && (
            <p className="mt-2 text-sm text-muted-foreground">A source can lose share without anything getting worse: a new proof now shares a skill it used to cover alone.</p>
          )}
        </div>
      )}
    </div>
  );
}
