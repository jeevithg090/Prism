"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./draft";

/** Progress for the 4 steps: a segmented track, coral where you are, ink where you've been.
 *  Finished steps are buttons, so you can jump back to edit them. */
export function Stepper({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  return (
    <nav aria-label="Onboarding progress" className="space-y-4">
      <p className="text-sm text-muted-foreground" data-testid="step-count">
        Step <span className="font-mono font-semibold tabular-nums text-foreground">{current + 1}</span> of <span className="font-mono font-semibold tabular-nums text-foreground">{STEPS.length}</span>
      </p>
      <ol className="grid grid-cols-4 gap-2 sm:gap-3">
        {STEPS.map((s, i) => {
          const done = i < current;
          const here = i === current;
          const body = (
            <>
              <span aria-hidden className={cn("block h-1 w-full rounded-sm", here ? "bg-primary" : done ? "bg-foreground" : "bg-border")} />
              <span className={cn("flex min-w-0 items-start gap-1.5 text-sm leading-snug", here ? "font-semibold text-foreground" : done ? "font-medium" : "text-muted-foreground")}>
                {done && <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                <span className="min-w-0">
                  <span className="sr-only">Step {i + 1}: </span>{s.label}{here && <span className="sr-only"> (current)</span>}
                </span>
              </span>
            </>
          );
          return (
            <li key={s.id} aria-current={here ? "step" : undefined} className="min-w-0">
              {done ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  aria-label={`Back to step ${i + 1}: ${s.label}`}
                  className="group flex min-h-11 w-full cursor-pointer flex-col gap-2 rounded-md text-left text-foreground outline-none transition-[color,transform] duration-(--dur-short) hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring active:translate-y-px"
                >
                  {body}
                </button>
              ) : (
                <span className="flex min-h-11 flex-col gap-2">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
