"use client";
// P5 · <LadderStep skillName from level />: the moment a skill climbs a rung, e.g. "Docker ●●○ · Rung 2 · Built it".
// Pure (no fetching), so the pod ProofCelebration can render it: <LadderStep skillName="Docker" from={1} level={2} />.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { RungDot } from "./LadderRungs";
import { RUNG_LABEL, RUNG_MEANING, RUNGS, type RungNumber } from "./model";

export function LadderStep({ skillName, level, from, className }: {
  skillName: string;
  /** The rung just reached, 1..3. */
  level: RungNumber;
  /** The level before (defaults to level − 1). */
  from?: 0 | 1 | 2 | 3;
  className?: string;
}) {
  const reduce = useReducedMotion() === true;
  const before = from ?? ((level - 1) as 0 | 1 | 2);
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)} data-testid="ladder-step">
      <p className="sr-only">
        {skillName} climbed to rung {level} of 3, {RUNG_LABEL[level]}. {RUNG_MEANING[level]}
      </p>
      <ol aria-hidden className="flex items-center">
        {RUNGS.map((r, i) => {
          const done = r <= level;
          const isNew = done && r > before;
          return (
            <li key={r} className="flex items-center">
              {i > 0 && <span className={cn("h-0.5 w-6 sm:w-8", done ? "bg-status-proven" : "bg-border")} />}
              <motion.span
                initial={reduce || !isNew ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.25 + i * 0.04, duration: 0.25, ease: "easeOut" }}
              >
                <RungDot rung={{ rung: r, status: done ? "done" : "open" }} size="lg" />
              </motion.span>
            </li>
          );
        })}
      </ol>
      <p aria-hidden className="text-base font-semibold">
        <span className="text-muted-foreground">Rung {level} · </span>{RUNG_LABEL[level]} <Check className="inline size-4 -translate-y-px text-status-proven" /> {skillName}
      </p>
    </div>
  );
}

export default LadderStep;
