// "Skipped: your degree covers these": the moment the plan values your degree instead of selling you a course.
import { GraduationCap } from "lucide-react";
import type { BridgeNode, SkippedItem } from "@/lib/types";
import { skillName } from "@/lib/schemas/community";

export function SkippedPanel({ skipped, nodes, hoursPerWeek }: { skipped: SkippedItem[]; nodes?: BridgeNode[]; hoursPerWeek?: number }) {
  return (
    <section
      id="skipped"
      aria-labelledby="skipped-h"
      className="scroll-mt-6 rounded-2xl border border-l-4 border-status-degree/30 border-l-status-degree bg-card p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-degree/10 text-status-degree">
          <GraduationCap className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="skipped-h" className="text-xl font-semibold">Skipped: your degree covers these</h2>
          <p className="text-sm text-muted-foreground">Don&apos;t buy a course for something your modules already teach.</p>
        </div>
      </div>
      {skipped.length ? (
        <ul className="mt-4 divide-y">
          {skipped.map((s) => {
            const node = nodes?.find((n) => n.skillId === s.skillId);
            return (
              <li key={`${s.skillId}-${s.moduleCode}`} className="py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{node?.name ?? skillName(s.skillId)}</span>
                  <span className="text-sm text-muted-foreground">
                    <span className="font-mono text-foreground">{s.moduleCode}</span>
                    {node?.upcomingLabel ? ` · ${node.upcomingLabel}` : ""}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{s.message}</p>
                {hoursPerWeek ? <p className="mt-1 text-sm text-foreground">Saves you a study week ({hoursPerWeek} hours) on this plan.</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Nothing skipped this time: none of your next modules overlaps with your gaps.</p>
      )}
    </section>
  );
}
