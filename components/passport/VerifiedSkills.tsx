"use client";
// "Verified skills": skills × ladder × evidence links × date, grouped by the highest rung reached.
// Rungs with proof lead, highest first; rungs nobody has reached yet close the card as quiet wells saying how to get there.
import * as React from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { EmptyState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { EvidenceLink, formatProofDate, RUNG_ICON, RungStrip } from "@/components/ladder/LadderRungs";
import { RUNG_LABEL, RUNG_MEANING, SOURCE_LABEL, type LadderRung, type RungNumber, type SkillLadder } from "@/components/ladder/model";
import { readableModules } from "@/components/roadmap/roadmapUtils";
import { cn } from "@/lib/utils";

const NUDGE: Record<RungNumber, string> = {
  3: "Review a peer's pull request in a skill you know, or explain it in a mock interview, to reach this rung.",
  2: "Merge a pod pull request, approved by a peer who knows the skill, to reach this rung.",
  1: "Pass a 20-minute micro-challenge to reach this rung.",
};

/**
 * One rung's proof on two fixed lines: the quote at reading size, then the source tag, the date and the link.
 * Degree proof names the module by its title, not its code, when the programme is known.
 */
function ProofLine({ rung, skillName, moduleTitles }: { rung: LadderRung; skillName: string; moduleTitles?: Record<string, string> }) {
  const ev = rung.evidence;
  if (!ev) {
    return rung.impliedBy ? (
      <p className="text-base text-pretty text-muted-foreground">Counted because {RUNG_LABEL[rung.impliedBy]} is proven.</p>
    ) : null;
  }
  const date = formatProofDate(ev.createdAt);
  const quote = ev.source === "degree" ? readableModules(ev.quote, moduleTitles) : ev.quote;
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-base text-pretty break-words text-foreground">{quote}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex h-6 items-center rounded-md border bg-card px-1.5 text-xs font-medium text-foreground">{SOURCE_LABEL[ev.source]}</span>
        {date && <time dateTime={ev.createdAt} className="tabular-nums">{date}</time>}
        <EvidenceLink evidence={ev} skillName={skillName} />
      </div>
    </div>
  );
}

function SkillRow({ skill, showLabels, moduleTitles }: { skill: SkillLadder; showLabels: boolean; moduleTitles?: Record<string, string> }) {
  const done = skill.rungs.filter((r) => r.status === "done").reverse();
  return (
    <li className="grid gap-3 border-t py-5 last:pb-0 md:col-span-3 md:grid-cols-subgrid md:items-start md:gap-x-6">
      <p className="min-w-0 text-lg font-semibold break-words text-foreground">{skill.skillName}</p>
      <RungStrip ladder={skill} showLabels={showLabels} />
      <ul className="min-w-0 space-y-3" aria-label={`${skill.skillName} proof`}>
        {done.map((r) => (
          <li key={r.rung} className="min-w-0">
            <span className="sr-only">{r.label}: </span>
            <ProofLine rung={r} skillName={skill.skillName} moduleTitles={moduleTitles} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function RungCount({ n }: { n: number }) {
  return (
    <span className="font-sans text-base font-medium text-foreground tabular-nums">
      {n}
      <span className="sr-only"> {n === 1 ? "skill" : "skills"}</span>
    </span>
  );
}

export function VerifiedSkills({ skills, isOwner, moduleTitles }: { skills: SkillLadder[]; isOwner: boolean; moduleTitles?: Record<string, string> }) {
  const verified = skills.filter((s) => s.level > 0);
  const count = (l: number) => verified.filter((s) => s.level === l).length;
  const filled = ([3, 2, 1] as const).filter((l) => count(l) > 0);
  const open = ([1, 2, 3] as const).filter((l) => count(l) === 0);

  if (!verified.length) {
    return (
      <section aria-labelledby="verified-title" className="space-y-4">
        <h2 id="verified-title" className="text-xl font-semibold text-foreground">Verified skills</h2>
        <EmptyState
          icon={FlaskConical}
          title={isOwner ? "Your first proof is 20 minutes away" : "No verified skills yet"}
          body="Skills appear here once evidence proves them: a micro-challenge, a merged pod PR or a review of a peer's work."
          action={isOwner ? <Link href="/challenge" className={buttonVariants({ size: "lg" })}>Try a micro-challenge</Link> : undefined}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="verified-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-6 space-y-1">
        <h2 id="verified-title" className="text-xl font-semibold text-foreground">Verified skills</h2>
        <p className="max-w-[65ch] text-sm text-pretty text-muted-foreground">
          <span className="tabular-nums">{verified.length}</span> {verified.length === 1 ? "skill" : "skills"} verified:{" "}
          <span className="tabular-nums">{count(3)}</span> can teach it, <span className="tabular-nums">{count(2)}</span> built it,{" "}
          <span className="tabular-nums">{count(1)}</span> tried it. Every rung links to its proof.
        </p>
      </div>

      <div className="space-y-10">
        {filled.map((level) => {
          const group = verified.filter((s) => s.level === level);
          const Icon = RUNG_ICON[level];
          return (
            <section key={level} aria-labelledby={`level-${level}`}>
              <div className="mb-4 flex items-start gap-3">
                <Icon className="mt-1 size-5 shrink-0 text-status-proven" aria-hidden />
                <div className="min-w-0">
                  <h3 id={`level-${level}`} className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
                    {RUNG_LABEL[level]} <RungCount n={group.length} />
                  </h3>
                  <p className="text-sm text-pretty text-muted-foreground">{RUNG_MEANING[level]}</p>
                </div>
              </div>
              <ul className="md:grid md:grid-cols-[10rem_auto_minmax(0,1fr)] md:gap-x-6">
                {group.map((s, i) => <SkillRow key={s.skillId} skill={s} showLabels={i === 0} moduleTitles={moduleTitles} />)}
              </ul>
            </section>
          );
        })}

        {open.length > 0 && (
          <div className={cn("grid gap-4", open.length > 1 && "md:grid-cols-2")}>
            {open.map((level) => {
              const Icon = RUNG_ICON[level];
              return (
                <section key={level} aria-labelledby={`level-${level}`} className="rounded-xl bg-muted p-5">
                  <h3 id={`level-${level}`} className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {RUNG_LABEL[level]}
                  </h3>
                  <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
                    {isOwner ? NUDGE[level] : "Nothing at this rung yet."}
                  </p>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
