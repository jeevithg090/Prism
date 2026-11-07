"use client";
// /roadmap: your plan, week by week, built on your degree. Optimistic ticks, Why? receipts, Re-plan via the agents.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Route } from "lucide-react";
import type { Programme, Roadmap } from "@/lib/types";
import demoRoadmapJson from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import { EmptyState, ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiPatch, apiPost } from "@/lib/fetcher";
import { roleName } from "@/lib/graph/roles";
import { skillName } from "@/lib/schemas/community";
import { cn } from "@/lib/utils";
import { apiGet, isNotFound, useEvidence, useGraph, useMapViewer, usePods, useProfileQuery, useRoadmapQuery, useToday } from "@/components/map/hooks";
import { RoadmapHeader } from "./RoadmapHeader";
import { currentWeekIndex, isThisWeek, isWeekDone, usualWeekHours, withTaskDone } from "./roadmapUtils";
import { SkippedPanel } from "./SkippedPanel";
import { WeekCard } from "./WeekCard";

const DEMO_ROADMAP = demoRoadmapJson as unknown as Roadmap;

export function RoadmapSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your roadmap">
      <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm md:flex-row md:items-center md:gap-10 md:p-8">
        <Skeleton className="size-[120px] shrink-0 rounded-full md:size-40" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-6 h-16 w-full max-w-sm" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-7 w-40" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="size-3 shrink-0 translate-y-2 rounded-full" />
              <Skeleton className="h-5 w-24 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-1/2" /></div>
            </div>
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
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
  // The programme names the modules a week or a skip points at, so the page can say "Machine Learning", not a code.
  const programmeId = profile.data?.programmeId;
  const programme = useQuery({
    queryKey: ["programme", programmeId],
    queryFn: () => apiGet<Programme>(`/api/programmes/${encodeURIComponent(programmeId ?? "")}`),
    enabled: !!programmeId,
    retry: 0,
    staleTime: Infinity,
  });
  const moduleTitles = React.useMemo(
    () => Object.fromEntries((programme.data?.modules ?? []).map((m) => [m.code, m.title])),
    [programme.data],
  );

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
        toast.success("One step closer", { description: week ? `Week ${week.week}: ${week.tasks.filter((t) => t.done).length} of ${week.tasks.length} tasks done.` : undefined });
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
          <button type="button" onClick={() => replan.mutate()} disabled={replan.isPending} aria-busy={replan.isPending || undefined} className={cn(buttonVariants({ size: "lg" }), "focus-visible:outline-solid")}>
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
  const nodeOf = (id: string) => graph.data?.nodes.find((n) => n.skillId === id);
  const usualHours = usualWeekHours(rm.weeks);

  return (
    <div className="space-y-6">
      <RoadmapHeader
        roadmap={rm} targetDate={profile.data?.dna?.targetDate} hoursPerWeek={hoursPerWeek} demo={isDemo}
        replanning={replan.isPending} onReplan={() => replan.mutate()}
        currentSkillName={current ? nodeOf(current.focusSkillId)?.name ?? skillName(current.focusSkillId) : undefined} roleLabel={role}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <section aria-labelledby="timeline-h" className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <h2 id="timeline-h" className="text-xl font-semibold text-balance">{rm.weeks.length} weeks, <span className="whitespace-nowrap">most-asked</span> gaps first</h2>
              <p className="mt-1 max-w-[52ch] text-sm text-pretty text-muted-foreground">
                Each % is the share of {role} ads asking for that week&apos;s skill. A week with no tag is a gap your modules don&apos;t teach.
              </p>
            </div>
            {current && firstOpen?.resourceUrl && (
              <a href={firstOpen.resourceUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg" }), "self-start focus-visible:outline-solid sm:self-auto")}>
                Start week {current.week}: {skillName(current.focusSkillId)} <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(opens {firstOpen.title} in a new tab)</span>
              </a>
            )}
          </div>
          <ol className="px-4 sm:px-6">
            {rm.weeks.map((w, i) => (
              <li key={`${rm.version}-${w.week}`} className="group/week">
                <WeekCard
                  week={w}
                  skillName={nodeOf(w.focusSkillId)?.name ?? skillName(w.focusSkillId)}
                  skillStatus={nodeOf(w.focusSkillId)?.status}
                  current={i === cur}
                  thisWeek={isThisWeek(w.startDate, today)}
                  defaultExpanded={i === cur}
                  roleLabel={role}
                  evidence={evidence.data}
                  podHref={podHref}
                  pulse={pulse === w.week}
                  usualHours={usualHours}
                  moduleTitles={moduleTitles}
                  onToggleTask={(taskId, done) => toggle.mutate({ taskId, done })}
                />
              </li>
            ))}
          </ol>
        </section>
        {/* Sticky, and stopped short of the viewport's bottom-right corner, where Ask Keystone floats. */}
        <aside
          className="space-y-4 xl:sticky xl:top-[calc(var(--topbar-height)+1.5rem)] xl:-m-1 xl:max-h-[calc(100dvh-var(--topbar-height)-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:p-1"
          aria-label="What your degree covers"
        >
          <SkippedPanel skipped={rm.skipped} nodes={graph.data?.nodes} hoursPerWeek={hoursPerWeek} moduleTitles={moduleTitles} />
          <a
            href="/map"
            className="inline-flex min-h-10 items-center rounded-md px-1 text-base font-medium text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            See every skill on your Bridge Map
          </a>
        </aside>
      </div>
    </div>
  );
}
