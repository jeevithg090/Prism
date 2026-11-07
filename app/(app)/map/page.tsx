"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, List, Network } from "lucide-react";
import { toast } from "sonner";
import type { BridgeMap, SkillCategory, SkillStatus } from "@/lib/types";
import { apiGet } from "@/lib/fetcher";
import { demoBridgeMap } from "@/lib/demo-data";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, PageHeader, ReadinessRing, ReceiptDrawer, SectionCard, StatCard, StatusBadge } from "@/components/keystone";
import { BridgeGraph } from "@/components/map/BridgeGraph";
import { MapListView } from "@/components/map/MapListView";
const categories: SkillCategory[] = ["language", "framework", "data", "ml-ai", "cloud-devops", "cs-fundamentals", "practice", "professional"];
const statuses: SkillStatus[] = ["proven", "degree-done", "degree-upcoming", "gap"];
export default function MapPage() {
  const [mode, setMode] = useState<"detect" | "demo" | "api">("detect");
  const [selectedId, setSelectedId] = useState("docker");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [visibleStatuses, setVisibleStatuses] = useState<SkillStatus[]>(statuses);
  const [category, setCategory] = useState<SkillCategory | "all">("all");
  const [roleOnly, setRoleOnly] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(params.get("demo") === "1" ? "demo" : "api");
    const skill = params.get("skill"); if (skill) { setSelectedId(skill); setDrawerOpen(true); }
  }, []);
  const query = useQuery({ queryKey: ["graph", "aisha", "ml-engineer"], queryFn: () => apiGet<BridgeMap>("/api/graph/aisha?roleId=ml-engineer"), enabled: mode === "api" });
  const map = mode === "demo" ? demoBridgeMap : query.data;
  const nodes = useMemo(() => (map?.nodes ?? []).slice(0, 120).filter((node) => visibleStatuses.includes(node.status) && (category === "all" || node.category === category) && (!roleOnly || node.demand > 0)), [map, visibleStatuses, category, roleOnly]);
  const selected = map?.nodes.find((node) => node.skillId === selectedId);
  useEffect(() => { if (map && mode === "demo" && !sessionStorage.getItem("ks_map_tip")) { toast.info("Tip: click any skill to see why it matters"); sessionStorage.setItem("ks_map_tip", "1"); } }, [map, mode]);
  const counts = { proven: map?.nodes.filter((n) => n.status === "proven").length ?? 0, degree: map?.nodes.filter((n) => n.status.startsWith("degree")).length ?? 0, gap: map?.nodes.filter((n) => n.status === "gap").length ?? 0 };
  return <>
    <PageHeader title="Your Bridge Map" subtitle="Everything your target role needs, and how your degree and your work already cover it." actions={mode === "demo" ? <DemoDataNote/> : undefined}/>
    {mode === "detect" || (mode === "api" && query.isLoading) ? <div className="grid gap-4 md:grid-cols-4"><LoadingSkeleton variant="card"/><LoadingSkeleton variant="card"/><LoadingSkeleton variant="graph"/></div> : !map && query.isError ? <ErrorState title="We couldn't load your Bridge Map" body="Try loading it again, or open the demo map." onRetry={() => void query.refetch()} onUseDemo={() => setMode("demo")}/> : !map || map.nodes.length === 0 ? <EmptyState icon={Network} title="Your map is empty" body="Finish onboarding to build your Bridge Map."/> : <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-border bg-card p-4"><ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label="Projected by Sep 2027"/></div><StatCard label="Proven" value={counts.proven}/><StatCard label="Degree covers" value={counts.degree}/><StatCard label="Gaps" value={counts.gap}/></div>
      <SectionCard title="Explore your skills" description="Choose a skill to see its demand, degree coverage and evidence.">
        <div className="mb-4 flex flex-wrap items-center gap-2">{statuses.map((status) => <button key={status} type="button" aria-pressed={visibleStatuses.includes(status)} onClick={() => setVisibleStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status])} className={`min-h-10 rounded-full border px-3 text-sm ${visibleStatuses.includes(status) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}><StatusBadge status={status}/></button>)}
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm">Category<select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value as SkillCategory | "all")} className="bg-transparent"><option value="all">All</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm"><input type="checkbox" checked={roleOnly} onChange={(event) => setRoleOnly(event.target.checked)}/> Only role skills</label>
          <div className="ml-auto flex gap-2"><button type="button" aria-pressed={view === "graph"} onClick={() => setView("graph")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3"><Network size={16}/> Graph</button><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3"><List size={16}/> List</button></div>
        </div>
        {!nodes.length ? <EmptyState title="No skills match these filters" body="Turn on another status or choose a different category."/> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>{view === "graph" ? <BridgeGraph nodes={nodes} selected={selectedId} onSelect={(id) => { setSelectedId(id); setDrawerOpen(true); }}/> : <MapListView nodes={nodes} onSelect={(id) => { setSelectedId(id); setDrawerOpen(true); }}/>}</div>
          <aside className="rounded-2xl border border-border bg-background p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{selected?.name ?? "Choose a skill"}</h2>{selected && <StatusBadge status={selected.status}/>}</div>{selected && <><p className="mt-3 font-medium">{selected.skillId === "docker" ? 41 : Math.round(selected.demand * 100)}% of ML engineer ads</p><div className="mt-2 flex items-center gap-2">{selected.trend && <StatusBadge status={selected.trend}/>}<span className="text-sm text-muted-foreground">+12% a year</span></div><p className="mt-3 text-sm text-muted-foreground">{selected.status === "gap" ? "Not covered by your degree" : selected.moduleCodes.length ? `Covered in ${selected.moduleCodes.join(", ")}` : "Evidence shows you've used this skill."}</p><p className="mt-3 text-sm">Evidence: {selected.evidenceIds.length ? `${selected.evidenceIds.length} item(s)` : "none yet"}</p><button type="button" onClick={() => setDrawerOpen(true)} className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm">Why this skill?</button><a href={selected.status === "gap" ? `/roadmap#skill-${selected.skillId}` : "/profile/aisha"} className="mt-3 block text-sm font-medium text-primary">{selected.status === "gap" ? "See it in your roadmap →" : "Show your proof →"}</a></>}</aside>
        </div>}
      </SectionCard>
      <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><GraduationCap size={18}/>Your course coverage is shown separately so you can focus on what is still missing.</div>
      {selected && <ReceiptDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={selected.name} receipt={{ demandPct: selected.skillId === "docker" ? 41 : Math.round(selected.demand * 100), trend: selected.trend, growthPerYear: .12, coveredByDegree: selected.status === "degree-done" ? "done" : selected.status === "degree-upcoming" ? "upcoming" : "no", moduleCode: selected.moduleCodes[0], evidenceIds: selected.evidenceIds, reason: selected.status === "gap" ? "This skill is requested for your target role and is not taught by your current modules." : "This skill is included because it connects your degree and your target role." }}/>}</>}
  </>;
}
