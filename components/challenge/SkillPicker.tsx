"use client";
// Pick the skill to try. Pill toggles with aria-pressed, the roadmap week's focus marked, rung-1 skills ticked.
import * as React from "react";
import { CheckCircle2, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChallengeMenu } from "./model";

export function SkillPicker({ menu, value, onChange }: { menu: ChallengeMenu; value?: string; onChange: (skillId: string) => void }) {
  return (
    <div role="group" aria-label="Choose a skill to try" className="flex flex-wrap gap-2">
      {menu.options.map((o) => {
        const selected = o.skillId === value;
        const focus = o.skillId === menu.focusSkillId;
        return (
          <button
            key={o.skillId}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.skillId)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary bg-primary/10 text-foreground" : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {o.tried
              ? <CheckCircle2 className="size-4 text-status-proven" aria-hidden />
              : <span aria-hidden className={cn("size-2 rounded-full", o.status === "gap" ? "bg-status-gap" : o.status === "proven" ? "bg-status-proven" : "bg-status-degree")} />}
            <span>{o.skillName}</span>
            {typeof o.demand === "number" && <span className="text-muted-foreground tabular-nums">{Math.round(o.demand * 100)}% of ads</span>}
            {focus && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <Route className="size-3.5" aria-hidden />{menu.focusWeek ? `Week ${menu.focusWeek}` : "Top gap"}
              </span>
            )}
            {o.tried && <span className="sr-only">(Tried it: done)</span>}
            {o.status === "gap" && !o.tried && <span className="sr-only">(gap)</span>}
          </button>
        );
      })}
    </div>
  );
}
