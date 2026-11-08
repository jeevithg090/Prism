"use client";
// Small status pieces for /governance. Never colour alone: every pill pairs colour + icon + text.
// Same build as <StatusBadge>: the colour sits on the icon, tint and edge; the label stays ink.
import { CheckCircle2, LifeBuoy, ShieldAlert, ShieldCheck, ShieldX, UserCheck, XCircle, type LucideIcon } from "lucide-react";
import type { CheckpointKind, GuardrailFinding, RunStatus } from "@/lib/agents/harness";
import { CHECKPOINT_LABELS } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

const STATUS: Record<RunStatus, { icon: LucideIcon; label: string; cls: string; iconCls: string }> = {
  ok: { icon: CheckCircle2, label: "OK", cls: "bg-status-proven/10 border-status-proven/35", iconCls: "text-status-proven" },
  fallback: { icon: LifeBuoy, label: "Fallback", cls: "bg-status-rising/12 border-status-rising/45", iconCls: "text-status-rising" },
  error: { icon: XCircle, label: "Error", cls: "bg-status-gap/10 border-status-gap/35", iconCls: "text-status-gap" },
};

export function StatusPill({ status, title }: { status: RunStatus; title?: string }) {
  const s = STATUS[status] ?? STATUS.error;
  const Icon = s.icon;
  return (
    <span title={title} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-sm font-medium whitespace-nowrap text-foreground", s.cls)}>
      <Icon className={cn("size-4 shrink-0", s.iconCls)} aria-hidden />
      {s.label}
    </span>
  );
}

const ACTION: Record<GuardrailFinding["action"], { icon: LucideIcon; label: string; cls: string; iconCls: string }> = {
  pass: { icon: ShieldCheck, label: "passed", cls: "bg-card border-border", iconCls: "text-status-proven" },
  modified: { icon: ShieldAlert, label: "modified", cls: "bg-status-rising/12 border-status-rising/45", iconCls: "text-status-rising" },
  blocked: { icon: ShieldX, label: "blocked", cls: "bg-status-gap/10 border-status-gap/35", iconCls: "text-status-gap" },
};

/** The guardrail's name, then what it did, as two parts of one chip (detail in the tooltip and for screen readers). */
export function GuardrailActionChip({ finding }: { finding: GuardrailFinding }) {
  const a = ACTION[finding.action] ?? ACTION.pass;
  const Icon = a.icon;
  return (
    <span title={finding.detail} className={cn("inline-flex min-h-7 max-w-full flex-wrap items-center gap-x-1.5 rounded-md border px-2 py-1 text-sm text-foreground", a.cls)}>
      <Icon className={cn("size-4 shrink-0", a.iconCls)} aria-hidden />
      <span className="font-mono break-all">{finding.name}</span>
      <span className="font-medium text-muted-foreground">{a.label}</span>
      {finding.detail && <span className="sr-only">: {finding.detail}</span>}
    </span>
  );
}

/** A guardrail name as a plain chip (registry rows). */
export function GuardrailChip({ name }: { name: string }) {
  const code = /^[a-z][A-Za-z]+(\(.*\))?$/.test(name); // noFullSolutions, maxItems(8)
  return (
    <span className={cn("inline-flex min-h-7 items-start gap-1.5 rounded-md border bg-card px-2 py-1 text-sm text-foreground", code && "font-mono")}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
      {name}
    </span>
  );
}

/** The human checkpoint marker: agents propose, people decide. Coral edge and icon: the decision is yours. */
export function YouDecideChip({ kind, title }: { kind?: CheckpointKind; title?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span title={title} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-primary/45 bg-card px-2 text-sm font-semibold whitespace-nowrap text-foreground">
        <UserCheck className="size-4 shrink-0 text-primary" aria-hidden />
        You decide
      </span>
      {kind && <span className="text-sm font-medium text-foreground">{CHECKPOINT_LABELS[kind]}</span>}
    </span>
  );
}
