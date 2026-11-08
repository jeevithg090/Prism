"use client";
// P5 slot component (P3's dashboard + passport): growth-based momentum for one student.
import * as React from "react";
import { Info, Sprout } from "lucide-react";
import { toast } from "sonner";
import type { MomentumWeek } from "@/lib/types";
import { describeBreakdown, describeKind, formatChange, POINTS, PROBLEM_SOLVED_WEEKLY_CAP } from "@/lib/momentum";
import { cn } from "@/lib/utils";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useApiData } from "./useApiData";
import { Sparkline } from "./Sparkline";
import { demoWeeks } from "./demo";

export const MOMENTUM_FOOTNOTE = "Ranked on growth, not on who’s ‘best’.";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function changeSentence(pct: number): string {
  if (pct > 0) return `${pct} percent above your usual week`;
  if (pct < 0) return `${Math.abs(pct)} percent below your usual week`;
  return "the same as your usual week";
}

export function MomentumWidget({ userId }: { userId: string }) {
  const { status, data, retry } = useApiData<MomentumWeek[]>(`/api/momentum/${encodeURIComponent(userId)}`);
  const [demo, setDemo] = React.useState<MomentumWeek[] | null>(null);
  const weeks = demo ?? data;

  if (!demo && status === "loading") {
    return <div role="status" aria-label="Loading your momentum"><LoadingSkeleton variant="card" /></div>;
  }
  if (!demo && status === "error") {
    return (
      <ErrorState
        title="We couldn’t load your momentum"
        body="Your steps are safe. Try again in a moment."
        onRetry={retry}
        onUseDemo={() => { setDemo(demoWeeks()); toast("Showing demo momentum data"); }}
      />
    );
  }
  if (!weeks?.length || weeks.every((w) => w.score === 0)) {
    return (
      <EmptyState
        icon={Sprout}
        title="Your momentum starts with your first step this week."
        body="Merge a pod PR, finish a roadmap week or help a newcomer, and it shows up here."
      />
    );
  }
  return <MomentumCard weeks={weeks} isDemo={!!demo} />;
}

function MomentumCard({ weeks, isDemo }: { weeks: MomentumWeek[]; isDemo: boolean }) {
  const titleId = React.useId();
  const latest = weeks[weeks.length - 1];
  const tone = latest.changePct > 0 ? "text-status-proven" : latest.changePct < 0 ? "text-status-gap" : "text-muted-foreground";
  const breakdownText = describeBreakdown(latest.breakdown);
  const summary =
    `Your momentum this week is ${latest.score} points, ${changeSentence(latest.changePct)}. ` +
    (breakdownText ? `This week: ${breakdownText}. ` : "Nothing logged yet this week. ") +
    `Weekly points for the last ${weeks.length} weeks, oldest first: ${weeks.map((w) => w.score).join(", ")}.`;

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={titleId} className="text-xl font-semibold text-foreground">Momentum</h2>
        <div className="flex items-center gap-2">
          {isDemo && <DemoDataNote />}
          <Popover>
            <PopoverTrigger className={cn(buttonVariants({ variant: "ghost" }), "-me-2 active:bg-accent disabled:cursor-not-allowed disabled:opacity-55")}>
              <Info aria-hidden />
              Breakdown
            </PopoverTrigger>
            <PopoverContent align="end">
              <PopoverTitle>This week ({latest.week})</PopoverTitle>
              <PopoverDescription>{breakdownText || "Nothing logged yet this week."}</PopoverDescription>
              {latest.breakdown.length > 0 && (
                <ul className="space-y-1">
                  {latest.breakdown.map((b) => (
                    <li key={b.kind} className="flex justify-between gap-4">
                      <span>{capitalise(describeKind(b.kind, b.count))}</span>
                      <span className="font-mono text-muted-foreground tabular-nums">+{b.points}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-muted-foreground">
                Points: merged PR {POINTS["pr-merged"]}, milestone {POINTS["roadmap-milestone"]}, helping a newcomer {POINTS["helped-newcomer"]}, mock
                interview {POINTS["mock-interview"]}, problem solved {POINTS["problem-solved"]} (up to {PROBLEM_SOLVED_WEEKLY_CAP} a week).
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div aria-hidden="true">
        <p className={cn("mt-4 font-mono text-4xl leading-none font-semibold tracking-tight tabular-nums", tone)}>{formatChange(latest.changePct)}</p>
        <p className="mt-2 text-sm text-muted-foreground">vs your usual week</p>
        <div className="mt-5 h-16 w-full">
          <Sparkline values={weeks.map((w) => w.score)} height={64} />
        </div>
      </div>
      <p className="sr-only">{summary}</p>

      <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{MOMENTUM_FOOTNOTE}</p>
    </section>
  );
}
