"use client";
// The one thing that matters on the board: what the agent suggests now, and the lecturer's decision.
import { Eye, Hand, Hourglass, MessageCircleQuestion, Presentation, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/labs/pulse/model";
import { cn } from "@/lib/utils";

const ICON = { hold: Hourglass, explain: Presentation, peer: Users, nudge: MessageCircleQuestion, watch: Eye } as const;
const CTA = { explain: "Run the 3-minute explainer", peer: "Start peer discussion", nudge: "Show the hint" } as const;

export function YouDecide() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-0.5 text-sm font-medium">
      <Hand className="size-4 text-primary" aria-hidden />You decide
    </span>
  );
}

export function SuggestionPanel({ suggestion, since = null, busy, onRun, onSkip }: {
  suggestion: Suggestion; since?: string | null; busy: boolean; onRun: () => void; onSkip: () => void;
}) {
  const Icon = ICON[suggestion.kind];
  const actionable = suggestion.kind === "explain" || suggestion.kind === "peer" || suggestion.kind === "nudge";
  return (
    <div className="flex h-full flex-col gap-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          actionable ? "bg-status-gap/10 text-status-gap" : "bg-primary/10 text-primary",
        )}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{suggestion.headline}</p>
          <p className="mt-2 text-lg">{suggestion.action}</p>
          {since && <p className="mt-1 text-sm text-muted-foreground">Suggested at minute {since}. The board below is live.</p>}
        </div>
      </div>
      {actionable && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <YouDecide />
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            <Button variant="outline" className="h-11 rounded-xl px-4" disabled={busy} onClick={onSkip}>Not now</Button>
            <Button className="h-11 rounded-xl px-5" disabled={busy} onClick={onRun}>
              {busy ? "Drafting…" : CTA[suggestion.kind as keyof typeof CTA]}
            </Button>
          </div>
        </div>
      )}
      <p className="text-muted-foreground">{suggestion.rationale}</p>

      {suggestion.explainer && (
        <div className="space-y-2 border-t pt-4">
          <p className="font-semibold">Drafted from the rubric: {suggestion.explainer.title}</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            {suggestion.explainer.points.map((p) => <li key={p}>{p}</li>)}
          </ol>
          <p><span className="font-medium">Ask the room:</span> {suggestion.explainer.askTheRoom}</p>
        </div>
      )}
    </div>
  );
}
