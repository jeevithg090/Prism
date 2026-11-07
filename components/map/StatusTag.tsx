// The shared StatusBadge with AA text: the label in ink, the icon keeps its status colour (DESIGN §3:
// status colours as text on their own tint fall below 4.5:1). Wraps the shared component instead of forking it.
import type { SkillStatus, TrendLabel } from "@/lib/types";
import { StatusBadge } from "@/components/keystone";
import { cn } from "@/lib/utils";

const ICON: Record<SkillStatus | TrendLabel, string> = {
  proven: "[&_svg]:text-status-proven", "degree-done": "[&_svg]:text-status-degree", "degree-upcoming": "[&_svg]:text-status-degree",
  gap: "[&_svg]:text-status-gap", rising: "[&_svg]:text-status-rising", stable: "", declining: "",
};

export function StatusTag({ status, className }: { status: SkillStatus | TrendLabel; className?: string }) {
  return (
    <span className={cn("inline-flex [&>span]:text-foreground", ICON[status], className)}>
      <StatusBadge status={status} />
    </span>
  );
}
