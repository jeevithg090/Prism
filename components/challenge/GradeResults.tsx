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
          <p className="flex gap-2 rounded-xl border border-status-rising/25 bg-status-rising/10 px-3 py-2 text-sm text-foreground">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-status-rising" aria-hidden />
            <span><span className="font-medium">Think about: </span>{r.hint}</span>
          </p>
        )}
      </div>
    </li>
  );
}

export function GradeResults({ result }: { result: GradeResult }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-base font-semibold">
            Rubric · <span className="tabular-nums">{result.rubricMet} of {result.rubric.length}</span> met
          </h3>
          <ul className="divide-y">{result.rubric.map((r) => <Row key={r.id} r={r} />)}</ul>
        </div>
        <div>
          <h3 className="mb-3 text-base font-semibold">
            Hidden tests · <span className="tabular-nums">{result.checksPassed} of {result.checks.length}</span> passed
          </h3>
          <ul className="divide-y">{result.checks.map((r) => <Row key={r.id} r={r} />)}</ul>
        </div>
      </div>
      <div className="flex gap-3 rounded-xl bg-muted/60 p-4">
        <AgentAvatar agent="techlead" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">Tech Lead feedback</p>
          <p className="text-sm leading-6 text-foreground">{result.feedback}</p>
          {result.feedbackSource === "rules" && (
            <p className="text-xs text-muted-foreground">Written from the rubric, so it&apos;s the same every time. Hints are questions, never the fix.</p>
          )}
        </div>
      </div>
    </div>
  );
}
