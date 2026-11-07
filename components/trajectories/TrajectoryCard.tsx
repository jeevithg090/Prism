"use client";
// P5 · one senior's journey: outcome, a mini step timeline, their advice, and (if they opted in) Ask for 15 minutes.
import * as React from "react";
import { MessageCircleHeart, Sparkles } from "lucide-react";
import type { Trajectory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoDataNote } from "@/components/keystone";

const KIND_LABEL: Record<Trajectory["steps"][number]["kind"], string> = {
  "module-choice": "Modules", project: "Project", society: "Society", hackathon: "Hackathon",
  internship: "Internship", placement: "Placement", "first-role": "First role",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export function TrajectoryCard({
  trajectory, similarity, onAsk, className,
}: {
  trajectory: Trajectory;
  /** 0..1, from /api/trajectories/similar */
  similarity?: number;
  onAsk?: (t: Trajectory) => void;
  className?: string;
}) {
  const first = trajectory.name.split(/\s+/)[0] ?? trajectory.name;
  const headingId = `traj-${trajectory.id}-name`;
  return (
    <article
      aria-labelledby={headingId}
      className={cn("relative flex h-full flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm", className)}
    >
      <header className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {initials(trajectory.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-lg font-semibold leading-tight">{trajectory.name}</h3>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">
            <span className="sr-only">Now: </span>{trajectory.outcomeRole}
          </p>
        </div>
      </header>

      {similarity !== undefined && (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          <span className="tabular-nums">{Math.round(similarity * 100)}%</span> similar to you
        </p>
      )}

      <ol aria-label={`${first}'s journey`} className="relative space-y-3 pl-6">
        <span aria-hidden className="absolute top-1.5 bottom-1.5 left-[7px] w-px bg-border" />
        {trajectory.steps.map((s, i) => {
          const last = i === trajectory.steps.length - 1;
          return (
            <li key={`${s.year}-${i}`} className="relative">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 -left-6 size-[15px] rounded-full border-2 bg-card",
                  last || s.kind === "first-role" ? "border-primary bg-primary" : "border-primary/60",
                )}
              />
              <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
                Year {s.year} · {KIND_LABEL[s.kind]}
              </p>
              <p className="text-[15px] leading-snug">{s.label}</p>
            </li>
          );
        })}
      </ol>

      <blockquote className="border-l-2 border-primary/40 pl-3 text-[15px] leading-relaxed text-foreground/80 italic">
        “{trajectory.advice}”
      </blockquote>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        {trajectory.isDemo ? <DemoDataNote /> : <span />}
        {trajectory.openToChat ? (
          <Button variant="outline" size="lg" className="h-10 rounded-xl px-4" onClick={() => onAsk?.(trajectory)} aria-label={`Ask for 15 minutes with ${first}`}>
            <MessageCircleHeart aria-hidden />
            Ask for 15 minutes
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Not taking chats right now</span>
        )}
      </footer>
    </article>
  );
}
