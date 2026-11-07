// Status / trend tag with the same icon + label language as StatusBadge, drawn the AA-safe way DESIGN.md §3 asks for
// on tints: text-foreground, with the status colour on the icon and border (status-coloured text on its own tint is < 4.5:1).
import { CheckCircle2, GraduationCap, Minus, Target, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { SkillStatus, TrendLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

const TAGS: Record<SkillStatus | TrendLabel, { icon: LucideIcon; label: string; box: string; ink: string }> = {
  proven: { icon: CheckCircle2, label: "Proven", box: "border-status-proven/40 bg-status-proven/10", ink: "text-status-proven" },
  "degree-done": { icon: GraduationCap, label: "Degree ✓", box: "border-status-degree/40 bg-status-degree/10", ink: "text-status-degree" },
  "degree-upcoming": { icon: GraduationCap, label: "Degree · later", box: "border-dashed border-status-degree/50 bg-card", ink: "text-status-degree" },
  gap: { icon: Target, label: "Gap", box: "border-status-gap/40 bg-status-gap/10", ink: "text-status-gap" },
  rising: { icon: TrendingUp, label: "Rising", box: "border-status-rising/40 bg-status-rising/10", ink: "text-status-rising" },
  stable: { icon: Minus, label: "Stable", box: "border-border bg-muted", ink: "text-muted-foreground" },
  declining: { icon: TrendingDown, label: "Cooling", box: "border-border bg-muted", ink: "text-muted-foreground" },
};

export function StatusTag({ status, className }: { status: SkillStatus | TrendLabel; className?: string }) {
  const t = TAGS[status];
  const Icon = t.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground", t.box, className)}>
      <Icon className={cn("size-3.5", t.ink)} aria-hidden />
      {t.label}
    </span>
  );
}
