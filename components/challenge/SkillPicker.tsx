"use client";
// Pick the skill to try. Toggle chips with aria-pressed, grouped under their Bridge Map status (colour, icon and label
// via StatusBadge), the roadmap week's focus marked, rung-1 skills ticked. Groups keep the menu's order, so the focus
// skill stays first.
import * as React from "react";
import { CheckCircle2, Route } from "lucide-react";
import { StatusBadge } from "@/components/keystone";
import { cn } from "@/lib/utils";
import type { ChallengeMenu } from "./model";

type Option = ChallengeMenu["options"][number];

function groupByStatus(options: Option[]) {
  const groups: { status?: Option["status"]; options: Option[] }[] = [];
  for (const o of options) {
    const g = groups.find((x) => x.status === o.status);
    if (g) g.options.push(o);
    else groups.push({ status: o.status, options: [o] });
  }
  return groups;
}

export function SkillPicker({ menu, value, onChange }: { menu: ChallengeMenu; value?: string; onChange: (skillId: string) => void }) {
  const groups = groupByStatus(menu.options);
  return (
    <div role="group" aria-label="Choose a skill to try" className="space-y-3">
      {groups.map((g) => (
        <div key={g.status ?? "other"} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
          {g.status && (
            <div className="flex h-10 shrink-0 items-center sm:w-24">
              <StatusBadge status={g.status} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => {
              const selected = o.skillId === value;
              const focus = o.skillId === menu.focusSkillId;
              return (
                <button
                  key={o.skillId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(o.skillId)}
                  className={cn(
                    "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-foreground outline-none",
                    "transition-[background-color,border-color,color,transform] duration-(--dur-short) active:translate-y-px",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected ? "border-primary bg-card ring-1 ring-primary" : "border-border bg-card hover:border-rule-2 hover:bg-accent",
                  )}
                >
                  {o.tried && <CheckCircle2 className="size-4 text-status-proven" aria-hidden />}
                  <span>{o.skillName}</span>
                  {typeof o.demand === "number" && (
                    <span className="font-normal text-muted-foreground tabular-nums">{Math.round(o.demand * 100)}% of ads</span>
                  )}
                  {focus && (
                    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-xs font-medium text-foreground">
                      <Route className="size-3.5 text-muted-foreground" aria-hidden />
                      {menu.focusWeek ? `Week ${menu.focusWeek}` : "Top gap"}
                    </span>
                  )}
                  {o.tried && <span className="sr-only">(Tried it: done)</span>}
                  {o.status === "gap" && !o.tried && <span className="sr-only">(gap)</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
