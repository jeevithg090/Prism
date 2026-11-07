"use client";

import { useId } from "react";
import { ArrowRight, ArrowUpRight, CircleCheck, RotateCcw } from "lucide-react";
import type { InterviewFeedback } from "@/lib/types";
import { SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";

const SCORE_LABELS: { key: keyof InterviewFeedback["scores"]; label: string; hint: string }[] = [
  { key: "content", label: "Content", hint: "accuracy and depth" },
  { key: "structure", label: "Structure", hint: "situation → action → result" },
  { key: "clarity", label: "Clarity", hint: "plain and concise" },
  { key: "confidence", label: "Confidence", hint: "decisive, owning your work" },
];

export const FILLER_TARGET = 4;

export function averageScore(fb: Pick<InterviewFeedback, "scores">): number {
  const s = fb.scores;
  return (s.content + s.structure + s.clarity + s.confidence) / 4;
}

function barColour(n: number) {
  if (n >= 4) return "bg-status-proven";
  if (n <= 2) return "bg-status-gap";
  return "bg-primary";
}

export interface FeedbackCardProps {
  feedback: InterviewFeedback;
  name: string;
  userId: string;
  onPractiseAgain: () => void;
}

export function FeedbackCard({ feedback, name, userId, onPractiseAgain }: FeedbackCardProps) {
  const avg = averageScore(feedback);
  const filler = feedback.fillerWordsPerMin;
  const fillerOk = filler < FILLER_TARGET;
  const uid = useId();

  return (
    <SectionCard
      title={`Nice work, ${name}!`}
      description="Here's how your practice interview went. Small changes make a big difference."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Average score</p>
            <p className="text-4xl font-semibold tabular-nums text-foreground">
              {avg.toFixed(1)}
              <span className="text-xl text-muted-foreground"> / 5</span>
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Filler words</p>
            <p className="flex flex-wrap items-baseline gap-x-2 text-foreground">
              <span className="text-4xl font-semibold tabular-nums text-foreground">{`${filler.toFixed(1)}/min`}</span>
              <span className="text-sm text-muted-foreground">(aim &lt; {FILLER_TARGET})</span>
              {fillerOk && (
                <span className="inline-flex items-center gap-1 self-center text-sm font-medium text-foreground">
                  <CircleCheck className="h-4 w-4 text-status-proven" aria-hidden="true" />
                  On target
                </span>
              )}
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-4" aria-label="Your scores">
          {SCORE_LABELS.map(({ key, label, hint }) => {
            const v = feedback.scores[key];
            const id = `${uid}-score-${key}`;
            return (
              <li key={key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span id={id} className="font-medium text-foreground">
                    {label} <span className="text-sm font-normal text-muted-foreground">· {hint}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{v}/5</span>
                </div>
                <div
                  role="meter"
                  aria-labelledby={id}
                  aria-valuemin={0}
                  aria-valuemax={5}
                  aria-valuenow={v}
                  aria-valuetext={`${v} out of 5`}
                  className="h-3 w-full overflow-hidden rounded-full bg-primary/10"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${barColour(v)}`}
                    style={{ width: `${Math.max(0, Math.min(5, v)) * 20}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h3 id={`${uid}-strengths`} className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <CircleCheck className="h-5 w-5 text-status-proven" aria-hidden="true" /> What went well
            </h3>
            <ul aria-labelledby={`${uid}-strengths`} className="flex flex-col gap-2">
              {feedback.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-foreground">
                  <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-status-proven" aria-hidden="true" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border p-4">
            <h3 id={`${uid}-improvements`} className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <ArrowUpRight className="h-5 w-5 text-primary" aria-hidden="true" /> Try next time
            </h3>
            <ul aria-labelledby={`${uid}-improvements`} className="flex flex-col gap-2">
              {feedback.improvements.map((s, i) => (
                <li key={i} className="flex gap-2 text-foreground">
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={onPractiseAgain} className="rounded-xl">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Practise again
          </Button>
          <a
            href={`/profile/${encodeURIComponent(userId)}`}
            className="inline-flex items-center rounded-xl border bg-card px-5 py-2.5 font-medium text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            See it on your passport
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </SectionCard>
  );
}
