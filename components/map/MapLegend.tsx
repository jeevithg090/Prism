// The graph's key: each status as icon + text, plus the rising ring and what size and lines mean.
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER } from "./mapUtils";

export function MapLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="How to read the map" className={cn("flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground", className)}>
      {STATUS_ORDER.map((s) => {
        const m = STATUS_META[s];
        const Icon = m.icon;
        return (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-full", m.dot)} aria-hidden />
            <Icon className="size-4 text-foreground" aria-hidden />
            <span className="text-foreground">{m.label}</span>
          </li>
        );
      })}
      <li className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-full border-2 border-status-rising" aria-hidden />
        <TrendingUp className="size-4 text-foreground" aria-hidden />
        <span className="text-foreground">Rising demand (amber ring)</span>
      </li>
      <li>Bigger circle = more job ads · lines join a skill to what it builds on</li>
    </ul>
  );
}
