"use client";
// Post-call feedback: 4 score bars out of 5, filler words a minute, strengths, improvements and the proof it saved.
// The two figures lead, the four meters are the one argued series (coral), then what to keep and what to try.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, CheckCircle2, Lightbulb, RotateCcw } from "lucide-react";
import { BadgePill, DemoDataNote } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import type { InterviewFeedback } from "@/lib/types";

export type FeedbackView = InterviewFeedback & { evidence?: { id: string; label: string }[]; skillName?: string };

const BARS: { key: keyof InterviewFeedback["scores"]; label: string; hint: string }[] = [
  { key: "content", label: "Content", hint: "accuracy and depth" },
  { key: "structure", label: "Structure", hint: "situation, action, result" },
  { key: "clarity", label: "Clarity", hint: "plain and concise" },
  { key: "confidence", label: "Confidence", hint: "decisive, few fillers" },
];

export const FILLER_TARGET = 4;

// A mono figure with one decimal; the point is pulled in so "3.5" doesn't read as "3 . 5" on a projector.
function Decimal({ n }: { n: number }) {
  const [whole, frac] = n.toFixed(1).split(".");
  return <>{whole}<span className="-mx-[0.12em]">.</span>{frac}</>;
}
export const average = (s: InterviewFeedback["scores"]) => (s.content + s.structure + s.clarity + s.confidence) / 4;

export function FeedbackCard({
  feedback, name, isDemo, onAgain, passportHref,
}: { feedback: FeedbackView; name: string; isDemo?: boolean; onAgain: () => void; passportHref: string }) {
  const reduce = useReducedMotion();
  const avg = average(feedback.scores);
  const ready = avg >= 3.5;
  const proof = feedback.evidence?.length ? feedback.evidence.map((e) => e.label).join(", ") : null;
  return (
    <section aria-labelledby="feedback-title" className="rounded-2xl border bg-card shadow-sm">
      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="feedback-title" className="max-w-[28ch] text-2xl font-semibold text-balance text-foreground">Nice work, {name}. Here&apos;s your feedback.</h2>
          {isDemo && <DemoDataNote />}
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-6 border-t pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Average</dt>
            <dd className="mt-2 font-mono text-5xl leading-none font-semibold tracking-[-0.06em] text-foreground tabular-nums">
              <Decimal n={avg} /><span className="ml-1.5 font-sans text-xl font-medium tracking-normal text-muted-foreground">of 5</span>
            </dd>
            <dd className="mt-3 flex flex-wrap items-center gap-2">
              {ready ? <BadgePill badge="interview-ready" /> : <span className="text-sm text-pretty text-muted-foreground">An average of 3.5 earns the interview-ready badge.</span>}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Filler words a minute</dt>
            <dd className="mt-2 font-mono text-5xl leading-none font-semibold tracking-[-0.06em] text-foreground tabular-nums" data-testid="filler-rate">
              <Decimal n={feedback.fillerWordsPerMin} /><span className="ml-1.5 font-sans text-xl font-medium tracking-normal text-muted-foreground">/min</span>
            </dd>
            <dd className="mt-3 text-sm text-muted-foreground">Aim for under {FILLER_TARGET}.</dd>
          </div>
        </dl>
      </div>

      <div className="border-t px-6 py-2 md:px-8">
        <ul aria-label="Scores out of 5">
          {BARS.map((b, i) => {
            const v = feedback.scores[b.key];
            return (
              <li key={b.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t py-4 first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)_3rem]">
                <div className="min-w-0">
                  <span id={`score-${b.key}`} className="block font-medium text-foreground">{b.label}</span>
                  <span className="block text-sm text-muted-foreground">{b.hint}</span>
                </div>
                <span className="font-mono text-lg font-semibold text-foreground tabular-nums sm:order-last sm:text-right">{v}/5</span>
                <div
                  role="meter" aria-labelledby={`score-${b.key}`} aria-valuemin={1} aria-valuemax={5} aria-valuenow={v} aria-valuetext={`${v} out of 5`}
                  className="col-span-2 h-2.5 overflow-hidden rounded-sm bg-muted sm:col-span-1"
                >
                  <motion.div
                    className="h-full origin-left rounded-sm bg-primary"
                    style={{ width: `${(v / 5) * 100}%` }}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.25, ease: "easeOut", delay: reduce ? 0 : i * 0.04 }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-8 border-t p-6 md:p-8 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">What went well</h3>
          <ul className="mt-3 space-y-3">
            {feedback.strengths.map((s) => (
              <li key={s} className="flex gap-3"><CheckCircle2 className="mt-1 size-4 shrink-0 text-status-proven" aria-hidden /><span className="text-pretty text-foreground">{s}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Try next time</h3>
          <ul className="mt-3 space-y-3" aria-label="Improvements">
            {feedback.improvements.map((s) => (
              <li key={s} className="flex gap-3"><Lightbulb className="mt-1 size-4 shrink-0 text-status-rising" aria-hidden /><span className="text-pretty text-foreground">{s}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t px-6 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:px-8">
        {proof ? (
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-foreground sm:min-w-64" data-testid="saved-proof">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
            <span>Saved as proof: <strong className="font-semibold">{proof}</strong></span>
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-sm text-pretty text-muted-foreground sm:min-w-64">
            {isDemo ? "This is demo feedback, so nothing was saved as proof." : "Nothing saved as proof this time. Practise again and explain one concrete detail."}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:shrink-0">
          <Button variant="outline" onClick={onAgain}>
            <RotateCcw className="size-4" aria-hidden /> Practise again
          </Button>
          <Link href={passportHref} className={buttonVariants()}>See it on your passport</Link>
        </div>
      </div>
    </section>
  );
}
