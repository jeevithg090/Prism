"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { StatusBadge } from "@/components/keystone";
import type { RoleSkillDemand, SkillId, SkillStatus } from "@/lib/types";

const COLLAPSED = 15;

export function SkillDemandList({ skills, names, statusBySkill, onPick }: {
  skills: RoleSkillDemand[];
  names: Record<SkillId, string>;
  statusBySkill: Record<SkillId, SkillStatus>;
  onPick: (id: SkillId) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const reduced = useReducedMotion();
  const visible = showAll ? skills : skills.slice(0, COLLAPSED);

  return (
    <>
      <ul className="flex flex-col gap-1">
        {visible.map((s, i) => {
          const name = names[s.skillId] ?? s.skillId;
          const pct = Math.round(s.share * 100);
          const status = statusBySkill[s.skillId];
          return (
            <li key={s.skillId}>
              <button
                type="button"
                onClick={() => onPick(s.skillId)}
                className="grid w-full grid-cols-[8.5rem_1fr_3rem] items-center gap-x-2 gap-y-1 rounded-xl px-2 py-1.5 text-left hover:bg-background sm:grid-cols-[8.5rem_1fr_3rem_13rem]"
              >
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="h-2 rounded-full bg-border">
                  <motion.span
                    className="block h-full origin-left rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.25, ease: "easeOut", delay: i * 0.04 }}
                  />
                </span>
                <span className="text-right font-mono text-sm tabular-nums">{pct}%<span className="sr-only"> of ads</span></span>
                <span className="col-span-3 flex flex-wrap justify-end gap-1 sm:col-span-1">
                  {s.trend && <StatusBadge status={s.trend} />}
                  {status && <><span className="sr-only">You:</span><StatusBadge status={status} /></>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {skills.length > COLLAPSED && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-medium text-primary">
          {showAll ? "Show fewer" : `Show all ${skills.length}`}
        </button>
      )}
    </>
  );
}
