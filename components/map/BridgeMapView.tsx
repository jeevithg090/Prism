"use client";
// /map: your degree, the job market and your proof, in one graph. Four states; graph or accessible table.
// The readiness ring leads (coral for today, the ghost arc for the plan), then the map and the skill you picked.
import * as React from "react";
import Link from "next/link";
import { Map as MapIcon, Workflow } from "lucide-react";
import type { BridgeMap, Pod, Roadmap, SkillStatus } from "@/lib/types";
import demoMapJson from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import { DemoDataNote, EmptyState, ErrorState, ReadinessRing } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { monthYear, roleName, roleTitle } from "@/lib/graph/roles";
import { cn } from "@/lib/utils";
import { BridgeGraph } from "./BridgeGraph";
import { isNotFound, useEvidence, useGraph, useMapViewer, usePods, useProfileQuery, useRoadmapQuery } from "./hooks";
import { MapFilters, type MapView } from "./MapFilters";
import { MapLegend } from "./MapLegend";
import { MapListView } from "./MapListView";
import { byDemand, FOCUS, mapSummary, pctOf, statusCounts, STATUS_META, STATUS_ORDER, topGap } from "./mapUtils";
import { SkillDetailPanel, type PodIssueRef } from "./SkillDetailPanel";

const DEMO_MAP = demoMapJson as unknown as BridgeMap;

const TONE: Record<SkillStatus, string> = {
  proven: "text-status-proven", "degree-done": "text-status-degree", "degree-upcoming": "text-status-degree", gap: "text-status-gap",
};

