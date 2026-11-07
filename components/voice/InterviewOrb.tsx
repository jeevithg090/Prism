"use client";

import { Mic } from "lucide-react";

export type OrbState = "idle" | "connecting" | "agent" | "user";

const CORE: Record<OrbState, string> = {
  idle: "bg-primary/10 text-primary motion-safe:animate-pulse",
  connecting: "bg-primary/10 text-primary",
  agent: "bg-primary text-primary-foreground",
  user: "bg-status-proven text-primary-foreground",
};

/**
 * Decorative 240px orb that shows who is talking. The parent renders the
 * matching status text in an sr-only live region, so this stays aria-hidden.
 * Motion only runs under motion-safe; with reduced motion you see a static coloured ring.
 */
export function InterviewOrb({ state }: { state: OrbState }) {
  return (
    <div
      aria-hidden="true"
      data-state={state}
      data-testid="interview-orb"
      className="relative flex h-60 w-60 shrink-0 items-center justify-center"
    >
      {state === "agent" && (
        <>
          <span className="absolute inset-0 rounded-full border-4 border-primary/40 motion-safe:animate-ping" />
          <span className="absolute inset-4 rounded-full border-4 border-primary/60 motion-safe:animate-pulse" />
        </>
      )}
      {state === "user" && (
        <>
          <span className="absolute inset-2 rounded-full border-4 border-status-proven/40 motion-safe:animate-ping" />
          <span className="absolute inset-6 rounded-full border-2 border-status-proven/60" />
        </>
      )}
      {state === "connecting" && (
        <span className="absolute inset-2 rounded-full border-4 border-primary/20 border-t-primary motion-safe:animate-spin" />
      )}
      {state === "idle" && <span className="absolute inset-4 rounded-full border-2 border-primary/20" />}
      <span
        className={`relative flex h-36 w-36 items-center justify-center rounded-full shadow-sm transition-colors duration-200 ${CORE[state]}`}
      >
        <Mic className="h-12 w-12" />
      </span>
    </div>
  );
}
