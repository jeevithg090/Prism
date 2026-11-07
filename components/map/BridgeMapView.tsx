"use client";
// /map: your degree, the job market and your proof, in one graph. Four states; graph or accessible table.
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Map as MapIcon } from "lucide-react";
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
import { byDemand, mapSummary, pctOf, statusCounts, STATUS_META, STATUS_ORDER, topGap } from "./mapUtils";
import { SkillDetailPanel, type PodIssueRef } from "./SkillDetailPanel";

const DEMO_MAP = demoMapJson as unknown as BridgeMap;

export function MapSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your Bridge Map">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[600px] w-full rounded-2xl" />
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

function Headline({ map, targetDate, demo }: { map: BridgeMap; targetDate?: string; demo: boolean }) {
  const role = map.nodes.filter((n) => n.demand > 0);
  const c = statusCounts(role);
  const gap = topGap(map.nodes);
  const when = monthYear(targetDate);
  const stats: { label: string; value: number; hint: string; status: SkillStatus }[] = [
    { label: "Proven", value: c.proven, hint: "skills with proof", status: "proven" },
    { label: "Degree covers", value: c["degree-done"] + c["degree-upcoming"], hint: `${c["degree-done"]} done · ${c["degree-upcoming"]} later`, status: "degree-done" },
    { label: "Gaps", value: c.gap, hint: gap ? `top: ${gap.name}, ${pctOf(gap.demand)}%` : "none left", status: "gap" },
  ];
  return (
    <section aria-labelledby="readiness-h" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10">
        <ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label="today" />
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="readiness-h" className="max-w-3xl text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {roleTitle(map.roleId)} readiness: <span className="font-mono tabular-nums">{pctOf(map.readinessNow)}%</span> today →{" "}
              <span className="font-mono text-primary tabular-nums">{pctOf(map.readinessProjected)}%</span> {when ? `by ${when}` : "by your target date"} if you follow your roadmap
            </h2>
            {demo && <DemoDataNote />}
          </div>
          {gap && (
            <p className="max-w-2xl text-base text-muted-foreground">
              Your biggest gap is <span className="font-medium text-foreground">{gap.name}</span>: {pctOf(gap.demand)}% of {roleName(map.roleId)} ads ask for it
              {gap.moduleCodes.length ? "." : ", and no module covers it."}
            </p>
          )}
          <dl className="grid grid-cols-3 gap-4 border-t pt-4 sm:max-w-xl">
            {stats.map((s) => {
              const Icon = STATUS_META[s.status].icon;
              return (
                <div key={s.label} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon className={cn("size-4", s.status === "proven" ? "text-status-proven" : s.status === "gap" ? "text-status-gap" : "text-status-degree")} aria-hidden />{s.label}</dt>
                  <dd className="font-mono text-3xl font-semibold tabular-nums">{s.value}</dd>
                  <dd className="text-sm text-muted-foreground">{s.hint}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}

function SkillList({ nodes, selectedId, onPick }: { nodes: BridgeMap["nodes"]; selectedId?: string | null; onPick: (id: string) => void }) {
  return (
    <section aria-labelledby="skill-list-h" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="skill-list-h" className="text-base font-semibold">Skills in view</h2>
      <p className="text-sm text-muted-foreground">Pick one to open it and find it on the graph.</p>
      <ul className="relative mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
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
                className={cn("flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", on && "bg-primary/5 font-medium")}
              >
                <Icon className={cn("size-4 shrink-0", n.status === "proven" ? "text-status-proven" : n.status === "gap" ? "text-status-gap" : "text-status-degree")} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                <span className="sr-only">{m.label},</span>
                <span className="font-mono tabular-nums text-muted-foreground">{n.demand > 0 ? `${pctOf(n.demand)}%` : "–"}</span>
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
          <button type="button" onClick={() => activity.setOpen(true)} className={cn(buttonVariants({ variant: "link" }), "h-10 px-0 text-base")}>
            Watch the agents build it <ArrowRight className="size-4" aria-hidden />
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
        action={<Link href="/onboard" className={cn(buttonVariants(), "h-10 rounded-xl px-5")}>Finish onboarding</Link>}
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
    <div className="space-y-6">
      <Headline map={map} targetDate={profile.data?.dna?.targetDate} demo={isDemo} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="graph-h" className="min-w-0 space-y-4 self-start rounded-2xl border bg-card p-4 shadow-sm md:p-6">
          <MapFilters counts={statusCounts(nodes)} active={active} onToggle={toggle} view={view} onView={setView} />
          {view === "graph" ? (
            <BridgeGraph nodes={visible} edges={map.edges} selectedId={selected?.skillId} focusId={focusId} onSelect={pick} summary={summary} />
          ) : (
            <>
              <MapListView nodes={visible} roleLabel={roleName(map.roleId)} selectedId={selected?.skillId} onSelect={(id) => setPicked(id)} />
              <p className="max-w-3xl text-sm text-muted-foreground" aria-live="polite">{summary}</p>
            </>
          )}
          <MapLegend className="border-t pt-4" />
        </section>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start" aria-label="Skill details">
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