export function MapSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your Bridge Map">
      <div className="flex items-center gap-8">
        <Skeleton className="size-[120px] shrink-0 rounded-full md:size-44" />
        <div className="w-full max-w-xl space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-12 w-80 max-w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-7 w-40" />
          <div className="mt-4 flex flex-wrap gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-28 rounded-lg" />)}</div>
          <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
            {[4, 4, 9, 11].map((rows, c) => (
              <div key={c} className="space-y-3">
                <Skeleton className="h-5 w-24" />
                {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 rounded-full" style={{ width: `${88 - ((i * 13 + c * 7) % 40)}%` }} />)}
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function issueFor(pods: Pod[] | undefined, uid: string, skillId: string): PodIssueRef | undefined {
  for (const pod of pods ?? []) {
    const issues = pod.project?.issues ?? [];
    const idx = issues.findIndex((i) => i.skillId === skillId && i.assigneeUserId === uid);
    if (idx >= 0) {
      const n = Number(issues[idx].githubIssueUrl?.match(/\/issues\/(\d+)/)?.[1] ?? idx + 1);
      return { podId: pod.id, title: issues[idx].title, n };
    }
  }
  return undefined;
}

/** The lead: the ring, the two figures it draws (today in coral, the plan as its ghost), the biggest gap, the counts. */
function Headline({ map, targetDate, demo }: { map: BridgeMap; targetDate?: string; demo: boolean }) {
  const role = map.nodes.filter((n) => n.demand > 0);
  const c = statusCounts(role);
  const gap = topGap(map.nodes);
  const when = monthYear(targetDate);
  const stats: { label: string; value: number; hint: string; status: SkillStatus }[] = [
    { label: "Proven", value: c.proven, hint: "skills with proof", status: "proven" },
    { label: "Degree covers", value: c["degree-done"] + c["degree-upcoming"], hint: `${c["degree-done"]} done, ${c["degree-upcoming"]} later`, status: "degree-done" },
    { label: "Gaps", value: c.gap, hint: gap ? "not in your degree" : "none left", status: "gap" },
  ];
  return (
    <section
      aria-labelledby="readiness-h"
      className="grid grid-cols-1 items-center gap-x-6 gap-y-6 sm:grid-cols-[auto_minmax(0,1fr)] md:gap-x-10 xl:grid-cols-[auto_minmax(0,1fr)_17rem]"
    >
      {/* From sm the 48px figures beside the ring state 38% and 84%, so its centre stays empty; on a phone the
          figures sit far below it, so the ring is centred and shows today's number itself. */}
      <ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label="today" className="max-sm:justify-self-center md:size-44 sm:[&>div]:hidden" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="readiness-h" className="text-xl font-semibold text-foreground">{roleTitle(map.roleId)} readiness</h2>
          {demo && <DemoDataNote />}
        </div>
        <p className="mt-2 flex items-baseline gap-x-3 text-lg text-muted-foreground">
          <span className="inline-flex shrink-0 flex-col">
            <span className="font-mono text-4xl leading-none font-semibold text-foreground tabular-nums md:text-5xl">{pctOf(map.readinessNow)}%</span>
            <span className="mt-2 inline-flex items-baseline gap-2">
              <span className="h-1.5 w-6 shrink-0 -translate-y-1 rounded-full bg-primary" aria-hidden />today
            </span>
          </span>
          <span className="self-start font-mono text-4xl leading-none text-muted-foreground md:pt-1" aria-hidden>→</span>
          <span className="sr-only">, rising to</span>
          <span className="inline-flex min-w-0 max-w-[16rem] flex-col min-[1400px]:max-w-none">
            <span className="font-mono text-4xl leading-none font-semibold text-foreground tabular-nums md:text-5xl">{pctOf(map.readinessProjected)}%</span>
            <span className="mt-2 inline-flex items-baseline gap-2">
              <span className="h-1.5 w-6 shrink-0 -translate-y-1 rounded-full bg-primary/30" aria-hidden />
              {when ? `by ${when}` : "by your target date"} if you follow your roadmap
            </span>
          </span>
        </p>
        {gap && (
          <p className="mt-5 max-w-[60ch] text-base text-pretty text-foreground md:text-lg">
            Your biggest gap is <span className="font-semibold">{gap.name}</span>: {pctOf(gap.demand)}% of {roleName(map.roleId)} ads ask for it
            {gap.moduleCodes.length ? "." : ", and no module covers it."}
          </p>
        )}
      </div>
      {/* A phone gets three full-width rows (label left, figure right), a tablet three columns, a desktop a column again. */}
      <dl className="grid grid-cols-1 divide-y border-t sm:col-span-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:pt-5 xl:col-span-1 xl:grid-cols-1 xl:divide-x-0 xl:divide-y xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
        {stats.map((s) => {
          const Icon = STATUS_META[s.status].icon;
          return (
            <div key={s.label} className="grid min-w-0 content-start gap-x-4 gap-y-1 px-4 first:pl-0 last:pr-0 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:px-0 max-sm:py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:px-0 xl:py-3 xl:first:pt-0 xl:last:pb-0">
              <dt className="flex items-center gap-1.5 text-sm font-medium text-foreground max-sm:col-start-1 max-sm:row-start-1 xl:col-start-1 xl:row-start-1">
                <Icon className={cn("size-4 shrink-0", TONE[s.status])} aria-hidden />{s.label}
              </dt>
              <dd className="order-first font-mono text-3xl leading-none font-semibold text-foreground tabular-nums max-sm:order-none max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 xl:order-none xl:col-start-2 xl:row-span-2 xl:row-start-1">{s.value}</dd>
              <dd className="text-sm text-muted-foreground max-sm:col-start-1 max-sm:row-start-2 xl:col-start-1 xl:row-start-2">{s.hint}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function SkillList({ nodes, selectedId, onPick }: { nodes: BridgeMap["nodes"]; selectedId?: string | null; onPick: (id: string) => void }) {
  return (
    <section aria-labelledby="skill-list-h" className="rounded-2xl border bg-card shadow-sm">
      <div className="px-6 pt-5 pb-3">
        <h2 id="skill-list-h" className="text-base font-semibold text-foreground">Skills in view</h2>
        <p className="text-sm text-muted-foreground">Pick one to open it and find it on the graph.</p>
      </div>
      <ul className="relative max-h-80 divide-y overflow-y-auto border-t px-3 py-1">
        {[...nodes].sort(byDemand).map((n) => {
          const m = STATUS_META[n.status];
          const Icon = m.icon;
          const on = n.skillId === selectedId;
          return (
            <li key={n.skillId}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => onPick(n.skillId)}
                className={cn(
                  "my-0.5 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-[background-color] duration-(--dur-short) disabled:cursor-not-allowed disabled:opacity-55",
                  FOCUS, "focus-visible:-outline-offset-2",
                  on ? "bg-signal-soft font-semibold" : "hover:bg-muted",
                )}
              >
                <Icon className={cn("size-4 shrink-0", TONE[n.status])} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                <span className="sr-only">{m.label},</span>
                <span className="font-mono text-muted-foreground tabular-nums">{n.demand > 0 ? `${pctOf(n.demand)}%` : "–"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BridgeMapView({ demo = false, skill }: { demo?: boolean; skill?: string }) {
  const uid = useMapViewer(demo);
  const [useDemoData, setUseDemoData] = React.useState(false);
  const graph = useGraph(uid);
  const profile = useProfileQuery(uid);
  const evidence = useEvidence(uid);
  const roadmap = useRoadmapQuery(uid);
  const pods = usePods(uid);
  const activity = useActivity();

  const map: BridgeMap | undefined = useDemoData ? DEMO_MAP : graph.data;
  const [active, setActive] = React.useState<Set<SkillStatus>>(() => new Set(STATUS_ORDER));
  const [view, setView] = React.useState<MapView>("graph");
  const [picked, setPicked] = React.useState<string | null>(skill ?? null);
  const [focusId, setFocusId] = React.useState<string | null>(null);

  if (!map && graph.isPending) {
    return (
      <div className="space-y-4">
        {activity.runId && (
          <button type="button" onClick={() => activity.setOpen(true)} className={cn(buttonVariants({ variant: "link" }), "h-10 gap-2 px-0 text-base whitespace-nowrap")}>
            <Workflow className="size-4" aria-hidden /><span className="whitespace-nowrap">Watch the agents build it</span>
          </button>
        )}
        <MapSkeleton />
      </div>
    );
  }
  if (!map && isNotFound(graph.error)) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Your map is empty"
        body="Finish onboarding to build it: we read your syllabus, real job ads and your GitHub."
        action={<Link href="/onboard" className={cn(buttonVariants({ size: "lg" }))}>Finish onboarding</Link>}
      />
    );
  }
  if (!map) {
    return (
      <ErrorState
        title="We couldn't load your Bridge Map"
        body="That's on us, not you. Try again, or look at the demo student's map."
        onRetry={() => void graph.refetch()}
        onUseDemo={() => setUseDemoData(true)}
      />
    );
  }

  const nodes = map.nodes;
  const visible = nodes.filter((n) => active.has(n.status));
  const selected = nodes.find((n) => n.skillId === picked) ?? topGap(nodes) ?? [...nodes].sort(byDemand)[0];
  const rm: Roadmap | undefined = useDemoData ? undefined : roadmap.data;
  const week = rm?.weeks.find((w) => w.focusSkillId === selected?.skillId);
  const skipped = rm?.skipped.find((s) => s.skillId === selected?.skillId);
  const summary = mapSummary(map, visible);
  const isDemo = useDemoData || demo || !!profile.data?.isDemo;
  const pick = (id: string) => { setPicked(id); setFocusId(id); };
  const toggle = (s: SkillStatus) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  return (
    <div className="space-y-10">
      <Headline map={map} targetDate={profile.data?.dna?.targetDate} demo={isDemo} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="graph-h" className="min-w-0 self-start rounded-2xl border bg-card shadow-sm">
          <div className="p-4 pb-4 md:p-6 md:pb-5">
            <MapFilters counts={statusCounts(nodes)} active={active} onToggle={toggle} view={view} onView={setView} />
          </div>
          {view === "graph" ? (
            <div className="border-t px-1 pt-1 md:px-2">
              <BridgeGraph nodes={visible} allNodes={nodes} edges={map.edges} selectedId={selected?.skillId} focusId={focusId} onSelect={pick} summary={summary} />
            </div>
          ) : (
            <>
              <MapListView nodes={visible} roleLabel={roleName(map.roleId)} selectedId={selected?.skillId} onSelect={(id) => setPicked(id)} />
              <p className="sr-only" aria-live="polite">{summary}</p>
            </>
          )}
          <MapLegend className="mt-5 border-t px-4 py-4 md:px-6" />
        </section>
        <aside className="grid gap-6 self-start md:grid-cols-2 xl:sticky xl:top-[calc(var(--topbar-height)+var(--space-lg))] xl:grid-cols-1" aria-label="Skill details">
          {selected && (
            <SkillDetailPanel
              node={selected} roleId={map.roleId} uid={uid} evidence={evidence.data ?? []}
              week={week} skipped={skipped} issue={issueFor(pods.data, uid, selected.skillId)}
            />
          )}
          <SkillList nodes={visible} selectedId={selected?.skillId} onPick={pick} />
        </aside>
      </div>
    </div>
  );
}
