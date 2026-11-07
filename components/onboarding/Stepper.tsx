"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./draft";

/** Progress for the 4 steps. Finished steps are buttons, so you can jump back to edit them. */
export function Stepper({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  return (
    <nav aria-label="Onboarding progress" className="space-y-3">
      <p className="text-sm text-muted-foreground" data-testid="step-count">
        Step <span className="font-mono font-semibold tabular-nums text-foreground">{current + 1}</span> of <span className="font-mono font-semibold tabular-nums text-foreground">{STEPS.length}</span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${((current + 1) / STEPS.length) * 100}%` }} />
      </div>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const here = i === current;
          const dot = (
            <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
              here && "border-primary bg-primary text-primary-foreground", done && "border-primary bg-primary/10 text-primary", !here && !done && "bg-card text-muted-foreground")}>
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
          );
          const label = (
            <span className={cn("sr-only truncate text-sm sm:not-sr-only", here ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <span className="sr-only">Step {i + 1}: </span>{s.label}{here && <span className="sr-only"> (current)</span>}
            </span>
          );
          return (
            <li key={s.id} aria-current={here ? "step" : undefined} className="min-w-0">
              {done ? (
                <button type="button" onClick={() => onJump(i)} className="flex min-h-10 w-full items-center gap-2 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Back to step ${i + 1}: ${s.label}`}>
                  {dot}{label}
                </button>
              ) : (
                <span className="flex min-h-10 items-center gap-2">{dot}{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
