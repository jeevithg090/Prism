"use client";
// LOCAL SHIM of P3's components/keystone/* (contract §9.6). Replace with P3's when merged.
import * as React from "react";
import { CheckCircle2, GraduationCap, Target, TrendingUp, TrendingDown, Minus, Users, Hammer, GitPullRequest, Milestone, Compass, Workflow, type LucideIcon } from "lucide-react";
import type { AgentName, BadgeId, SkillStatus, TrendLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>{subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
const STATUS: Record<string, { icon: LucideIcon; label: string; cls: string }> = {
  proven: { icon: CheckCircle2, label: "Proven", cls: "text-status-proven bg-status-proven/10 border-status-proven/20" },
  "degree-done": { icon: GraduationCap, label: "Degree ✓", cls: "text-status-degree bg-status-degree/10 border-status-degree/20" },
  "degree-upcoming": { icon: GraduationCap, label: "Degree · later", cls: "text-status-degree bg-status-degree/10 border-status-degree/20 border-dashed" },
  gap: { icon: Target, label: "Gap", cls: "text-status-gap bg-status-gap/10 border-status-gap/20" },
  rising: { icon: TrendingUp, label: "Rising", cls: "text-status-rising bg-status-rising/10 border-status-rising/20" },
  stable: { icon: Minus, label: "Stable", cls: "text-muted-foreground bg-muted border-border" },
  declining: { icon: TrendingDown, label: "Cooling", cls: "text-muted-foreground bg-muted border-border" },
};
export function StatusBadge({ status, size = "md" }: { status: SkillStatus | TrendLabel; size?: "sm" | "md" }) {
  const s = STATUS[status]; const Icon = s.icon;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", s.cls, size === "sm" && "px-2")}><Icon className="size-3.5" aria-hidden />{s.label}</span>;
}
export function SkillChip({ skillId, name, status, level, onClick }: { skillId: string; name: string; status?: SkillStatus; level?: number; onClick?: () => void }) {
  const label = `${name}${status ? `, ${status}` : ""}${level !== undefined ? `, level ${level} of 3` : ""}`;
  const dot = status === "proven" ? "bg-status-proven" : status === "gap" ? "bg-status-gap" : status ? "bg-status-degree" : "bg-muted-foreground";
  const inner = (<><span className={cn("size-2 rounded-full", dot)} aria-hidden /><span>{name}</span>{level !== undefined && <span className="flex gap-0.5" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={cn("size-1 rounded-full", i <= level ? "bg-foreground" : "bg-border")} />)}</span>}</>);
  const cls = "inline-flex items-center gap-1.5 rounded-xl border bg-card px-2.5 py-1 text-sm";
  return onClick ? <button type="button" data-skill={skillId} aria-label={label} onClick={onClick} className={cn(cls, "focus-visible:ring-2 focus-visible:ring-ring")}>{inner}</button> : <span data-skill={skillId} aria-label={label} className={cls}>{inner}</span>;
}
export function SectionCard({ title, description, actions, children, className }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-6 shadow-sm", className)}>
      {(title || actions) && <div className="mb-4 flex items-start justify-between gap-4"><div>{title && <h2 className="text-xl font-semibold">{title}</h2>}{description && <p className="text-sm text-muted-foreground">{description}</p>}</div>{actions}</div>}
      {children}
    </section>
  );
}
export function StatCard({ label, value, delta, hint }: { label: string; value: React.ReactNode; delta?: number; hint?: string }) {
  return <div className="rounded-2xl border bg-card p-6 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-semibold tabular-nums">{value}</p>{delta !== undefined && <span className={cn("rounded-full px-2 text-xs", delta >= 0 ? "bg-status-proven/10 text-status-proven" : "bg-status-gap/10 text-status-gap")}>{delta >= 0 ? "+" : ""}{delta}%</span>}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}
export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center">{Icon && <span className="rounded-full bg-primary/10 p-3 text-primary"><Icon className="size-6" aria-hidden /></span>}<h3 className="text-lg font-semibold">{title}</h3>{body && <p className="max-w-md text-muted-foreground">{body}</p>}{action}</div>;
}
export function ErrorState({ title = "Something went wrong", body, onRetry, onUseDemo }: { title?: string; body?: string; onRetry?: () => void; onUseDemo?: () => void }) {
  return <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center"><h3 className="text-lg font-semibold">{title}</h3>{body && <p className="text-muted-foreground">{body}</p>}<div className="flex gap-2">{onRetry && <Button onClick={onRetry}>Retry</Button>}{onUseDemo && <Button variant="outline" onClick={onUseDemo}>Use demo data</Button>}</div></div>;
}
export function LoadingSkeleton({ variant = "card" }: { variant?: "card" | "list" | "chart" | "graph" }) {
  if (variant === "list") return <div className="space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>;
  return <Skeleton aria-busy="true" className={cn("w-full rounded-2xl", variant === "card" ? "h-48" : "h-72")} />;
}
const BADGES: Record<BadgeId, { emoji: string; label: string; tip: string }> = {
  "new-to-uni": { emoji: "🌱", label: "New to UoM", tip: "New to UoM: in their first 10 weeks. Be extra welcoming!" },
  international: { emoji: "🌍", label: "International", tip: "International student" },
  "first-gen": { emoji: "🧭", label: "First-gen", tip: "First in their family at university" },
  "career-changer": { emoji: "🔁", label: "Career changer", tip: "Switching careers" },
  helper: { emoji: "🤝", label: "Helper", tip: "Helped 2+ students" },
  shipped: { emoji: "🛠️", label: "Shipped", tip: "Merged a pod PR" },
  "interview-ready": { emoji: "🎤", label: "Interview-ready", tip: "Mock interview average ≥ 3.5" },
};
export function BadgePill({ badge }: { badge: BadgeId }) {
  const b = BADGES[badge];
  return <span title={b.tip} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium"><span aria-hidden>{b.emoji}</span>{b.label}</span>;
}
const AGENTS: Partial<Record<AgentName, { icon: LucideIcon; cls: string }>> = {
  matchmaker: { icon: Users, cls: "bg-pink-500/10 text-pink-600" }, architect: { icon: Hammer, cls: "bg-teal-500/10 text-teal-600" },
  techlead: { icon: GitPullRequest, cls: "bg-emerald-500/10 text-emerald-600" }, trajectories: { icon: Milestone, cls: "bg-cyan-500/10 text-cyan-600" },
  guides: { icon: Compass, cls: "bg-lime-500/10 text-lime-700" },
};
export function AgentAvatar({ agent, size = 32 }: { agent: AgentName; size?: number }) {
  const a = AGENTS[agent] ?? { icon: Workflow, cls: "bg-slate-500/10 text-slate-600" }; const Icon = a.icon;
  return <span className={cn("inline-flex items-center justify-center rounded-xl", a.cls)} style={{ width: size, height: size }} aria-label={agent}><Icon className="size-4" aria-hidden /></span>;
}
export function DemoDataNote() { return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Demo data</span>; }
export function ReadinessRing({ value, projected, label }: { value: number; projected?: number; label: string }) {
  return <div role="img" aria-label={`Readiness ${Math.round(value * 100)} percent${projected ? `, projected ${Math.round(projected * 100)} percent` : ""}`} className="text-3xl font-semibold">{Math.round(value * 100)}% <span className="text-sm text-muted-foreground">{label}</span></div>;
}
