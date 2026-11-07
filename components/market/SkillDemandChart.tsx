"use client";
// Industry Radar: share of job ads per skill, each bar tagged with YOUR status (proven / degree / gap) and its trend.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, GraduationCap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skillName } from "@/lib/schemas/community";
import type { RoleDemand, SkillId, SkillStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusTag } from "./StatusTag";
import { demandSummary, pctAds, roleInSentence, userTag, type StatusBySkill } from "./summaries";

const BAR: Record<"proven" | "degree" | "gap" | "none", string> = {
  proven: "bg-status-proven",
  degree: "bg-status-degree",
  gap: "bg-status-gap",
  none: "bg-primary",
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
    <figure aria-describedby={summaryId} className="space-y-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="What the tags mean">
        <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-status-proven" aria-hidden />Proven by you · {counts.proven}</li>
        <li className="inline-flex items-center gap-1.5"><GraduationCap className="size-4 text-status-degree" aria-hidden />Covered by your degree · {counts.degree}</li>
        <li className="inline-flex items-center gap-1.5"><Target className="size-4 text-status-gap" aria-hidden />Gap · {counts.gap}</li>
      </ul>
      <ol className="space-y-1" data-testid="demand-rows">
        {rows.map((s, i) => {
          const status: SkillStatus | undefined = statusBySkill[s.skillId];
          const tag = userTag(status) ?? "none";
          const isPicked = picked.includes(s.skillId);
          return (
            <li key={s.skillId}>
              <button
                type="button"
                onClick={() => onPick(s.skillId)}
                aria-pressed={isPicked}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  isPicked && "bg-primary/5",
                )}
              >
                <span className="col-start-1 row-start-1 truncate font-medium">{skillName(s.skillId)}<span className="sr-only">,</span></span>
                <span className="col-span-2 col-start-1 row-start-2 h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <motion.span
                    className={cn("block h-full rounded-full", BAR[tag])}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.25, delay: Math.min(i, 15) * 0.04, ease: "easeOut" }}
                    style={{ width: `${(s.share / max) * 100}%`, transformOrigin: "left" }}
                  />
                </span>
                <span className="col-start-3 row-start-2 text-right font-mono font-semibold tabular-nums">{pctAds(s.share)}<span className="sr-only"> of {role} ads,</span></span>
                <span className="col-span-2 col-start-2 row-start-1 flex items-center justify-end gap-1.5">
                  {status ? <StatusTag status={status} /> : <span className="text-sm text-muted-foreground">Not on your map</span>}
                  {s.trend && s.trend !== "stable" && <><span className="sr-only">,</span><StatusTag status={s.trend} /></>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {demand.skills.length > TOP && (
        <Button variant="ghost" className="h-10 rounded-xl px-3 text-base" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? `Show the top ${TOP}` : `Show all ${demand.skills.length} skills`}
        </Button>
      )}
      <figcaption id={summaryId} className="text-base text-muted-foreground" data-testid="demand-summary">
        {demandSummary(demand, statusBySkill)} Select a skill to add it to the trend chart.
      </figcaption>
    </figure>
  );
}
