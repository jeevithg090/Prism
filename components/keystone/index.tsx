"use client";
// Keystone shared components (contract §9.6). Names and props are the contract: extend, never rename.
import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Compass,
  Database,
  GitPullRequest,
  GraduationCap,
  Hammer,
  Mic,
  Milestone,
  Minus,
  Network,
  RotateCw,
  Route,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { AgentName, BadgeId, SkillStatus, TrendLabel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- PageHeader ----------

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-base text-muted-foreground md:text-lg">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- StatusBadge ----------

// Status colours are for the icon, tint and border; the label stays text-foreground so it keeps 4.5:1 on the tint (DESIGN.md §3).
const STATUS: Record<string, { icon: LucideIcon; label: string; cls: string; iconCls: string }> = {
  proven: { icon: CheckCircle2, label: "Proven", cls: "bg-status-proven/10 border-status-proven/30", iconCls: "text-status-proven" },
  "degree-done": { icon: GraduationCap, label: "Degree ✓", cls: "bg-status-degree/10 border-status-degree/30", iconCls: "text-status-degree" },
  "degree-upcoming": { icon: GraduationCap, label: "Degree · later", cls: "bg-status-degree/5 border-status-degree/50 border-dashed", iconCls: "text-status-degree" },
  gap: { icon: Target, label: "Gap", cls: "bg-status-gap/10 border-status-gap/30", iconCls: "text-status-gap" },
  rising: { icon: TrendingUp, label: "Rising", cls: "bg-status-rising/10 border-status-rising/30", iconCls: "text-status-rising" },
  stable: { icon: Minus, label: "Stable", cls: "bg-muted border-border", iconCls: "text-muted-foreground" },
  declining: { icon: TrendingDown, label: "Cooling", cls: "bg-muted border-border", iconCls: "text-muted-foreground" },
};
export function StatusBadge({ status, size = "md" }: { status: SkillStatus | TrendLabel; size?: "sm" | "md" }) {
  const s = STATUS[status] ?? STATUS.stable; const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground", s.cls, size === "sm" && "px-2")}>
      <Icon className={cn("size-3.5 shrink-0", s.iconCls)} aria-hidden />{s.label}
    </span>
  );
}

// ---------- SkillChip ----------

export function SkillChip({ skillId, name, status, level, onClick }: { skillId: string; name: string; status?: SkillStatus; level?: number; onClick?: () => void }) {
  const detail = `${status ? `, ${status}` : ""}${level !== undefined ? `, level ${level} of 3` : ""}`;
  const dot = status === "proven" ? "bg-status-proven" : status === "gap" ? "bg-status-gap" : status ? "bg-status-degree" : "bg-muted-foreground";
  const visual = (
    <>
      <span className={cn("size-2 shrink-0 rounded-full", dot, status === "degree-upcoming" && "bg-transparent ring-1 ring-status-degree ring-inset")} aria-hidden />
      <span>{name}</span>
      {level !== undefined && (
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3].map((i) => <span key={i} className={cn("size-1.5 rounded-full", i <= level ? "bg-foreground" : "bg-border")} />)}
        </span>
      )}
    </>
  );
  const cls = "inline-flex items-center gap-1.5 rounded-xl border bg-card px-2.5 py-1 text-sm";
  if (onClick) {
    return (
      <button type="button" data-skill={skillId} aria-label={`${name}${detail}`} onClick={onClick} className={cn(cls, "transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring")}>
        {visual}
      </button>
    );
  }
  // A plain span can't carry aria-label (axe: aria-prohibited-attr), so the status and level are sr-only text.
  return (
    <span data-skill={skillId} className={cls}>
      {visual}
      {detail && <span className="sr-only">{detail}</span>}
    </span>
  );
}

// ---------- SectionCard ----------

