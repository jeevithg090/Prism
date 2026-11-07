"use client";
// Modules ranked by refresh urgency. Each row is a button that opens the module's receipts and refresh note.
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Hourglass, Minus, ScanSearch, TrendingUp, XCircle } from "lucide-react";
import type { ModuleHalfLife } from "@/lib/labs/halflife/schema";
import { cn } from "@/lib/utils";
import { BAND_LABEL, band, lifeLabel } from "./format";

const LIFE_ICON = { decaying: Hourglass, growing: TrendingUp, durable: Minus, "no-signal": ScanSearch } as const;

export function UrgencyBar({ decay, drift }: { decay: number; drift: number }) {
  const d = Math.min(100, decay);
  const r = Math.min(100 - d, drift);
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="h-full bg-chart-2" style={{ width: `${d}%` }} />
      <span className="h-full bg-chart-1" style={{ width: `${r}%` }} />
    </span>
  );
}

export function ModuleRanking({ modules, selected, onSelect }: { modules: ModuleHalfLife[]; selected: string | null; onSelect: (code: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <ol className="divide-y" aria-label="Modules ranked by refresh urgency">
      {modules.map((m, i) => {
        const Icon = LIFE_ICON[m.status];
        const b = band(m.urgency);
        const active = m.code === selected;
        return (
          <motion.li
            key={m.code}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : Math.min(i, 10) * 0.04 }}
          >
            <button
              type="button"
              onClick={() => onSelect(m.code)}
              aria-pressed={active}
              className={cn(
                "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-2 py-3 text-left transition-colors",
                "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-primary/10 hover:bg-primary/10",
              )}
            >
              <span className="font-mono text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="font-mono">{m.code}</span>
                  <span className="inline-flex items-center gap-1"><Icon className="size-3.5" aria-hidden />{lifeLabel(m)}</span>
                  {m.decision && (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      {m.decision.decision === "adopted" ? <CheckCircle2 className="size-3.5 text-status-proven" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                      {m.decision.decision === "adopted" ? "Adopted" : "Dismissed"}
                    </span>
                  )}
                </span>
              </span>
              <span className="flex w-20 flex-col items-end gap-1 sm:w-28">
                <span className="font-mono text-xl font-semibold tabular-nums">{m.urgency}</span>
                <UrgencyBar decay={m.urgencyParts.decay} drift={m.urgencyParts.drift} />
                <span className="sr-only">urgency of 100, {BAND_LABEL[b]}</span>
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );
}
