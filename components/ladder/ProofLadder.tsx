"use client";
// P5, <ProofLadder userId skillId? compact? />: the Try, Build, Teach ladder, from evidence.
//   compact + skillId  → one inline ●○○ strip (drop it next to a skill anywhere)
//   compact            → one row per skill: name + strip + level
//   full + skillId     → the vertical ladder with each rung's proof
//   full               → every skill as a row with labelled rungs and its newest proof
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/fetcher";
import { DemoDataNote, EmptyState, ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EvidenceLine, RungLadder, RungStrip } from "./LadderRungs";
import { DEMO_LADDER, demoSkill } from "./demo";
import { RUNG_LABEL, type ProofLadder as ProofLadderData, type RungNumber, type SkillLadder } from "./model";

export const VERIFIED_LINE = "Verified by evidence, not self-reported";

export function levelLabel(level: number): string {
  return level ? `${RUNG_LABEL[level as RungNumber]}` : "Not started";
}

export function useProofLadder(userId: string, skillId?: string) {
  const url = `/api/proof-ladder/${encodeURIComponent(userId)}${skillId ? `?skillId=${encodeURIComponent(skillId)}` : ""}`;
  return useQuery({ queryKey: ["proof-ladder", userId, skillId ?? null], queryFn: () => apiGet<ProofLadderData>(url), retry: false });
}

/** The trust line. The green check only shows once something on the ladder is proven; until then it is plain subtitle text. */
export function VerifiedStamp({ className, proven = true }: { className?: string; proven?: boolean }) {
  if (!proven) return <p className={cn("text-sm text-muted-foreground", className)}>{VERIFIED_LINE}</p>;
  return (
    <p className={cn("inline-flex items-center gap-2 text-sm font-medium text-foreground", className)}>
      <BadgeCheck className="size-5 shrink-0 text-status-proven" aria-hidden />
      {VERIFIED_LINE}
    </p>
  );
}

function LadderSkeleton({ compact, single }: { compact?: boolean; single?: boolean }) {
  if (compact && single) return <Skeleton aria-hidden className="h-7 w-28 rounded-md" />;
  if (single) {
    // The shape of the ladder that is coming: the trust line, then three rungs, standing up in a narrow box and one row in a wide one.
    return (
      <div aria-hidden className="@container space-y-4">
        <Skeleton className="h-4 w-64 max-w-full" />
        <div className="flex flex-col gap-6 @2xl:grid @2xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 @2xl:items-center @2xl:gap-3">
              <Skeleton className="size-12 shrink-0 rounded-full @2xl:size-9" />
              <div className="flex-1 space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-full @2xl:hidden" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="space-y-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className={cn("w-full rounded-xl", compact ? "h-10" : "h-16")} />)}
    </div>
  );
}

function SkillRow({ skill, compact }: { skill: SkillLadder; compact?: boolean }) {
  const newest = [...skill.rungs].reverse().find((r) => r.status === "done" && r.evidence);
  return (
    <li className={cn("flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4", !compact && "sm:items-start")}>
      <div className="min-w-0 sm:w-40 sm:shrink-0">
        <p className="font-medium">{skill.skillName}</p>
        <p className="text-sm text-muted-foreground">{levelLabel(skill.level)}{skill.level ? <>, rung <span className="tabular-nums">{skill.level}</span> of 3</> : null}</p>
      </div>
      <RungStrip ladder={skill} showLabels={!compact} />
      {!compact && newest && (
        <div className="min-w-0 flex-1 sm:pt-1">
          <EvidenceLine rung={newest} skillName={skill.skillName} />
        </div>
      )}
    </li>
  );
}

export function ProofLadderView({ data, skillId, compact, isDemo }: { data: ProofLadderData; skillId?: string; compact?: boolean; isDemo?: boolean }) {
  const skills = skillId ? data.skills.filter((s) => s.skillId === skillId) : data.skills;
  if (skillId && compact) {
    const s = skills[0];
    return s ? <RungStrip ladder={s} /> : null;
  }
  if (!skills.length) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Your ladder starts with a 20-minute challenge"
        body="Every skill climbs three rungs: Tried it, Built it, Can teach it. Each one is proven by evidence."
        action={<Link href="/challenge" className={cn("active:translate-y-px", buttonVariants())}>Try a micro-challenge</Link>}
      />
    );
  }
  const single = skillId ? skills[0] : undefined;
  if (single) {
    // One skill: the trust line sits up top with the band's subtitle, so the ladder stays one compact row.
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <VerifiedStamp proven={single.rungs.some((r) => r.status === "done")} />
          {isDemo && <DemoDataNote />}
        </div>
        <RungLadder ladder={single} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ul aria-label="Skills on your proof ladder" className="divide-y">
        {skills.map((s) => <SkillRow key={s.skillId} skill={s} compact={compact} />)}
      </ul>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4">
          <VerifiedStamp />
          {isDemo && <DemoDataNote />}
        </div>
      )}
    </div>
  );
}

export function ProofLadder({ userId, skillId, compact = false }: { userId: string; skillId?: string; compact?: boolean }) {
  const q = useProofLadder(userId, skillId);
  const [demo, setDemo] = React.useState<ProofLadderData | null>(null);
  const data = demo ?? q.data;

  if (!demo && q.isPending) {
    return <div role="status" aria-label="Loading the proof ladder"><LadderSkeleton compact={compact} single={!!skillId} /></div>;
  }
  if (!demo && (q.isError || !data)) {
    if (compact && skillId) return <span className="text-sm text-muted-foreground">Ladder unavailable</span>;
    return (
      <ErrorState
        title="We couldn't load your proof ladder"
        body="That's on us, not you. Your evidence is safe."
        onRetry={() => void q.refetch()}
        onUseDemo={() => { setDemo(skillId ? demoSkill(skillId) : DEMO_LADDER); toast("Showing demo proof ladder"); }}
      />
    );
  }
  return <ProofLadderView data={data!} skillId={skillId} compact={compact} isDemo={!!demo} />;
}

export default ProofLadder;
