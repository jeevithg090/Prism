"use client";
// The graph card's toolbar: its title, the graph/list switch, and one toggle per status
// (aria-pressed; the status icon in its colour, the label and a count).
import { List, Network } from "lucide-react";
import type { SkillStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FOCUS, STATUS_META, STATUS_ORDER } from "./mapUtils";

export type MapView = "graph" | "list";

const TONE: Record<SkillStatus, string> = {
  proven: "text-status-proven", "degree-done": "text-status-degree", "degree-upcoming": "text-status-degree", gap: "text-status-gap",
};

export function MapFilters({
  counts, active, onToggle, view, onView,
}: {
  counts: Record<SkillStatus, number>; active: Set<SkillStatus>; onToggle: (s: SkillStatus) => void;
  view: MapView; onView: (v: MapView) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="graph-h" className="text-xl font-semibold text-foreground">{view === "graph" ? "Skills graph" : "Skills table"}</h2>
        <div role="group" aria-label="Map view" className="inline-flex rounded-xl bg-muted p-1">
          {([["graph", "Graph", Network], ["list", "View as list", List]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onView(v)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-(--dur-short) ease-(--ease-out) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
                FOCUS,
                view === v ? "bg-card text-foreground shadow-stock" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Show skills by status" className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          const on = active.has(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(s)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-(--dur-short) ease-(--ease-out) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
                FOCUS,
                on
                  ? "border-rule-2 bg-card text-foreground hover:bg-muted"
                  : "border-dashed border-field bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", on ? TONE[s] : "text-muted-foreground")} aria-hidden />
              {m.label}
              <span className="ml-0.5 font-mono text-muted-foreground tabular-nums">{counts[s]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
