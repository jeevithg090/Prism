// "Your degree covers these": the moment the plan values your degree instead of selling you a course.
import { GraduationCap } from "lucide-react";
import type { BridgeNode, SkippedItem } from "@/lib/types";
import { StatusBadge } from "@/components/keystone";
import { skillName } from "@/lib/schemas/community";
import { readableModules, shortModuleTitle, termText } from "./roadmapUtils";

export function SkippedPanel({
  skipped, nodes, hoursPerWeek, moduleTitles,
}: { skipped: SkippedItem[]; nodes?: BridgeNode[]; hoursPerWeek?: number; moduleTitles?: Record<string, string> }) {
  const n = skipped.length;
  return (
    <section id="skipped" aria-labelledby="skipped-h" className="scroll-mt-6 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <GraduationCap className="mt-1 size-6 shrink-0 text-status-degree" aria-hidden />
        <div className="min-w-0">
          <h2 id="skipped-h" className="text-xl font-semibold text-balance">Your degree covers these</h2>
          <p className="mt-1 text-base text-pretty text-muted-foreground">Skipped in this plan: don&apos;t buy a course for something your modules already teach.</p>
          {n && hoursPerWeek ? (
            <p className="mt-3 text-base font-medium text-pretty text-foreground">
              Saves you {n} study {n === 1 ? "week" : "weeks"}, <span className="tabular-nums">{n * hoursPerWeek}</span> hours, on this plan.
            </p>
          ) : null}
        </div>
      </div>
      {n ? (
        <ul className="mt-5 space-y-3">
          {skipped.map((s) => {
            const node = nodes?.find((x) => x.skillId === s.skillId);
            const degree = node?.status === "degree-done" || node?.status === "degree-upcoming" ? node.status : undefined;
            const title = moduleTitles?.[s.moduleCode];
            const when = node?.upcomingLabel ? termText(node.upcomingLabel) : undefined;
            // With the module's title known, one plain sentence; without it, the planner's own sentence, read as words.
            const line = title ? `Taught in ${shortModuleTitle(title)}${when ? `, ${when}` : ""}.` : readableModules(s.message, moduleTitles);
            return (
              <li key={`${s.skillId}-${s.moduleCode}`} className="rounded-xl bg-muted p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="text-lg font-semibold">{node?.name ?? skillName(s.skillId)}</p>
                  {degree && <StatusBadge status={degree} size="sm" />}
                </div>
                <p className="mt-1.5 text-base text-pretty text-foreground">{line}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 text-base text-pretty text-muted-foreground">Nothing skipped this time: none of your next modules overlaps with your gaps.</p>
      )}
    </section>
  );
}
