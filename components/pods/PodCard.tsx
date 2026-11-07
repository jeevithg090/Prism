"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, ArrowRight, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Pod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AvatarStack } from "./MemberAvatar";
import { MemberRow } from "./MemberRow";
import { memberIds, useMemberProfiles } from "./members";
import { StartProjectButton } from "./StartProjectButton";

function CompatibilityBar({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const pctValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-muted-foreground">Compatibility</span>{" "}
        <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums">{pctValue}%</span>
      </p>
      <div
        role="progressbar"
        aria-label="Compatibility"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctValue}
        aria-valuetext={`${pctValue}%`}
        className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pctValue}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </div>
    </div>
  );
}

export type PodCardProps = {
  pod: Pod;
  viewerId: string;
  /** Re-runs the match. Hidden when not provided. */
  onFindDifferent?: () => void;
  /** "start" creates the project; "open" links to an existing one. Defaults to "open" when the pod has a project. */
  cta?: "start" | "open";
};

/** The match result: who's in the pod, what each person learns and teaches, and why it works. */
export function PodCard({ pod, viewerId, onFindDifferent, cta }: PodCardProps) {
  const reduce = useReducedMotion();
  const ids = memberIds(pod);
  const people = useMemberProfiles(ids);
  const mode = cta ?? (pod.project ? "open" : "start");
  // The viewer first, then everyone else in pod order.
  const members = [...pod.members].sort((a, b) => Number(b.userId === viewerId) - Number(a.userId === viewerId));
  const lines = [...pod.explanations].sort(
    (a, b) =>
      Number(b.fromUserId === viewerId || b.toUserId === viewerId) -
      Number(a.fromUserId === viewerId || a.toUserId === viewerId),
  );
  const titleId = `pod-${pod.id}-title`;

  return (
    <section
      aria-labelledby={titleId}
      data-testid="pod-card"
      className="rounded-2xl border bg-card shadow-sm"
    >
      <header className="flex flex-col gap-6 rounded-t-2xl border-b bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_60%)] p-6 md:flex-row md:items-end md:justify-between md:p-8">
        <div className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Your pod · {pod.members.length} students</p>
          <h2 id={titleId} className="text-4xl font-semibold tracking-tight md:text-5xl">
            {pod.name}
          </h2>
          <AvatarStack members={ids.map((id) => people[id])} size="lg" />
        </div>
        <div className="w-full md:w-80">
          <CompatibilityBar value={pod.score} />
        </div>
      </header>

      <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10">
        <div>
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Who&apos;s in it</h3>
          <ul aria-label="Members" className="divide-y">
            {members.map((m) => (
              <MemberRow key={m.userId} member={m} info={people[m.userId]} isViewer={m.userId === viewerId} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-4 text-sm font-semibold tracking-wide text-muted-foreground uppercase">How you&apos;ll help each other</h3>
          {lines.length ? (
            <ul aria-label="Why this pod works" className="space-y-3">
              {lines.map((e, i) => (
                <motion.li
                  key={`${e.fromUserId}-${e.toUserId}-${i}`}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut", delay: 0.2 + i * 0.04 }}
                  className="flex items-start gap-3 rounded-xl border bg-background/60 p-4"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ArrowLeftRight className="size-4" aria-hidden />
                  </span>
                  <p className="pt-1 text-base leading-snug">{e.text}</p>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Everyone here is strong in something another member wants to learn.</p>
          )}
        </div>
      </div>

      <footer className="z-10 flex flex-col-reverse gap-3 rounded-b-2xl border-t bg-card/95 p-4 backdrop-blur max-md:sticky max-md:bottom-[calc(var(--mobile-nav-height,0px)+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end md:p-6">
        {onFindDifferent && (
          <Button variant="outline" size="lg" onClick={onFindDifferent} className="h-12 rounded-xl px-5 text-base">
            <RefreshCw className="size-4" aria-hidden />
            Find a different pod
          </Button>
        )}
        {mode === "start" ? (
          <StartProjectButton pod={pod} />
        ) : (
          <Link
            href={`/pods/${pod.id}`}
            className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl px-6 text-base")}
          >
            Open our project
            <ArrowRight className="size-5" aria-hidden />
          </Link>
        )}
      </footer>
    </section>
  );
}
