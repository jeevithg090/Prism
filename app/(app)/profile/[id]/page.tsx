"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeCheck, Copy, Github } from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/fetcher";
import { demoBridgeMap, demoProfile } from "@/lib/demo-data";
import type { BridgeMap, Profile } from "@/lib/types";
import { BadgePill, DemoDataNote, ErrorState, LoadingSkeleton, PageHeader, SectionCard, SkillChip } from "@/components/keystone";
export default function PassportPage() {
  const params = useParams<{ id: string }>();
  const [demo, setDemo] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { setDemo(new URLSearchParams(window.location.search).get("demo") === "1"); }, []);
  const profileQuery = useQuery({ queryKey: ["profile", params.id], queryFn: () => apiGet<Profile>(`/api/profile/${encodeURIComponent(params.id)}`), enabled: !demo });
  const profile = demo ? demoProfile : profileQuery.data;
  const mapQuery = useQuery({ queryKey: ["graph", params.id, "ml-engineer"], queryFn: () => apiGet<BridgeMap>(`/api/graph/${encodeURIComponent(params.id)}?roleId=ml-engineer`), enabled: !demo });
  const map = demo ? demoBridgeMap : mapQuery.data;
  async function copyLink() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); toast.success("Link copied"); } catch { toast.error("Couldn't copy the passport link."); } }
  if (!profile || !map) return profileQuery.isError || mapQuery.isError ? <ErrorState title="We couldn't load this passport" onRetry={() => { void profileQuery.refetch(); void mapQuery.refetch(); }} onUseDemo={() => setDemo(true)}/> : <div className="space-y-4"><LoadingSkeleton/><LoadingSkeleton variant="list"/></div>;
  const skills = map.nodes.filter((node) => node.level >= 2).sort((a, b) => a.category.localeCompare(b.category));
  const groups = Object.groupBy ? Object.groupBy(skills, (node) => node.category) : skills.reduce<Record<string, typeof skills>>((all, node) => { (all[node.category] ??= []).push(node); return all; }, {});
  return <div className="print:text-black"><PageHeader title="Skill Passport" subtitle="A shareable record of skills backed by real evidence." actions={<><button onClick={copyLink} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 print:hidden"><Copy size={16}/>{copied ? "Copied" : "Copy link"}</button>{demo && <DemoDataNote/>}</>}/>
    <SectionCard title={profile.name} description="BSc Computer Science · University of Manchester"><div className="flex flex-wrap items-center gap-3"><div className="grid size-14 place-items-center rounded-full bg-primary/10 text-xl font-semibold text-primary">{profile.name.slice(0, 1)}</div>{profile.badges.map((badge) => <BadgePill key={badge} badge={badge}/>)}<span className="inline-flex items-center gap-2 rounded-full bg-status-proven/10 px-3 py-2 text-sm text-status-proven"><BadgeCheck size={18}/> Verified by evidence, not self-reported</span></div></SectionCard>
    <div className="mt-6 grid gap-5 md:grid-cols-2">{Object.entries(groups).map(([category, group]) => <SectionCard key={category} title={category.replaceAll("-", " ")}><div className="space-y-3">{group?.map((skill) => <div key={skill.skillId} className="flex items-center justify-between gap-2"><SkillChip skillId={skill.skillId} name={skill.name} status={skill.status} level={skill.level}/>{skill.evidenceIds.length > 0 && <a className="rounded-lg p-2 text-primary" href="https://github.com/" target="_blank" rel="noreferrer" aria-label={`View GitHub evidence for ${skill.name}`}><Github size={18}/></a>}</div>)}</div></SectionCard>)}</div>
    <div className="mt-5"><SectionCard title="Build log"><p className="text-sm text-muted-foreground">The project build log will appear here when P5’s slot is connected.</p></SectionCard></div>
  </div>;
}
