"use client";
// Decorative call-state mark (aria-hidden); the status itself is announced by the parent's live region.
// State, never decoration: the ring changes colour and size when the turn changes. A spinner while connecting is the only loop.
// In Practice mode the ring is the question count: one arc per question, coral up to the one you're on, the number at the centre.
import { Loader2, Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrbState = "connecting" | "agent" | "user" | "idle";

const GAP = 4; // gap between arcs, in pathLength units (of 100)

export function InterviewOrb({ state, progress, className }: { state: OrbState; progress?: { at: number; of: number }; className?: string }) {
  const live = state === "agent" || state === "user";
  const p = progress && progress.of > 0 && state !== "connecting" ? progress : null;
  return (
    <div aria-hidden data-state={state} className={cn("relative grid size-28 shrink-0 place-items-center md:size-32", className)}>
      {p ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none">
          {Array.from({ length: p.of }, (_, i) => {
            const seg = 100 / p.of - GAP;
            return (
              <circle
                key={i} cx="50" cy="50" r="47" pathLength={100} strokeWidth="4"
                strokeDasharray={`${seg} ${100 - seg}`}
                transform={`rotate(${-90 + (i * 360) / p.of + (GAP * 3.6) / 2} 50 50)`}
                className={cn("transition-[stroke] duration-(--dur-short) motion-reduce:transition-none", i < p.at ? "stroke-primary" : "stroke-border")}
              />
            );
          })}
        </svg>
      ) : (
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 transition-[border-color,transform] duration-(--dur-short) ease-(--ease-out) motion-reduce:transition-none",
            state === "user" ? "border-primary" : state === "agent" ? "border-foreground" : "border-border",
            live ? "scale-100" : "scale-90",
          )}
        />
      )}
      <span className="absolute inset-3 rounded-full bg-muted" />
      {state === "connecting" ? (
        <Loader2 className="relative size-8 text-muted-foreground motion-safe:animate-spin" />
      ) : p ? (
        <span className={cn("relative font-mono text-3xl leading-none font-semibold tabular-nums", state === "user" ? "text-primary" : "text-foreground")}>{p.at}</span>
      ) : state === "agent" ? (
        <Volume2 className="relative size-8 text-foreground" />
      ) : state === "user" ? (
        <Mic className="relative size-8 text-primary" />
      ) : (
        <Mic className="relative size-8 text-muted-foreground" />
      )}
    </div>
  );
}
