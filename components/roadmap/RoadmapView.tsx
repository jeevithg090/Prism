"use client";
// /roadmap: your plan, week by week, built on your degree. Optimistic ticks, Why? receipts, Re-plan via the agents.
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ExternalLink, Route } from "lucide-react";
import type { Roadmap } from "@/lib/types";
import demoRoadmapJson from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import { EmptyState, ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiPatch, apiPost } from "@/lib/fetcher";
import { roleName } from "@/lib/graph/roles";
import { skillName } from "@/lib/schemas/community";
import { cn } from "@/lib/utils";
import { isNotFound, useEvidence, useGraph, useMapViewer, usePods, useProfileQuery, useRoadmapQuery, useToday } from "@/components/map/hooks";
import { RoadmapHeader } from "./RoadmapHeader";
import { currentWeekIndex, isThisWeek, isWeekDone, withTaskDone } from "./roadmapUtils";
import { SkippedPanel } from "./SkippedPanel";
import { WeekCard } from "./WeekCard";

const DEMO_ROADMAP = demoRoadmapJson as unknown as Roadmap;

export function RoadmapSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your roadmap">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}

const newRunId = () => `run_${Math.random().toString(36).slice(2, 10)}`;

export function RoadmapView({ demo = false }: { demo?: boolean }) {
  const uid = useMapViewer(demo);
  const qc = useQueryClient();
  const key = React.useMemo(() => ["roadmap", uid] as const, [uid]);
  const roadmap = useRoadmapQuery(uid);
  const profile = useProfileQuery(uid);
  const graph = useGraph(uid);
  const evidence = useEvidence(uid);
  const pods = usePods(uid);
  const activity = useActivity();
  const today = useToday();
  const [pulse, setPulse] = React.useState<number | null>(null);
  const [usingDemo, setUsingDemo] = React.useState(false);

  const toggle = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      apiPatch(`/api/roadmap/${encodeURIComponent(uid)}/tasks/${encodeURIComponent(taskId)}`, { done }),
    onMutate: async ({ taskId, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Roadmap>(key);
      qc.setQueryData(key, withTaskDone(prev, taskId, done));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("We couldn't save that tick", { description: "That's on us, not you. Try again in a moment." });
    },
    onSuccess: (_task, { taskId, done }) => {
      const rm = qc.getQueryData<Roadmap>(key);
      const week = rm?.weeks.find((w) => w.tasks.some((t) => t.id === taskId));
      if (done && week && isWeekDone(week)) {
        setPulse(week.week);
        toast.success(`Week ${week.week} complete: momentum +4`, { description: `${skillName(week.focusSkillId)} is done. Your next week is ready.` });
      } else if (done) {
        toast.success("Nice! One step closer", { description: week ? `Week ${week.week}: ${week.tasks.filter((t) => t.done).length} of ${week.tasks.length} tasks done.` : undefined });
      } else {
        toast("Task unticked", { description: "It's back on your list." });
      }
      void qc.invalidateQueries({ queryKey: ["momentum", uid] });
    },
  });

  const replan = useMutation({
    mutationFn: async () => {
      const runId = newRunId();
      activity.start(runId);
      return apiPost<Roadmap & { runId?: string }>("/api/roadmap/generate", { userId: uid, runId });
    },
    onSuccess: (data) => {
      const { runId: _r, ...rm } = data;
      void _r;
      qc.setQueryData(key, rm as Roadmap);
      setUsingDemo(false);
      void qc.invalidateQueries({ queryKey: ["graph", uid] });
      toast.success(`Roadmap updated (v${rm.version})`, { description: "The Roadmap Agent's steps are in the Activity panel." });
    },
    onError: (e) => toast.error("We couldn't re-plan right now", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  const rm = roadmap.data;
  if (!rm && roadmap.isPending) return <RoadmapSkeleton />;
  if (!rm && isNotFound(roadmap.error)) {
    return (
      <EmptyState
        icon={Route}
        title="No roadmap yet"
        body="The Roadmap Agent turns your Bridge Map into 12 weeks of tasks, skipping what your degree already teaches."
        action={
          <button type="button" onClick={() => replan.mutate()} disabled={replan.isPending} className={cn(buttonVariants(), "h-10 rounded-xl px-5")}>
            {replan.isPending ? "Building your roadmap…" : "Build my roadmap"}
          </button>
        }
      />
    );
  }
  if (!rm) {
    return (
      <ErrorState
        title="We couldn't load your roadmap"
        body="That's on us, not you. Try again, or look at the demo student's plan."
        onRetry={() => void roadmap.refetch()}
        onUseDemo={() => { setUsingDemo(true); qc.setQueryData(key, DEMO_ROADMAP); }}
      />
    );
  }

  const cur = currentWeekIndex(rm);
  const current = rm.weeks[cur];
  const role = roleName(rm.roleId);
  const pod = pods.data?.find((p) => p.project) ?? pods.data?.[0];
  const podHref = pod ? `/pods/${pod.id}` : undefined;
  const hoursPerWeek = profile.data?.dna?.hoursPerWeek;
  const firstOpen = current?.tasks.find((t) => !t.done && t.resourceUrl);
  const isDemo = usingDemo || demo || !!profile.data?.isDemo;

  return (
    <div className="space-y-6">
      <RoadmapHeader
        roadmap={rm} targetDate={profile.data?.dna?.targetDate} hoursPerWeek={hoursPerWeek} demo={isDemo}
        replanning={replan.isPending} onReplan={() => replan.mutate()}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="timeline-h" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="timeline-h" className="text-xl font-semibold">Week by week</h2>
            {current && firstOpen?.resourceUrl && (
              <a href={firstOpen.resourceUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants(), "h-11 rounded-xl px-5 text-base")}>
                Start week {current.week}: {skillName(current.focusSkillId)} <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(opens {firstOpen.title} in a new tab)</span>
              </a>
            )}
          </div>
          <ol className="space-y-4">
            {rm.weeks.map((w, i) => (
              <li key={`${rm.version}-${w.week}`}>
                <WeekCard
                  week={w}
                  skillName={graph.data?.nodes.find((n) => n.skillId === w.focusSkillId)?.name ?? skillName(w.focusSkillId)}
                  skillStatus={graph.data?.nodes.find((n) => n.skillId === w.focusSkillId)?.status}
                  current={i === cur}
                  thisWeek={isThisWeek(w.startDate, today)}
                  defaultExpanded={i === cur}
                  roleLabel={role}
                  evidence={evidence.data}
                  podHref={podHref}
                  pulse={pulse === w.week}
                  onToggleTask={(taskId, done) => toggle.mutate({ taskId, done })}
                />
              </li>
            ))}
          </ol>
        </section>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start" aria-label="What your degree covers">
          <SkippedPanel skipped={rm.skipped} nodes={graph.data?.nodes} hoursPerWeek={hoursPerWeek} />
          <a href="/map" className="flex items-center justify-between rounded-2xl border bg-card p-5 text-sm font-medium shadow-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            See every skill on your Bridge Map <ArrowRight className="size-4" aria-hidden />
          </a>
        </aside>
      </div>
    </div>
  );
}