export function SectionCard({ title, description, actions, children, className }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-6 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="text-xl font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------- StatCard ----------

export function StatCard({ label, value, delta, hint, icon: Icon, className }: { label: string; value: React.ReactNode; delta?: number; hint?: string; icon?: LucideIcon; className?: string }) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={cn("flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
        {delta !== undefined && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground tabular-nums", up ? "border-status-proven/25 bg-status-proven/10" : "border-status-gap/25 bg-status-gap/10")}>
            {up ? <TrendingUp className="size-3.5 text-status-proven" aria-hidden /> : <TrendingDown className="size-3.5 text-status-gap" aria-hidden />}
            {up ? "+" : "−"}{Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-auto pt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------- EmptyState / ErrorState ----------

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center shadow-sm md:py-12">
      {Icon && (
        <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <h3 className="text-lg font-semibold text-balance">{title}</h3>
      {body && <p className="max-w-md text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, onRetry, onUseDemo }: { title?: string; body?: string; onRetry?: () => void; onUseDemo?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center shadow-sm md:py-12">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-status-gap/10 text-status-gap">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h3 className="text-lg font-semibold text-balance">{title}</h3>
      {body && <p className="max-w-md text-muted-foreground">{body}</p>}
      {(onRetry || onUseDemo) && (
        <div className="mt-2 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
          {onUseDemo && <Button variant="outline" className="h-10 rounded-xl px-4" onClick={onUseDemo}>Use demo data</Button>}
          {onRetry && <Button className="h-10 rounded-xl px-4" onClick={onRetry}><RotateCw aria-hidden />Retry</Button>}
        </div>
      )}
    </div>
  );
}

// ---------- LoadingSkeleton ----------

export function LoadingSkeleton({ variant = "card" }: { variant?: "card" | "list" | "chart" | "graph" }) {
  const sr = <span className="sr-only">Loading</span>;
  if (variant === "list") {
    return (
      <div className="divide-y rounded-2xl border bg-card px-6 shadow-sm" aria-busy="true">
        {sr}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 py-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3.5 w-2/3" /></div>
            <Skeleton className="hidden h-9 w-24 rounded-xl sm:block" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "chart") {
    const bars = [62, 88, 45, 74, 56, 92, 38, 68];
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm" aria-busy="true">
        {sr}
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        <div className="mt-6 flex h-48 items-end gap-3">
          {bars.map((h, i) => <Skeleton key={i} className="flex-1 rounded-t-lg rounded-b-none" style={{ height: `${h}%` }} />)}
        </div>
      </div>
    );
  }
  if (variant === "graph") {
    const nodes = [[18, 30, 10], [42, 55, 14], [68, 28, 9], [80, 66, 12], [30, 76, 8], [56, 82, 7]];
    return (
      <div className="relative h-72 overflow-hidden rounded-2xl border bg-card shadow-sm md:h-[28rem]" aria-busy="true">
        {sr}
        {nodes.map(([x, y, s], i) => <Skeleton key={i} className="absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: `${s * 4}px`, height: `${s * 4}px` }} />)}
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm" aria-busy="true">
      {sr}
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-9 w-1/4" />
      <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
      <Skeleton className="h-10 w-36 rounded-xl" />
    </div>
  );
}

// ---------- BadgePill ----------

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
  if (!b) return null;
  return <span title={b.tip} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap"><span aria-hidden>{b.emoji}</span>{b.label}</span>;
}

// ---------- AgentAvatar ----------

/** The GitHub mark (lucide 1.x ships no brand icons). */
function GitHubMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false" className={className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

type AgentIcon = LucideIcon | typeof GitHubMarkIcon;
/** Agent identities (contract §9.6): icon, colour and a display name for all 14 agents. */
export const AGENT_META: Record<AgentName, { name: string; icon: AgentIcon; cls: string }> = {
  orchestrator: { name: "Orchestrator", icon: Workflow, cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  syllabus: { name: "Syllabus agent", icon: BookOpen, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  skillmap: { name: "Skill map agent", icon: Network, cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  market: { name: "Market agent", icon: Briefcase, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  trends: { name: "Trends agent", icon: TrendingUp, cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  evidence: { name: "Evidence agent", icon: GitHubMarkIcon, cls: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300" },
  roadmap: { name: "Roadmap agent", icon: Route, cls: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  matchmaker: { name: "Matchmaker", icon: Users, cls: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  architect: { name: "Project Architect", icon: Hammer, cls: "bg-teal-500/10 text-teal-700 dark:text-teal-400" },
  techlead: { name: "Tech Lead", icon: GitPullRequest, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  trajectories: { name: "Trajectories agent", icon: Milestone, cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
  guides: { name: "Guides agent", icon: Compass, cls: "bg-lime-500/15 text-lime-700 dark:text-lime-400" },
  voice: { name: "Voice coach", icon: Mic, cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  n8n: { name: "n8n automations", icon: Zap, cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

export function AgentAvatar({ agent, size = 32 }: { agent: AgentName; size?: number }) {
  const a = AGENT_META[agent] ?? AGENT_META.orchestrator;
  const Icon = a.icon;
  const icon = Math.max(14, Math.round(size * 0.5));
  return (
    <span role="img" aria-label={a.name} title={a.name} className={cn("inline-flex shrink-0 items-center justify-center rounded-xl", a.cls)} style={{ width: size, height: size }}>
      <Icon className="shrink-0" style={{ width: icon, height: icon }} aria-hidden />
    </span>
  );
}

// ---------- DemoDataNote ----------

export function DemoDataNote() {
  return (
    <span title="Seeded for the demo, not live data" className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground">
      <Database className="size-3.5" aria-hidden />Demo data
    </span>
  );
}

// ---------- ReadinessRing ----------

/** Readiness today as a solid arc, the projected value as a ghost arc behind it. Counts up once. */
export function ReadinessRing({ value, projected, label, className }: { value: number; projected?: number; label: string; className?: string }) {
  const reduce = useReducedMotion();
  const now = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const ahead = projected !== undefined ? Math.round(Math.min(1, Math.max(0, projected)) * 100) : undefined;
  const number = React.useRef<HTMLSpanElement>(null);
  // Count up once by writing to React's own text node: an external DOM update, no re-renders.
  React.useLayoutEffect(() => {
    const el = number.current;
    if (!el?.firstChild || reduce || typeof requestAnimationFrame === "undefined") return;
    const text = el.firstChild;
    const start = performance.now();
    let raf = 0;
    const tick = (t0: number) => {
      const t = Math.min(1, (t0 - start) / 800);
      text.nodeValue = `${Math.round(now * (1 - Math.pow(1 - t, 3)))}%`;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    text.nodeValue = "0%";
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      text.nodeValue = `${now}%`;
    };
  }, [now, reduce]);
  const arc = (pct: number) => ({ strokeDasharray: "100 100", strokeDashoffset: 100 - pct });
  return (
    <div
      role="img"
      aria-label={`Readiness ${now} percent${ahead !== undefined ? `, projected ${ahead} percent` : ""}`}
      className={cn("relative size-[120px] shrink-0 md:size-40", className)}
    >
      <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden focusable="false">
        <style>{"@keyframes ks-ring-fill{from{stroke-dashoffset:100}}"}</style>
        <circle cx="80" cy="80" r="74" fill="none" strokeWidth="12" className="stroke-muted" />
        {ahead !== undefined && (
          <circle cx="80" cy="80" r="74" fill="none" strokeWidth="12" strokeLinecap="round" pathLength={100} className="stroke-primary/25 motion-safe:animate-[ks-ring-fill_1100ms_ease-out_both]" style={arc(ahead)} />
        )}
        <circle cx="80" cy="80" r="74" fill="none" strokeWidth="12" strokeLinecap="round" pathLength={100} className="stroke-primary motion-safe:animate-[ks-ring-fill_800ms_ease-out_both]" style={arc(now)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
        <span ref={number} className="font-mono text-3xl leading-none font-semibold tracking-tight tabular-nums md:text-4xl">{`${now}%`}</span>
        {label && <span className="mt-1.5 text-xs leading-tight text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}
