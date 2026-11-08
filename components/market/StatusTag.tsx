// Status / trend tag for Industry Radar: the shared <StatusBadge> (colour + icon + label, label in ink so it keeps 4.5:1),
// so the market screen speaks the same status words as every other screen.
import { StatusBadge } from "@/components/keystone";
import type { SkillStatus, TrendLabel } from "@/lib/types";

export function StatusTag({ status, className }: { status: SkillStatus | TrendLabel; className?: string }) {
  const badge = <StatusBadge status={status} size="sm" />;
  return className ? <span className={className}>{badge}</span> : badge;
}
