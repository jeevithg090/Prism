"use client";
// "Verified skills": skills × ladder × evidence links × date, grouped by the highest rung reached.
import * as React from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { EmptyState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { EvidenceLine, RUNG_ICON, RungStrip } from "@/components/ladder/LadderRungs";
import { RUNG_LABEL, RUNG_MEANING, type RungNumber, type SkillLadder } from "@/components/ladder/model";
import { cn } from "@/lib/utils";

const NUDGE: Record<RungNumber, string> = {
  3: "Review a peer's pull request in a skill you know, or explain it in a mock interview, to reach this rung.",
  2: "Merge a pod pull request, approved by a peer who knows the skill, to reach this rung.",
  1: "Pass a 20-minute micro-challenge to reach this rung.",
};

function SkillRow({ skill }: { skill: SkillLadder }) {
  const done = skill.rungs.filter((r) => r.status === "done").reverse();
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[11rem_auto_minmax(0,1fr)] md:items-start md:gap-6">
      <div className="min-w-0">
        <p className="font-semibold">{skill.skillName}</p>
      </div>
      <RungStrip ladder={skill} showLabels />
      <ul className="min-w-0 space-y-2" aria-label={`${skill.skillName} proof`}>
        {done.map((r) => (
          <li key={r.rung} className="min-w-0">
            <span className="sr-only">{r.label}: </span>
            <EvidenceLine rung={r} skillName={skill.skillName} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export function VerifiedSkills({ skills, isOwner }: { skills: SkillLadder[]; isOwner: boolean }) {
  const verified = skills.filter((s) => s.level > 0);
  const count = (l: number) => verified.filter((s) => s.level === l).length;
  return (
    <section aria-labelledby="verified-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-5 space-y-1">
        <h2 id="verified-title" className="text-xl font-semibold">Verified skills</h2>
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">{verified.length}</span> {verified.length === 1 ? "skill" : "skills"} verified:{" "}
          <span className="tabular-nums">{count(3)}</span> can teach it, <span className="tabular-nums">{count(2)}</span> built it,{" "}
          <span className="tabular-nums">{count(1)}</span> tried it. Every rung links to its proof.
        </p>
      </div>

      {!verified.length ? (
        <EmptyState
          icon={FlaskConical}
          title={isOwner ? "Your first proof is 20 minutes away" : "No verified skills yet"}
          body="Skills appear here once evidence proves them: a micro-challenge, a merged pod PR or a review of a peer's work."
          action={isOwner ? <Link href="/challenge" className={buttonVariants()}>Try a micro-challenge</Link> : undefined}
        />
      ) : (
        <div className="space-y-8">
          {([3, 2, 1] as const).map((level) => {
            const group = verified.filter((s) => s.level === level);
            const Icon = RUNG_ICON[level];
            const empty = group.length === 0;
            return (
              <section key={level} aria-labelledby={`level-${level}`} className="space-y-3">
                <div className={cn("flex items-start gap-3", !empty && "border-b pb-3")}>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                      empty ? "border border-dashed text-muted-foreground" : "bg-status-proven/10 text-status-proven",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <h3 id={`level-${level}`} className="text-base font-semibold">
                      {RUNG_LABEL[level]} <span className="font-normal text-muted-foreground tabular-nums">· {group.length}</span>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {empty ? (isOwner ? NUDGE[level] : "Nothing at this rung yet.") : RUNG_MEANING[level]}
                    </p>
                  </div>
                </div>
                {!empty && <ul className="divide-y">{group.map((s) => <SkillRow key={s.skillId} skill={s} />)}</ul>}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
