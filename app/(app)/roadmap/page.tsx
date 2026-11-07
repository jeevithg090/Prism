"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { BridgeMap, Roadmap } from "@/lib/types";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { demoBridgeMap, demoRoadmap } from "@/lib/demo-data";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, PageHeader, SectionCard } from "@/components/keystone";
import { WeekCard } from "@/components/roadmap/WeekCard";
import { SkippedPanel } from "@/components/roadmap/SkippedPanel";
import { useActivity } from "@/components/shell/ActivityPanel";
import { Button } from "@/components/ui/button";

export default function RoadmapPage() {
  const [mode, setMode] = useState<"detect" | "demo" | "api">("detect");
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({});
  const [theoryPractice, setTheoryPractice] = useState(70);
  const queryClient = useQueryClient(), activity = useActivity();
  useEffect(() => { setMode(new URLSearchParams(window.location.search).get("demo") === "1" ? "demo" : "api"); }, []);
  const query = useQuery({ queryKey: ["roadmap", "aisha"], queryFn: () => apiGet<Roadmap>("/api/roadmap/aisha"), enabled: mode === "api" });
  const mapQuery = useQuery({ queryKey: ["graph", "aisha", "ml-engineer"], queryFn: () => apiGet<BridgeMap>("/api/graph/aisha?roleId=ml-engineer"), enabled: mode === "api" });
  const roadmap = mode === "demo" ? demoRoadmap : query.data;
  const map = mode === "demo" ? demoBridgeMap : mapQuery.data;
  const taskMutation = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) => apiPatch(`/api/roadmap/aisha/tasks/${encodeURIComponent(taskId)}`, { done }),
    onMutate: async ({ taskId, done }) => { await queryClient.cancelQueries({ queryKey: ["roadmap", "aisha"] }); const previous = queryClient.getQueryData<Roadmap>(["roadmap", "aisha"]); if (previous) queryClient.setQueryData<Roadmap>(["roadmap", "aisha"], { ...previous, weeks: previous.weeks.map((week) => ({ ...week, tasks: week.tasks.map((task) => task.id === taskId ? { ...task, done } : task) })) }); return { previous }; },
    onError: (_error, _variables, context) => { if (context?.previous) queryClient.setQueryData(["roadmap", "aisha"], context.previous); toast.error("Couldn't save that step. Try again."); },
    onSuccess: () => toast.success("Nice! 1 step closer"),
  });
  async function regenerate() {
    try { await apiPost("/api/roadmap/generate", { userId: "aisha", roleId: "ml-engineer" }); await queryClient.invalidateQueries({ queryKey: ["roadmap", "aisha"] }); activity.setOpen(true); toast.success("Roadmap updated"); }
    catch { if (mode === "demo") { toast.success("Demo roadmap refreshed"); return; } toast.error("Couldn't regenerate the roadmap. Try again or use the demo."); }
  }
  async function adjust(value: number) {
    setTheoryPractice(value);
    if (mode === "demo") return;
    try { await apiPatch("/api/profile/aisha", { dna: { theoryPractice: value } }); await regenerate(); }
    catch { toast.error("Couldn't save your learning preference."); }
  }
  const isLoading = mode === "detect" || (mode === "api" && (query.isLoading || mapQuery.isLoading));
  const isError = mode === "api" && (query.isError || mapQuery.isError);
  return <>
    <PageHeader title="Your 12-week bridge" subtitle="A focused plan toward your goal that builds on what your degree already teaches." actions={<>{mode === "demo" && <DemoDataNote/>}<Button variant="outline" onClick={regenerate}><RefreshCw size={16}/> Regenerate</Button></>}/>
    {roadmap && <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"><p className="text-lg font-semibold">{Math.round(roadmap.readinessNow * 100)}% today → {Math.round(roadmap.readinessProjected * 100)}% by Sep 2027</p><label className="ml-auto flex min-h-11 items-center gap-2 text-sm">Theory<input aria-label="Theory and practice balance" type="range" min="0" max="100" step="10" value={theoryPractice} onChange={(event) => void adjust(Number(event.target.value))}/>Practice <span className="font-mono">{theoryPractice}%</span></label><span className="text-xs text-muted-foreground">v{roadmap.version} · updated recently</span></div>}
    {isLoading ? <div className="grid gap-4 lg:grid-cols-12"><div className="space-y-4 lg:col-span-8"><LoadingSkeleton variant="list"/><LoadingSkeleton variant="card"/><LoadingSkeleton variant="card"/></div><LoadingSkeleton variant="card"/> </div> : isError ? <ErrorState title="We couldn't load your roadmap" body="Try again, or see the Aisha demo plan." onRetry={() => { void query.refetch(); void mapQuery.refetch(); }} onUseDemo={() => setMode("demo")}/> : !roadmap || !roadmap.weeks.length ? <EmptyState title="No roadmap yet" body="Build a practical plan from your degree, your goal and your available time." action={<Button onClick={regenerate}>Build my roadmap</Button>}/> : map && <div className="grid items-start gap-6 lg:grid-cols-12"><div className="space-y-4 lg:col-span-8">{roadmap.weeks.map((week, index) => {
      const skill = map.nodes.find((node) => node.skillId === week.focusSkillId) ?? { skillId: week.focusSkillId, name: week.focusSkillId, category: "practice" as const, status: "gap" as const, demand: 0, level: 0 as const, evidenceIds: [], moduleCodes: [] };
      const allDone = week.tasks.every((task) => localDone[task.id] ?? Boolean(task.done));
      return <div key={week.week} className={allDone ? "motion-safe:animate-pulse" : ""}><WeekCard week={week} skill={skill} done={localDone} current={index === 2} onTaskChange={(taskId, done) => { if (mode === "demo") { setLocalDone((previous) => ({ ...previous, [taskId]: done })); toast.success(allDone ? "Week complete: momentum +4" : "Nice! 1 step closer"); } else taskMutation.mutate({ taskId, done }); }}/></div>;
    })}</div><aside className="lg:sticky lg:top-20 lg:col-span-4"><SkippedPanel roadmap={roadmap} map={map}/><SectionCard title="Make the plan yours" description="We can adjust the balance to suit how you like to learn."><p className="text-sm text-muted-foreground">Mostly building ({theoryPractice}%), some reading ({100 - theoryPractice}%).</p></SectionCard></aside></div>}
  </>;
}
