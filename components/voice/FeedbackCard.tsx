"use client";
// Post-call feedback: 4 score bars out of 5, filler words a minute, strengths, improvements and the proof it saved.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, BadgeCheck, CheckCircle2, RotateCcw } from "lucide-react";
import { BadgePill, DemoDataNote } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InterviewFeedback } from "@/lib/types";

export type FeedbackView = InterviewFeedback & { evidence?: { id: string; label: string }[]; skillName?: string };

const BARS: { key: keyof InterviewFeedback["scores"]; label: string; hint: string }[] = [
  { key: "content", label: "Content", hint: "accuracy and depth" },
  { key: "structure", label: "Structure", hint: "situation → action → result" },
  { key: "clarity", label: "Clarity", hint: "plain and concise" },
  { key: "confidence", label: "Confidence", hint: "decisive, few fillers" },
];

export const FILLER_TARGET = 4;
export const average = (s: InterviewFeedback["scores"]) => (s.content + s.structure + s.clarity + s.confidence) / 4;

export function FeedbackCard({
  feedback, name, isDemo, onAgain, passportHref,
}: { feedback: FeedbackView; name: string; isDemo?: boolean; onAgain: () => void; passportHref: string }) {
  const reduce = useReducedMotion();
  const avg = average(feedback.scores);
  const ready = avg >= 3.5;
  const proof = feedback.evidence?.length ? feedback.evidence.map((e) => e.label).join(" · ") : null;
  return (
    <section aria-labelledby="feedback-title" className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b p-6 md:flex-row md:items-start md:justify-between md:p-8">
        <div className="space-y-2">
          <h2 id="feedback-title" className="text-2xl font-semibold tracking-tight">Nice work, {name}. Here&apos;s your feedback.</h2>
          <p className="text-muted-foreground">
            Average <span className="font-mono font-semibold tabular-nums text-foreground">{avg.toFixed(1)} of 5</span>
            {ready ? ", which counts towards your interview-ready badge." : ". An average of 3.5 earns the interview-ready badge."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {ready && <BadgePill badge="interview-ready" />}
            {isDemo && <DemoDataNote />}
          </div>
        </div>
        <div className="rounded-xl bg-muted/60 px-4 py-3 md:text-right">
          <p className="font-mono text-4xl font-semibold tabular-nums" data-testid="filler-rate">{feedback.fillerWordsPerMin.toFixed(1)}/min</p>
          <p className="text-sm text-muted-foreground">filler words a minute</p>
          <p className="text-sm text-muted-foreground">aim for under {FILLER_TARGET}</p>
        </div>
      </div>

      <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ul className="space-y-4" aria-label="Scores out of 5">
          {BARS.map((b, i) => {
            const v = feedback.scores[b.key];
            return (
              <li key={b.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span id={`score-${b.key}`} className="font-medium">{b.label} <span className="text-sm font-normal text-muted-foreground">· {b.hint}</span></span>
                  <span className="font-mono font-semibold tabular-nums">{v}/5</span>
                </div>
                <div
                  role="meter" aria-labelledby={`score-${b.key}`} aria-valuemin={1} aria-valuemax={5} aria-valuenow={v} aria-valuetext={`${v} out of 5`}
                  className="h-3 overflow-hidden rounded-full bg-muted"
                >
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${(v / 5) * 100}%` }}
                    transition={{ duration: 0.25, ease: "easeOut", delay: reduce ? 0 : i * 0.04 }}
                    style={reduce ? { width: `${(v / 5) * 100}%` } : undefined}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="space-y-6">
          <div>
            <h3 className="mb-2 font-semibold">What went well</h3>
            <ul className="space-y-2">
              {feedback.strengths.map((s) => (
                <li key={s} className="flex gap-2"><CheckCircle2 className="mt-1 size-4 shrink-0 text-status-proven" aria-hidden /><span>{s}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Try next time</h3>
            <ul className="space-y-2" aria-label="Improvements">
              {feedback.improvements.map((s) => (
                <li key={s} className="flex gap-2"><ArrowUpRight className="mt-1 size-4 shrink-0 text-status-rising" aria-hidden /><span>{s}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t p-6 md:flex-row md:items-center md:justify-between md:px-8">
        {proof ? (
          <p className="flex items-center gap-2 rounded-xl border border-status-proven/25 bg-status-proven/10 px-3 py-2 text-sm text-foreground" data-testid="saved-proof">
            <BadgeCheck className="size-4 shrink-0 text-status-proven" aria-hidden />
            <span>Saved as proof: <strong>{proof}</strong></span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isDemo ? "This is demo feedback, so nothing was saved as proof." : "Nothing saved as proof this time. Practise again and explain one concrete detail."}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onAgain}>
            <RotateCcw className="size-4" aria-hidden /> Practise again
          </Button>
          <Link href={passportHref} className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>See it on your passport</Link>
        </div>
      </div>
    </section>
  );
}
