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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

const BURST = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const dist = i % 2 ? 64 : 80;
  return {
    x: Math.cos(a) * dist,
    y: Math.sin(a) * dist,
    cls: ["bg-status-proven", "bg-primary", "bg-status-rising"][i % 3],
    size: i % 2 ? "size-1.5" : "size-2",
  };
});

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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-linear-to-b from-status-proven/15 via-status-proven/5 to-transparent"
      />

      {/* hero: the Bridge Map node turns green */}
      <div aria-hidden className="relative mx-auto mb-6 size-24">
        {!reduce &&
          BURST.map((d, i) => (
            <motion.span
              key={i}
              className={cn(
                "absolute top-1/2 left-1/2 -mt-1 -ml-1 rounded-full",
                d.cls,
                d.size,
              )}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: d.x,
                y: d.y,
                opacity: [0, 1, 0],
                scale: [0.4, 1, 0.6],
              }}
              transition={{ delay: 0.75, duration: 0.9, ease: "easeOut" }}
            />
          ))}
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full bg-status-proven/30"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.8], opacity: [0.55, 0] }}
            transition={{
              delay: 0.8,
              duration: 1.3,
              repeat: 1,
              ease: "easeOut",
            }}
          />
        )}
        {!reduce && (
          <motion.span
            className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-status-gap/40 bg-status-gap/10 text-status-gap"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 0.7 }}
            transition={{ delay: 0.55, duration: 0.3 }}
          >
            <Target className="size-10" />
          </motion.span>
        )}
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-status-proven text-background shadow-lg shadow-status-proven/30"
          initial={reduce ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.7,
            type: "spring",
            stiffness: 260,
            damping: 15,
          }}
        >
          <Check className="size-12" strokeWidth={3} />
        </motion.span>
      </div>

      <DialogTitle className="text-center text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
        {result.skillName} is now proven
      </DialogTitle>
      <DialogDescription className="mx-auto mt-2 max-w-sm text-center text-base text-pretty">
        Your merged pull request is real evidence, not a self-claim. It&apos;s
        on your Bridge Map now.
      </DialogDescription>

      {/* status change: Gap → Proven */}
      <div className="mt-5 flex items-center justify-center gap-3 [&_svg]:size-4 [&>span>span]:px-3 [&>span>span]:py-1 [&>span>span]:text-sm">
        <span className="sr-only">
          {result.skillName} changed from Gap to Proven.
        </span>
        <motion.span
          aria-hidden
          initial={reduce ? false : { opacity: 1 }}
          animate={{ opacity: 0.45 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          <StatusBadge status="gap" />
        </motion.span>
        <ArrowRight aria-hidden className="text-muted-foreground" />
        <motion.span
          aria-hidden
          initial={reduce ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.8,
            type: "spring",
            stiffness: 300,
            damping: 18,
          }}
        >
          <StatusBadge status="proven" />
        </motion.span>
      </div>

      {/* readiness count-up */}
      <div className="mt-6 rounded-2xl border bg-muted/40 p-5 sm:p-6">
        <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Job readiness
        </p>
        <p className="sr-only">
          Readiness went from {before}% to {after}%, {deltaLabel}.
        </p>
        <div
          aria-hidden
          className="mt-1 flex flex-wrap items-end justify-center gap-x-4 gap-y-2"
        >
          <span
            data-testid="readiness-before"
            className="pb-2 text-2xl font-semibold text-muted-foreground tabular-nums sm:text-3xl"
          >
            {before}%
          </span>
          <ArrowRight className="mb-3.5 size-6 text-muted-foreground" />
          <span
            data-testid="readiness-after"
            className="text-6xl leading-none font-bold tracking-tight tabular-nums sm:text-7xl"
          >
            {shown}%
          </span>
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.3 }}
            className="mb-2 rounded-full bg-status-proven/10 px-3 py-1 text-sm font-semibold text-status-proven tabular-nums"
          >
            {deltaLabel}
          </motion.span>
        </div>
        <div
          aria-hidden
          className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-background ring-1 ring-border"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
            style={{ width: `${before}%` }}
          />
          <motion.div
            className="absolute inset-y-0 rounded-r-full bg-status-proven"
            style={{ left: `${before}%` }}
            initial={reduce ? false : { width: "0%" }}
            animate={{ width: `${Math.max(delta, 0)}%` }}
            transition={{ delay: 0.9, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* rewards */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 [&>span>span]:px-3 [&>span>span]:py-1 [&>span>span]:text-sm">
        {result.badgesEarned.map((b) => (
          <span key={b}>
            <BadgePill badge={b} />
          </span>
        ))}
        <span>
          <span className="inline-flex items-center gap-1 rounded-full border border-status-rising/25 bg-status-rising/10 font-medium text-status-rising">
            <TrendingUp className="size-4" aria-hidden />+
            {result.momentumPoints} momentum
          </span>
        </span>
      </div>
      <p
        data-testid="reviewer-proof"
        className="mx-auto mt-4 max-w-md text-center text-sm text-balance text-muted-foreground sm:text-base"
      >
        <HeartHandshake
          className="mr-1.5 inline size-4 -translate-y-px text-primary sm:size-5"
          aria-hidden
        />
        <strong className="font-semibold text-foreground">{reviewer}</strong>{" "}
        earned a{" "}
        <strong className="font-semibold text-foreground">Code review</strong>{" "}
        proof for teaching you
      </p>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href={mapHref}
          onClick={onClose}
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}
        >
          See it on my Bridge Map
          <ArrowRight aria-hidden />
        </Link>
        <Button
          variant="outline"
          size="lg"
          onClick={onClose}
          className="h-11 px-5 text-base"
        >
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-x-hidden overflow-y-auto rounded-3xl p-6 pt-10 sm:max-w-xl sm:p-10">
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
