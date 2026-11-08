"use client";
// Industry Radar: share of job ads per skill, each bar tagged with YOUR status (proven / degree / gap) and its trend.
// The one argued series is your gaps: gap bars wear the gap hue, every other bar stays a quiet ink.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, GraduationCap, LineChart, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skillName } from "@/lib/schemas/community";
import type { RoleDemand, SkillId, SkillStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusTag } from "./StatusTag";
import { COLORS } from "./TrendChart";
import { demandSummary, pctAds, roleInSentence, userTag, type StatusBySkill } from "./summaries";

const BAR: Record<"proven" | "degree" | "gap" | "none", string> = {
  proven: "bg-ink-3/70",
  degree: "bg-ink-3/70",
  gap: "bg-status-gap",
  none: "bg-ink-3/55",
};

const TOP = 10;

export function SkillDemandChart({
  demand,
  statusBySkill,
  picked,
  onPick,
}: {
  demand: RoleDemand;
  statusBySkill: StatusBySkill;
  picked: SkillId[];
  onPick: (skillId: SkillId) => void;
}) {
  const reduce = useReducedMotion();
  const [showAll, setShowAll] = React.useState(false);
  const summaryId = React.useId();
  const rows = showAll ? demand.skills : demand.skills.slice(0, TOP);
  const max = Math.max(0.1, ...demand.skills.map((s) => s.share));
  const role = roleInSentence(demand.roleName);
  const counts = { proven: 0, degree: 0, gap: 0 };
  for (const s of demand.skills) {
    const t = userTag(statusBySkill[s.skillId]);
    if (t) counts[t]++;
  }

  return (
    <figure aria-describedby={summaryId} className="flex flex-col gap-5">
      <figcaption id={summaryId} className="border-b pb-4 text-base text-pretty text-foreground" data-testid="demand-summary">
        {demandSummary(demand, statusBySkill)} <span className="text-muted-foreground">Select a skill to add it to the trend chart.</span>
      </figcaption>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="What the tags mean">
        <li className="inline-flex items-center gap-1.5"><Target className="size-4 text-status-gap" aria-hidden /><span className="font-mono font-semibold text-foreground tabular-nums">{counts.gap}</span> {counts.gap === 1 ? "gap" : "gaps"}</li>
        <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-status-proven" aria-hidden /><span className="font-mono font-semibold text-foreground tabular-nums">{counts.proven}</span> proven by you</li>
        <li className="inline-flex items-center gap-1.5"><GraduationCap className="size-4 text-status-degree" aria-hidden /><span className="font-mono font-semibold text-foreground tabular-nums">{counts.degree}</span> covered by your degree</li>
      </ul>
      <ol className="-mx-2" data-testid="demand-rows">
        {rows.map((s, i) => {
          const status: SkillStatus | undefined = statusBySkill[s.skillId];
          const tag = userTag(status) ?? "none";
          const isPicked = picked.includes(s.skillId);
          const pickColor = isPicked ? COLORS[picked.indexOf(s.skillId)] : undefined;
          return (
            <li key={s.skillId} className="border-t border-border/70 first:border-t-0">
              <button
                type="button"
                onClick={() => onPick(s.skillId)}
                aria-pressed={isPicked}
                style={pickColor ? ({ "--pick": pickColor } as React.CSSProperties) : undefined}
                className={cn(
                  "my-0.5 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_3.25rem] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 text-left outline-none transition-[background-color,color,transform] duration-(--dur-short) hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring active:translate-y-px",
                  isPicked && "bg-muted shadow-[inset_3px_0_0_var(--pick)]",
                )}
              >
                <span className="col-span-2 col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 font-medium text-foreground sm:col-span-1">
                  <span className="truncate">{skillName(s.skillId)}</span>
                  {isPicked && <LineChart className="size-4 shrink-0" style={{ color: pickColor }} aria-hidden />}
                  <span className="sr-only">,</span>
                </span>
                <span className="col-span-3 col-start-1 row-start-3 block h-2.5 w-full sm:row-start-2" aria-hidden>
                  <motion.span
                    className={cn("block h-full rounded-e-xs", BAR[tag])}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.25, delay: Math.min(i, 15) * 0.03, ease: "easeOut" }}
                    style={{ width: `${(s.share / max) * 100}%`, transformOrigin: "left" }}
                  />
                </span>
                <span className="col-start-3 row-start-1 text-right font-mono font-semibold text-foreground tabular-nums">{pctAds(s.share)}<span className="sr-only"> of {role} ads,</span></span>
                <span className="col-span-3 col-start-1 row-start-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-end">
                  {status ? <StatusTag status={status} /> : <span className="text-sm whitespace-nowrap text-muted-foreground">Not on your map</span>}
                  {s.trend && s.trend !== "stable" && <><span className="sr-only">,</span><StatusTag status={s.trend} /></>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {demand.skills.length > TOP && (
        <Button variant="ghost" className="-ml-2 self-start" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? `Show the top ${TOP}` : `Show all ${demand.skills.length} skills`}
        </Button>
      )}
    </figure>
  );
}
