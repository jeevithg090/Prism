"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { DemoDataNote } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Pod } from "@/lib/types";
import { AvatarStack } from "./MemberAvatar";
import { MemberRow } from "./MemberRow";
import { DEMO_POD_ID, memberIds, useMemberProfiles } from "./members";
import { SkillExchangeGraph } from "./SkillExchangeGraph";
import { StartProjectButton } from "./StartProjectButton";
import { WhyPodsWork } from "./WhyPodsWork";

function CompatibilityBar({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const pctValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-muted-foreground">Compatibility</span>{" "}
        <span className="font-mono text-5xl font-semibold tabular-nums">{pctValue}%</span>
      </p>
      <div
        role="progressbar"
        aria-label="Compatibility"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctValue}
        aria-valuetext={`${pctValue}%`}
        className="mt-3 h-2 w-full overflow-hidden rounded-sm bg-muted"
      >
        {/* scaleX, never width: the bar grows on the compositor and reduced motion skips straight to the value. */}
        <motion.div
          className="h-full w-full origin-left rounded-sm bg-primary"
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: pctValue / 100 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </div>
      <p className="mt-2 text-sm text-pretty text-muted-foreground">From skills you can teach each other, shared interests and free time.</p>
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

/** The match result: who teaches whom and why it works, who's in the pod, and the one next step. */
export function PodCard({ pod, viewerId, onFindDifferent, cta }: PodCardProps) {
  const ids = memberIds(pod);
  const people = useMemberProfiles(ids);
  const names = Object.fromEntries(ids.map((id) => [id, people[id]?.name ?? id]));
  const mode = cta ?? (pod.project ? "open" : "start");
  // The viewer first, then everyone else in pod order.
  const members = [...pod.members].sort((a, b) => Number(b.userId === viewerId) - Number(a.userId === viewerId));
  const titleId = `pod-${pod.id}-title`;

  return (
    <section aria-labelledby={titleId} data-testid="pod-card" className="rounded-2xl border bg-card shadow-sm">
      <header className="grid gap-6 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-end lg:gap-12">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={titleId} className="min-w-0 text-3xl font-semibold [overflow-wrap:anywhere] md:text-4xl">
              {pod.name}
            </h2>
            <WhyPodsWork />
            {pod.id === DEMO_POD_ID && <DemoDataNote />}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <AvatarStack members={ids.map((id) => people[id])} size="lg" />
            <p className="text-sm font-medium text-muted-foreground">Your pod of {pod.members.length} students</p>
          </div>
        </div>
        <CompatibilityBar value={pod.score} />
      </header>

      <div className="border-t p-6 md:p-8">
        <SkillExchangeGraph pod={pod} names={names} viewerId={viewerId} explanations={pod.explanations} />
      </div>

      <div className="border-t p-6 md:p-8">
        <h3 className="mb-5 text-xl font-semibold">Who&apos;s in it</h3>
        <ul aria-label="Members" className="divide-y">
          {members.map((m) => (
            <MemberRow key={m.userId} member={m} info={people[m.userId]} isViewer={m.userId === viewerId} />
          ))}
        </ul>
      </div>

      <footer className="z-(--z-sticky) flex items-center justify-end gap-3 rounded-b-2xl border-t bg-inherit p-4 max-md:sticky max-md:bottom-[calc(var(--mobile-nav-height,0px)+env(safe-area-inset-bottom))] sm:p-6 md:px-8">
        {onFindDifferent && (
          <Button variant="outline" size="lg" onClick={onFindDifferent} title="Find a different pod">
            <RefreshCw aria-hidden />
            {/* On phones the sticky bar keeps one row: the icon stays, the words stay for screen readers. */}
            <span className="max-sm:sr-only">Find a different pod</span>
          </Button>
        )}
        {mode === "start" ? (
          <StartProjectButton pod={pod} className="max-sm:flex-1" />
        ) : (
          <Link href={`/pods/${pod.id}`} className={buttonVariants({ size: "lg", className: "max-sm:flex-1" })}>
            Open our project
          </Link>
        )}
      </footer>
    </section>
  );
}
