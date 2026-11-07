"use client";
// P5 · one senior's journey: outcome, a mini step timeline, their advice, and (if they opted in) Ask for 15 minutes.
import * as React from "react";
import { MessageCircleHeart } from "lucide-react";
import type { Trajectory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoDataNote } from "@/components/keystone";

const KIND_LABEL: Record<Trajectory["steps"][number]["kind"], string> = {
  "module-choice": "Modules", project: "Project", society: "Society", hackathon: "Hackathon",
  internship: "Internship", placement: "Placement", "first-role": "First role",
};

/** Keeps compound words like "health-tech" on one line (non-breaking hyphen). */
function keepCompounds(text: string) {
  return text.replace(/(?<=\p{L})-(?=\p{L})/gu, "\u2011");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export function TrajectoryCard({
  trajectory, similarity, onAsk, className, showDemoNote = true,
}: {
  trajectory: Trajectory;
  /** 0..1, from /api/trajectories/similar */
  similarity?: number;
  onAsk?: (t: Trajectory) => void;
  className?: string;
  /** Off when a row of cards shares one demo note beside its heading. */
  showDemoNote?: boolean;
}) {
  const first = trajectory.name.split(/\s+/)[0] ?? trajectory.name;
  const headingId = `traj-${trajectory.id}-name`;
  return (
    <article
      aria-labelledby={headingId}
      className={cn("relative flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm", className)}
    >
      <header className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold text-foreground">
          {initials(trajectory.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-lg leading-tight font-semibold [overflow-wrap:break-word] text-foreground">{trajectory.name}</h3>
          <p className="mt-1 min-h-[2lh] text-sm leading-snug text-pretty text-muted-foreground">
            <span className="sr-only">Now: </span>{keepCompounds(trajectory.outcomeRole)}
          </p>
        </div>
      </header>

      {similarity !== undefined && (
        <p className="flex items-baseline gap-2 border-t pt-4 text-sm text-muted-foreground">
          <span className="font-mono text-3xl leading-none font-medium tabular-nums text-foreground">{Math.round(similarity * 100)}%</span>
          similar to you
        </p>
      )}

      <ol aria-label={`${first}'s journey`} className="relative space-y-3 pl-6">
        <span aria-hidden className="absolute top-2 bottom-2 left-[6px] w-px bg-border" />
        {trajectory.steps.map((s, i) => {
          const last = i === trajectory.steps.length - 1;
          const reached = last || s.kind === "first-role";
          // The role already shows under the name; a last step that repeats it keeps only its meta line.
          const repeatsRole = last && s.label.trim() === trajectory.outcomeRole.trim();
          return (
            <li key={`${s.year}-${i}`} className="relative">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1.5 -left-6 size-[13px] rounded-full border-2",
                  reached ? "border-foreground bg-foreground" : "border-rule-2 bg-card",
                )}
              />
              <p className="text-sm text-muted-foreground">
                Year {s.year}, {KIND_LABEL[s.kind].toLowerCase()}
                {repeatsRole && <span className="sr-only">: {s.label}</span>}
              </p>
              {!repeatsRole && (
                <p className={cn("text-base leading-snug text-foreground", reached && "font-medium")}>{keepCompounds(s.label)}</p>
              )}
            </li>
          );
        })}
      </ol>

      <blockquote className="rounded-xl bg-muted p-4 text-base leading-relaxed text-pretty text-foreground">
        “{trajectory.advice}”
      </blockquote>

      <footer className="flex flex-wrap items-center justify-between gap-3">
        {trajectory.isDemo && showDemoNote ? <DemoDataNote /> : <span />}
        {trajectory.openToChat ? (
          <Button variant="outline" onClick={() => onAsk?.(trajectory)} aria-label={`Ask for 15 minutes with ${first}`}>
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
