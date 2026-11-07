"use client";
// "This week": the answer to "what should I do next?". From the roadmap when there is one, else the top gap on the map.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, BookOpen, Dumbbell, GitPullRequest, Hammer, Lightbulb, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import type { BridgeMap, BridgeNode, Pod, Receipt, RoadmapTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { currentWeek, dayMonth, proofHint, roleName, topGaps, useRoadmap } from "./data";

const TASK_ICON: Record<RoadmapTask["type"], LucideIcon> = { learn: BookOpen, practice: Dumbbell, build: Hammer, primer: Lightbulb };
const card = "flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm md:p-8";
export const primaryLink = cn(buttonVariants(), "h-auto min-h-12 w-full rounded-xl px-6 py-2 text-base whitespace-normal sm:w-fit");
export const secondaryLink = cn(buttonVariants({ variant: "outline" }), "h-auto min-h-12 w-full rounded-xl px-5 py-2 text-base whitespace-normal sm:w-fit");

/** One plain sentence on why this skill, built from the receipt numbers. */
export function whySentence(name: string, role: string, r: Pick<Receipt, "demandPct" | "coveredByDegree" | "moduleCode">): string {
  const ask = `${r.demandPct}% of ${role} ads ask for ${name}`;
  if (r.coveredByDegree === "no") return `${ask}, and none of your modules teach it.`;
  if (r.coveredByDegree === "upcoming") return `${ask}. Your degree covers it later${r.moduleCode ? ` in ${r.moduleCode}` : ""}, so this week is a head start.`;
  return `${ask}. You've met it${r.moduleCode ? ` in ${r.moduleCode}` : " in your degree"}; this week turns it into proof.`;
}

function receiptFromNode(n: BridgeNode): Receipt {
  const coveredByDegree = n.status === "degree-done" ? "done" : n.status === "degree-upcoming" ? "upcoming" : "no";
  return { demandPct: Math.round(n.demand * 100), trend: n.trend, coveredByDegree, moduleCode: n.moduleCodes[0], reason: "" };
}

const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** The viewer's pod issue for this week's skill (same ["pods", userId] query as PodSummaryCard). */
function PodIssueLine({ userId, skillId }: { userId: string; skillId: string }) {
  const q = useQuery({
    queryKey: ["pods", userId],
    queryFn: () => apiGet<Pod[]>(`/api/pods?userId=${encodeURIComponent(userId)}`),
  });
  const pod = q.data?.find((p) => p.project?.issues.some((i) => i.assigneeUserId === userId && i.skillId === skillId));
  const issue = pod?.project?.issues.find((i) => i.assigneeUserId === userId && i.skillId === skillId);
  if (!pod || !issue) return null;
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
      <GitPullRequest className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="font-semibold">In {pod.name}:</span> {issue.title}. {cap(issue.reviewerUserId)} reviews your PR.{" "}
        <Link href={`/pods/${pod.id}`} className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          Open the project
        </Link>
      </span>
    </p>
  );
}

function WeekBody({
  userId, label, name, skillId, role, receipt, tasks, proof, isExamWeek, note,
}: {
  userId: string; label: string; name: string; skillId: string; role: string; receipt: Receipt; tasks: RoadmapTask[]; proof: string; isExamWeek?: boolean; note?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="this-week-title" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {isExamWeek && <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium">Lighter week: exams</span>}
      </div>
      <h2 id="this-week-title" className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
        This week: {name}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={receipt.coveredByDegree === "no" ? "gap" : receipt.coveredByDegree === "done" ? "degree-done" : "degree-upcoming"} />
        {receipt.trend === "rising" && <StatusBadge status="rising" />}
        <span className="text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-foreground tabular-nums">{receipt.demandPct}%</span> of {role} ads
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-base">{receipt.reason || whySentence(name, role, receipt)}</p>

      {tasks.length > 0 && (
        <ul className="mt-5 divide-y rounded-xl bg-muted/60" aria-label={`This week's tasks for ${name}`}>
          {tasks.slice(0, 3).map((t) => {
            const Icon = TASK_ICON[t.type] ?? BookOpen;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className={cn("min-w-0 flex-1 text-sm", t.done && "text-muted-foreground line-through")}>
                  {t.title}
                  {t.done && <span className="sr-only"> (done)</span>}
                </span>
                <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">{t.hours}h</span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-status-proven/25 bg-status-proven/10 px-4 py-3 text-sm text-foreground">
        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
        <span><span className="font-semibold">Proof:</span> {proof}</span>
      </p>
      <PodIssueLine userId={userId} skillId={skillId} />
      {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}

      <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
        <Link href={`/roadmap#skill-${skillId}`} className={primaryLink}>
          Start this week&apos;s task
          <ArrowRight aria-hidden />
        </Link>
        <Link href={`/map?skill=${encodeURIComponent(skillId)}`} className={secondaryLink}>
          Why {name}?
        </Link>
      </div>
    </section>
  );
}

export function ThisWeekSkeleton() {
  return (
    <div className={cn(card, "space-y-4")} aria-busy="true">
      <span className="sr-only">Loading this week</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-6 w-1/2 rounded-full" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-12 w-56 rounded-xl" />
    </div>
  );
}

export function ThisWeekCard({ userId, map }: { userId: string; map: BridgeMap }) {
  const q = useRoadmap(userId);
  const role = roleName(map.roleId);
  const name = (id: string) => map.nodes.find((n) => n.skillId === id)?.name ?? id;

  if (q.isPending) return <ThisWeekSkeleton />;

  const week = q.data ? currentWeek(q.data) : null;
  if (week) {
    const date = dayMonth(week.startDate);
    return (
      <WeekBody
        userId={userId}
        label={`Week ${week.week}${date ? ` · from ${date}` : ""}`}
        name={name(week.focusSkillId)}
        skillId={week.focusSkillId}
        role={role}
        receipt={week.receipt}
        tasks={week.tasks}
        proof={week.proof}
        isExamWeek={week.isExamWeek}
      />
    );
  }

  // No roadmap yet (or it failed): the biggest gap on the map is still the right next step.
  const gap = topGaps(map, 1)[0];
  if (!gap) {
    return (
      <section aria-labelledby="this-week-title" className={card}>
        <p className="text-sm font-medium text-muted-foreground">This week</p>
        <h2 id="this-week-title" className="mt-1 text-2xl font-semibold tracking-tight">No gaps left for {role} roles</h2>
        <p className="mt-2 text-muted-foreground">Everything this role asks for is proven or covered by your degree. Keep adding proof to your passport.</p>
        <div className="mt-auto pt-6">
          <Link href="/map" className={primaryLink}>Open your Bridge Map<ArrowRight aria-hidden /></Link>
        </div>
      </section>
    );
  }
  return (
    <WeekBody
      userId={userId}
      label="Week 1 · from your Bridge Map"
      name={gap.name}
      skillId={gap.skillId}
      role={role}
      receipt={receiptFromNode(gap)}
      tasks={[]}
      proof={proofHint(gap.skillId, gap.name)}
      note={
        q.isError ? (
          <>
            We couldn&apos;t load your roadmap, so this comes from your Bridge Map.{" "}
            <button type="button" onClick={() => void q.refetch()} className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              Try again
            </button>
          </>
        ) : (
          "Your week-by-week roadmap isn't built yet, so this comes straight from your Bridge Map: it's your biggest gap."
        )
      }
    />
  );
}
