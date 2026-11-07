"use client";
// Small status pieces for /governance. Never colour alone: every pill pairs colour + icon + text.
import { CheckCircle2, LifeBuoy, ShieldAlert, ShieldCheck, ShieldX, UserCheck, XCircle, type LucideIcon } from "lucide-react";
import type { CheckpointKind, GuardrailFinding, RunStatus } from "@/lib/agents/harness";
import { CHECKPOINT_LABELS } from "@/lib/agents/registry";
import { cn } from "@/lib/utils";

const STATUS: Record<RunStatus, { icon: LucideIcon; label: string; cls: string }> = {
  ok: { icon: CheckCircle2, label: "OK", cls: "text-status-proven bg-status-proven/10 border-status-proven/20" },
  fallback: { icon: LifeBuoy, label: "Fallback", cls: "text-status-rising bg-status-rising/10 border-status-rising/20" },
  error: { icon: XCircle, label: "Error", cls: "text-status-gap bg-status-gap/10 border-status-gap/20" },
};

export function StatusPill({ status, title }: { status: RunStatus; title?: string }) {
  const s = STATUS[status] ?? STATUS.error;
  const Icon = s.icon;
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", s.cls)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

const ACTION: Record<GuardrailFinding["action"], { icon: LucideIcon; label: string; cls: string }> = {
  pass: { icon: ShieldCheck, label: "passed", cls: "text-muted-foreground bg-muted border-border" },
  modified: { icon: ShieldAlert, label: "modified", cls: "text-status-rising bg-status-rising/10 border-status-rising/20" },
  blocked: { icon: ShieldX, label: "blocked", cls: "text-status-gap bg-status-gap/10 border-status-gap/20" },
};

/** "noFullSolutions · modified" (detail in the tooltip and for screen readers). */
export function GuardrailActionChip({ finding }: { finding: GuardrailFinding }) {
  const a = ACTION[finding.action] ?? ACTION.pass;
  const Icon = a.icon;
  return (
    <span title={finding.detail} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[13px] whitespace-nowrap", a.cls)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {finding.name}
      <span className="font-sans">· {a.label}</span>
      {finding.detail && <span className="sr-only">: {finding.detail}</span>}
    </span>
  );
}

/** A guardrail name as a plain chip (registry cards). */
export function GuardrailChip({ name }: { name: string }) {
  const code = /^[a-z][A-Za-z]+(\(.*\))?$/.test(name); // noFullSolutions, maxItems(8)
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-[13px]", code && "font-mono")}>
      <ShieldCheck className="size-3.5 shrink-0 text-status-proven" aria-hidden />
      {name}
    </span>
  );
}

/** The human checkpoint marker: agents propose, people decide. */
export function YouDecideChip({ kind, title }: { kind?: CheckpointKind; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">
      <UserCheck className="size-3.5" aria-hidden />
      You decide
      {kind && <span className="font-normal">· {CHECKPOINT_LABELS[kind]}</span>}
    </span>
  );
}
