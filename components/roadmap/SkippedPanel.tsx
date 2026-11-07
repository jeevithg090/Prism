import { GraduationCap } from "lucide-react";
import type { Roadmap, BridgeMap } from "@/lib/types";
import { SectionCard } from "@/components/keystone";
export function SkippedPanel({ roadmap, map }: { roadmap: Roadmap; map: BridgeMap }) {
  return <SectionCard title="Don't relearn: your degree covers these" description="Spend your time on skills your modules don't teach yet." className="border-status-degree/40 bg-gradient-to-br from-status-degree/10 via-card to-card">
    <div className="space-y-3">{roadmap.skipped.map((item) => <div key={`${item.skillId}-${item.moduleCode}`} className="rounded-xl border border-status-degree/20 bg-card p-4"><p className="flex items-center gap-2 font-semibold"><GraduationCap className="text-status-degree" size={18}/>{map.nodes.find((node) => node.skillId === item.skillId)?.name ?? item.skillId} → {item.moduleCode}</p><p className="mt-2 text-sm text-muted-foreground">{item.message}</p></div>)}</div>
  </SectionCard>;
}
