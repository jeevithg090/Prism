"use client";
// "This week": the answer to "what should I do next?". From the roadmap when there is one, else the top gap on the map.
// The screen's signature: the week's skill and why, its tasks in order, and the proof that closes it.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, BookOpen, CheckCircle2, Dumbbell, GitPullRequest, Hammer, Lightbulb, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import type { BridgeMap, BridgeNode, Pod, Receipt, Roadmap, RoadmapTask, RoadmapWeek } from "@/lib/types";
import { cn } from "@/lib/utils";
import { currentWeek, dayMonth, proofHint, roleName, topGaps, useRoadmap } from "./data";

const TASK_ICON: Record<RoadmapTask["type"], LucideIcon> = { learn: BookOpen, practice: Dumbbell, build: Hammer, primer: Lightbulb };
const card = "rounded-2xl border bg-card p-6 shadow-sm";
/** The page's one filled action (ink board, size lg) and its quiet partner (cotton card). */
export const primaryLink = cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto");
export const secondaryLink = cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto");
const textLink = "font-medium text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
    <p className="mt-4 flex items-start gap-3 text-sm text-pretty text-foreground">
      <GitPullRequest className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <span className="font-semibold">In {pod.name}:</span> {cap(issue.reviewerUserId)} reviews your PR.{" "}
        <Link href={`/pods/${pod.id}`} className={textLink}>
          Open the project
        </Link>
      </span>
    </p>
  );
}

/**
 * The week to show: the roadmap's current week, moved on past any week whose skill the map already shows proven
 * (a merged pod PR flips the node before the roadmap catches up). `proven` names the skill that was just closed.
 */
export function weekToShow(roadmap: Roadmap, map: BridgeMap): { week: RoadmapWeek | null; proven?: string } {
  const statusOf = (id: string) => map.nodes.find((n) => n.skillId === id)?.status;
  const nameOf = (id: string) => map.nodes.find((n) => n.skillId === id)?.name ?? id;
  const start = currentWeek(roadmap);
  if (!start) return { week: null };
  const weeks = [...roadmap.weeks].sort((a, b) => a.week - b.week);
  const next = weeks.find((w) => w.week >= start.week && statusOf(w.focusSkillId) !== "proven") ?? null;
  if (!next) return { week: start };
  const before = weeks.filter((w) => w.week < next.week && statusOf(w.focusSkillId) === "proven").pop();
  return { week: next, ...(before ? { proven: nameOf(before.focusSkillId) } : {}) };
}

function WeekBody({
  userId, label, name, skillId, role, receipt, tasks, proof, isExamWeek, note, proven,
}: {
  userId: string; label: string; name: string; skillId: string; role: string; receipt: Receipt; tasks: RoadmapTask[]; proof: string; isExamWeek?: boolean; note?: React.ReactNode;
  /** The skill a merged PR just proved, so last week's focus reads as done. */
  proven?: string;
}) {
  return (
    <section aria-labelledby="this-week-title" className={card}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h2 id="this-week-title" className="text-2xl font-semibold text-balance text-foreground md:text-3xl">
            This week: {name}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isExamWeek && <span className="inline-flex h-6 items-center rounded-md border bg-muted px-2 text-xs font-medium text-foreground">Lighter week: exams</span>}
          </div>
          {proven && (
            <p className="mt-3 flex items-center gap-2 text-base font-medium text-foreground" data-testid="this-week-proven">
              <CheckCircle2 className="size-5 shrink-0 text-status-proven" aria-hidden />
              {proven} proven
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={receipt.coveredByDegree === "no" ? "gap" : receipt.coveredByDegree === "done" ? "degree-done" : "degree-upcoming"} />
            {receipt.trend === "rising" && <StatusBadge status="rising" />}
          </div>
          <p className="mt-4 max-w-[52ch] text-lg text-pretty text-foreground">{receipt.reason || whySentence(name, role, receipt)}</p>
          {note && <p className="mt-3 max-w-[52ch] text-sm text-pretty text-muted-foreground">{note}</p>}
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="rounded-xl bg-muted px-5 py-2">
            {tasks.length > 0 && (
              <ul className="divide-y" aria-label={`This week's tasks for ${name}`}>
                {tasks.slice(0, 3).map((t) => {
                  const Icon = TASK_ICON[t.type] ?? BookOpen;
                  return (
                    <li key={t.id} className="flex items-start gap-3 py-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className={cn("min-w-0 flex-1 text-base text-pretty text-foreground", t.done && "text-muted-foreground line-through")}>
                        {t.title}
                        {t.done && <span className="sr-only"> (done)</span>}
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{t.hours}h</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className={cn("flex items-start gap-3 py-3 text-base text-pretty text-foreground", tasks.length > 0 && "border-t")}>
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
              <span><span className="font-semibold">Proof:</span> {proof}</span>
            </p>
          </div>
          <PodIssueLine userId={userId} skillId={skillId} />
        </div>

        {/* One ink action; "Why" is a plain link beside it, so the pair stays on one line in the narrow column at 1280. */}
        <div className="flex flex-col items-start gap-x-4 gap-y-3 sm:flex-row sm:flex-wrap sm:items-center lg:col-start-1 lg:row-start-2 lg:self-start">
          <Link href={`/roadmap#skill-${skillId}`} className={primaryLink}>
            Start this week&apos;s task
          </Link>
          <Link href={`/map?skill=${encodeURIComponent(skillId)}`} className={cn(textLink, "text-base")}>
            Why {name}?
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ThisWeekSkeleton() {
  return (
    <div className={card} aria-busy="true">
      <span className="sr-only">Loading this week</span>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-x-10">
        <div className="space-y-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-11 w-56 rounded-xl" />
        </div>
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ThisWeekCard({ userId, map }: { userId: string; map: BridgeMap }) {
  const q = useRoadmap(userId);
  const role = roleName(map.roleId);
  const name = (id: string) => map.nodes.find((n) => n.skillId === id)?.name ?? id;

  if (q.isPending) return <ThisWeekSkeleton />;

  const { week, proven } = q.data ? weekToShow(q.data, map) : { week: null, proven: undefined };
  if (week) {
    const date = dayMonth(week.startDate);
    return (
      <WeekBody
        userId={userId}
        label={`Week ${week.week}${date ? `, from ${date}` : ""}`}
        name={name(week.focusSkillId)}
        skillId={week.focusSkillId}
        role={role}
        receipt={week.receipt}
        tasks={week.tasks}
        proof={week.proof}
        isExamWeek={week.isExamWeek}
        proven={proven}
      />
    );
  }

  // No roadmap yet (or it failed): the biggest gap on the map is still the right next step.
  const gap = topGaps(map, 1)[0];
  if (!gap) {
    return (
      <section aria-labelledby="this-week-title" className={card}>
        <h2 id="this-week-title" className="text-2xl font-semibold text-balance text-foreground md:text-3xl">This week: no gaps left for {role} roles</h2>
        <p className="mt-3 max-w-[52ch] text-lg text-pretty text-muted-foreground">Everything this role asks for is proven or covered by your degree. Keep adding proof to your passport.</p>
        <div className="mt-6">
          <Link href="/map" className={primaryLink}>Open your Bridge Map</Link>
        </div>
      </section>
    );
  }
  return (
    <WeekBody
      userId={userId}
      label="Week 1, from your Bridge Map"
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
            <button type="button" onClick={() => void q.refetch()} className={cn(textLink, "cursor-pointer")}>
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
