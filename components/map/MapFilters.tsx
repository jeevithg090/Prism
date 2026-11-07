"use client";
// Status filter chips (pill toggles with aria-pressed, a colour dot, the icon, the label and a count).
import { List, Network } from "lucide-react";
import type { SkillStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER } from "./mapUtils";

export type MapView = "graph" | "list";

export function MapFilters({
  counts, active, onToggle, view, onView,
}: {
  counts: Record<SkillStatus, number>; active: Set<SkillStatus>; onToggle: (s: SkillStatus) => void;
  view: MapView; onView: (v: MapView) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="graph-h" className="text-xl font-semibold">{view === "graph" ? "Skills graph" : "Skills table"}</h2>
        <div role="group" aria-label="Map view" className="inline-flex rounded-xl border bg-muted/60 p-1">
          {([["graph", "Graph", Network], ["list", "View as list", List]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onView(v)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
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
                "inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-foreground/20 bg-card text-foreground shadow-sm" : "border-dashed bg-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              <span className={cn("size-2.5 rounded-full", m.dot, !on && "opacity-50")} aria-hidden />
              <Icon className="size-4" aria-hidden />
              {m.label}
              <span className="font-mono tabular-nums text-muted-foreground">{counts[s]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
