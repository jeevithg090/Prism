"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Mic, Sparkles } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { demoBridgeMap, demoProfile, demoRoadmap } from "@/lib/demo-data";
import type { BridgeMap } from "@/lib/types";
import { BadgePill, DemoDataNote, ErrorState, LoadingSkeleton, PageHeader, ReadinessRing, SectionCard, SkillChip, StatCard } from "@/components/keystone";
import { TaskRow } from "@/components/roadmap/TaskRow";

export default function DashboardPage() {
  const [mode, setMode] = useState<"detect" | "demo" | "api">("detect");
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => { setMode(new URLSearchParams(window.location.search).get("demo") === "1" ? "demo" : "api"); }, []);
  const graph = useQuery({ queryKey: ["graph", "aisha", "ml-engineer"], queryFn: () => apiGet<BridgeMap>("/api/graph/aisha?roleId=ml-engineer"), enabled: mode === "api" });
  const map = mode === "demo" ? demoBridgeMap : graph.data;
  if (mode === "detect" || (mode === "api" && graph.isLoading)) return <><PageHeader title="Your dashboard" subtitle="Your next steps toward your goal."/><div className="grid gap-5 md:grid-cols-6"><LoadingSkeleton variant="card"/><LoadingSkeleton variant="card"/><LoadingSkeleton variant="list"/></div></>;
  if (mode === "api" && graph.isError) return <ErrorState title="We couldn't load your dashboard" onRetry={() => void graph.refetch()} onUseDemo={() => setMode("demo")}/>;
  if (!map) return null;
  const gaps = map.nodes.filter((node) => node.status === "gap").slice(0, 3);
  const rising = map.nodes.filter((node) => node.trend === "rising").sort((a, b) => b.demand - a.demand).slice(0, 3);
  const firstWeek = demoRoadmap.weeks[2];
  return <>
    <PageHeader title={`Hi ${demoProfile.name.split(" ")[0]} 👋`} subtitle="You're making progress toward ML engineering. Here's a useful next step." actions={mode === "demo" ? <DemoDataNote/> : undefined}/>
    {demoProfile.badges.includes("new-to-uni") && <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4"><p className="font-semibold">🌱 Welcome to UoM!</p><p className="mt-1 text-sm text-muted-foreground">Your buddy and pod are ready to help.</p></div>}
    <div className="grid gap-5 md:grid-cols-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:col-span-4"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><p className="text-sm text-muted-foreground">Your readiness</p><h2 className="mt-2 text-2xl font-semibold">You're {Math.round(map.readinessNow * 100)}% of the way to ML engineer.</h2><p className="mt-3 max-w-md text-muted-foreground">Projected {Math.round(map.readinessProjected * 100)}% by Sep 2027 if you follow your roadmap.</p><div className="mt-4 flex flex-wrap gap-2">{demoProfile.badges.map((badge) => <BadgePill key={badge} badge={badge}/>)}</div></div><ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label="Projected by Sep 2027"/></div></section>
      <SectionCard title="This week" description="A small step you can start today">{firstWeek.tasks.map((task) => <TaskRow key={task.id} task={task} checked={done[task.id] ?? Boolean(task.done)} onChange={(value) => setDone((current) => ({ ...current, [task.id]: value }))}/>)}<Link href="/roadmap" className="mt-4 inline-flex text-sm font-medium text-primary">Open roadmap →</Link></SectionCard>
      <SectionCard title="Top gaps" description="Skills that move you toward your goal">{gaps.map((node) => <Link key={node.skillId} href={`/map?skill=${node.skillId}`} className="mb-2 block"><SkillChip skillId={node.skillId} name={node.name} status={node.status} level={node.level}/></Link>)}<Link href="/map" className="text-sm text-primary">Explore your Bridge Map →</Link></SectionCard>
      <SectionCard title="Market pulse" description="Rising skills that match your goal">{rising.map((node) => <div key={node.skillId} className="mb-3"><p className="font-semibold">{node.name} <span className="text-status-rising">+{node.skillId === "llm-evaluation" ? 38 : 12}%/yr</span></p><p className="text-xs text-muted-foreground">Requested in {Math.round(node.demand * 100)}% of relevant ads</p></div>)}</SectionCard>
      <SectionCard title="Your pod" description="Peer learning helps skills stick"><p className="text-sm text-muted-foreground">Your matched pod summary will show here when P5’s pod slot is ready.</p><Link href="/pods" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary">Explore pods <ArrowUpRight size={16}/></Link></SectionCard>
      <SectionCard title="Weekly momentum"><div className="flex items-center gap-2"><Sparkles className="text-primary"/><p className="text-sm">Your week-by-week progress will appear when the momentum slot is connected.</p></div></SectionCard>
      <SectionCard title="Weekly briefing"><div className="flex items-center gap-2"><BookOpen className="text-primary"/><p className="text-sm text-muted-foreground">Your personal audio briefing will appear here when P4’s player is ready.</p></div></SectionCard>
      <div className="md:col-span-2"><StatCard label="Skills with evidence" value={map.nodes.filter((node) => node.status === "proven").length} hint="Verified from public work you've chosen to share"/></div>
      <SectionCard title="Practise an interview"><div className="flex items-center gap-3"><Mic className="text-primary"/><p className="text-sm text-muted-foreground">Try a five-minute voice practice for your target role.</p></div><Link href="/interview" className="mt-3 inline-block text-sm text-primary">Start practice →</Link></SectionCard>
    </div>
  </>;
}
