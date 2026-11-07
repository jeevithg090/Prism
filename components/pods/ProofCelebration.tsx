"use client";
// The demo payoff: a merged pod PR turns a gap into proof of skill. Big enough to read on a projector.
import * as React from "react";
import Link from "next/link";
import { animate, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  HeartHandshake,
  Target,
  TrendingUp,
} from "lucide-react";
import type { ProofResult } from "@/lib/schemas/studio";
import { BadgePill, StatusBadge } from "@/components/keystone";
import { LadderStep } from "@/components/ladder/LadderStep";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const firstName = (names: Record<string, string>, id: string) =>
  (names[id]?.trim() || (id ? id[0].toUpperCase() + id.slice(1) : id)).split(
    /\s+/,
  )[0];

/** Animated integer count-up; returns the final value straight away when `run` is false. */
function useCountUp(
  from: number,
  to: number,
  run: boolean,
  delay = 0.9,
  duration = 1.2,
) {
  const [value, setValue] = React.useState(from);
  React.useEffect(() => {
    if (!run) return;
    const controls = animate(from, to, {
      delay,
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [from, to, run, delay, duration]);
  return run ? value : to;
}

/** Readiness as an arc: coral for where you were, green for what this proof added, drawn in once. */
function ReadinessArc({ before, after, reduce }: { before: number; after: number; reduce: boolean }) {
  const gained = Math.max(after - before, 0);
  return (
    <svg viewBox="0 0 120 120" className="size-32 shrink-0 -rotate-90" aria-hidden focusable="false">
      <circle cx="60" cy="60" r="50" fill="none" strokeWidth="12" className="stroke-paper-3" />
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        strokeWidth="12"
        pathLength={100}
        strokeDasharray={`${before} 100`}
        className="stroke-primary"
      />
      <g transform={`rotate(${before * 3.6} 60 60)`}>
        <motion.circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          strokeWidth="12"
          pathLength={100}
          strokeDasharray={`${gained} 100`}
          className="stroke-status-proven"
          initial={reduce ? false : { strokeDashoffset: gained }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ delay: 0.9, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </g>
    </svg>
  );
}

function CelebrationBody({
  result,
  names,
  onClose,
  mapHref,
}: {
  result: ProofResult;
  names: Record<string, string>;
  onClose: () => void;
  mapHref: string;
}) {
  const reduce = useReducedMotion() === true;
  const before = Math.round(result.readinessBefore * 100);
  const after = Math.round(result.readinessAfter * 100);
  const delta = after - before;
  const shown = useCountUp(before, after, !reduce);
  const reviewer = firstName(names, result.reviewerUserId);
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta} ${Math.abs(delta) === 1 ? "point" : "points"}`;

  return (
    <>
      {/* The Bridge Map node: the gap target gives way to a proven check, once. */}
      <div aria-hidden className="relative mx-auto mb-6 size-20">
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-status-proven"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
            transition={{ delay: 0.8, duration: 0.9, ease: "easeOut" }}
          />
        )}
        {!reduce && (
          <motion.span
            className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-status-gap/45 bg-status-gap/10 text-status-gap"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 0.7 }}
            transition={{ delay: 0.55, duration: 0.3 }}
          >
            <Target className="size-9" />
          </motion.span>
        )}
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-status-proven text-background"
          initial={reduce ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: "spring", stiffness: 260, damping: 16 }}
        >
          <Check className="size-10" strokeWidth={3} />
        </motion.span>
      </div>

      <DialogTitle className="text-center text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl">
        {result.skillName} is now proven
      </DialogTitle>
      <DialogDescription className="mx-auto mt-2 max-w-sm text-center text-base text-pretty text-muted-foreground">
        Your merged pull request is real evidence, not a self-claim. It&apos;s
        on your Bridge Map now.
      </DialogDescription>

      {/* Status change: Gap to Proven */}
      <div className="mt-5 flex items-center justify-center gap-3">
        <span className="sr-only">
          {result.skillName} changed from Gap to Proven.
        </span>
        <motion.span
          aria-hidden
          initial={reduce ? false : { opacity: 1 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <StatusBadge status="gap" />
        </motion.span>
        <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
        <motion.span
          aria-hidden
          initial={reduce ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 300, damping: 18 }}
        >
          <StatusBadge status="proven" />
        </motion.span>
      </div>

      <LadderStep skillName={result.skillName} from={1} level={2} className="mt-6" />

      {/* Readiness: before, after, and what moved it */}
      <div className="mt-6 flex flex-col items-center gap-5 rounded-xl bg-muted p-5 sm:flex-row sm:gap-6 sm:p-6">
        <ReadinessArc before={before} after={after} reduce={reduce} />
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium text-muted-foreground">Job readiness</p>
          <p className="sr-only">
            Readiness went from {before}% to {after}%, {deltaLabel}.
          </p>
          <div aria-hidden className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
            <span
              data-testid="readiness-before"
              className="font-mono text-3xl font-semibold text-muted-foreground tabular-nums"
            >
              {before}%
            </span>
            <ArrowRight className="size-5 text-muted-foreground" />
            <span
              data-testid="readiness-after"
              className="font-mono text-5xl leading-none font-semibold text-foreground tabular-nums"
            >
              {shown}%
            </span>
          </div>
          <div aria-hidden className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <motion.span
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6, duration: 0.22 }}
              className="inline-flex h-8 items-center rounded-md border border-status-proven/35 bg-status-proven/10 px-2.5 text-base font-semibold text-foreground tabular-nums"
            >
              {deltaLabel}
            </motion.span>
            <span className="text-sm text-muted-foreground">for proving {result.skillName}</span>
          </div>
        </div>
      </div>

      {/* What you and your reviewer earned */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {result.badgesEarned.map((b) => (
          <BadgePill key={b} badge={b} />
        ))}
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-sm font-medium text-foreground">
          <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
          <span className="tabular-nums">+{result.momentumPoints} momentum</span>
        </span>
      </div>
      <p
        data-testid="reviewer-proof"
        className="mx-auto mt-4 max-w-md text-center text-base text-balance text-muted-foreground"
      >
        <HeartHandshake
          className="mr-1.5 inline size-5 -translate-y-px text-muted-foreground"
          aria-hidden
        />
        <strong className="font-semibold text-foreground">{reviewer}</strong>{" "}
        earned a{" "}
        <strong className="font-semibold text-foreground">Code review</strong>{" "}
        proof for teaching you
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={mapHref} onClick={onClose} className={buttonVariants({ size: "lg" })}>
          See it on my Bridge Map
        </Link>
        <Button variant="outline" size="lg" onClick={onClose}>
          Back to the project
        </Button>
      </div>
    </>
  );
}

export function ProofCelebration({
  result,
  names,
  onClose,
  mapHref = "/map",
}: {
  result: ProofResult | null;
  names: Record<string, string>;
  onClose: () => void;
  mapHref?: string;
}) {
  // Keep the last result while the dialog animates out.
  const [last, setLast] = React.useState(result);
  if (result && result !== last) setLast(result);
  const shown = result ?? last;

  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      {shown && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-x-clip overflow-y-auto p-6 pt-10 sm:max-w-xl sm:p-10">
          <CelebrationBody
            key={`${shown.podId}:${shown.issueIndex}:${shown.evidenceIds.join(",")}`}
            result={shown}
            names={names}
            onClose={onClose}
            mapHref={mapHref}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

export default ProofCelebration;
