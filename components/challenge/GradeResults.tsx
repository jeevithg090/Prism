"use client";
// Rubric ✓/○ per criterion with Socratic hints, the hidden tests, and formative feedback. Never the answer.
import * as React from "react";
import { CheckCircle2, Circle, HelpCircle } from "lucide-react";
import { AgentAvatar } from "@/components/keystone";
import type { CriterionResult, GradeResult } from "./model";

function Row({ r }: { r: CriterionResult }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      {r.met
        ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
        : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
      <div className="min-w-0 space-y-2">
        <p className="font-medium">
          <span className="sr-only">{r.met ? "Met: " : "Not yet: "}</span>{r.title}
        </p>
        {!r.met && r.hint && (
          <p className="flex gap-2 rounded-lg bg-status-rising/10 px-3 py-2 text-sm text-foreground">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-status-rising" aria-hidden />
            <span><span className="font-medium">Think about: </span>{r.hint}</span>
          </p>
        )}
      </div>
    </li>
  );
}

/** A figure and what it counts, as the column's heading: "1 of 4" set large, the label above it in the body face. */
function Tally({ label, count, total, verb }: { label: string; count: number; total: number; verb: string }) {
  return (
    <h3 className="mb-4 flex flex-col gap-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>{" "}
      <span className="flex items-baseline gap-2 text-foreground">
        <span className="font-mono text-3xl leading-none font-semibold tabular-nums">{count} of {total}</span>{" "}
        <span className="text-base font-medium">{verb}</span>
      </span>
    </h3>
  );
}

export function GradeResults({ result }: { result: GradeResult }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-8 md:grid-cols-2 md:gap-6">
        <div className="min-w-0">
          <Tally label="Rubric" count={result.rubricMet} total={result.rubric.length} verb="met" />
          <ul className="divide-y border-t pt-3">{result.rubric.map((r) => <Row key={r.id} r={r} />)}</ul>
        </div>
        <div className="min-w-0">
          <Tally label="Hidden tests" count={result.checksPassed} total={result.checks.length} verb="passed" />
          <ul className="divide-y border-t pt-3">{result.checks.map((r) => <Row key={r.id} r={r} />)}</ul>
        </div>
      </div>
      <div className="flex gap-3 rounded-xl bg-muted p-4">
        <AgentAvatar agent="techlead" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">Tech Lead feedback</p>
          <p className="text-base leading-7 text-foreground">{result.feedback}</p>
          {result.feedbackSource === "rules" && (
            <p className="text-sm text-muted-foreground">Written from the rubric, so it&apos;s the same every time. Hints are questions, never the fix.</p>
          )}
        </div>
      </div>
    </div>
  );
}
