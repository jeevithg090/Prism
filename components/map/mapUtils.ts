// Shared, pure helpers for the Bridge Map UI.
import { CheckCircle2, GraduationCap, Target, type LucideIcon } from "lucide-react";
import type { BridgeMap, BridgeNode, Receipt, SkillStatus } from "@/lib/types";
import { roleName } from "@/lib/graph/roles";

export const STATUS_ORDER: SkillStatus[] = ["proven", "degree-done", "degree-upcoming", "gap"];

export const STATUS_META: Record<SkillStatus, { label: string; long: string; icon: LucideIcon; dot: string; cssVar: string }> = {
  proven: { label: "Proven", long: "Proven by your work", icon: CheckCircle2, dot: "bg-status-proven", cssVar: "--status-proven" },
  "degree-done": { label: "In your degree", long: "Covered by your degree", icon: GraduationCap, dot: "bg-status-degree", cssVar: "--status-degree" },
  "degree-upcoming": { label: "Later in your degree", long: "Your degree covers it later", icon: GraduationCap, dot: "border-2 border-dashed border-status-degree bg-card", cssVar: "--status-degree" },
  gap: { label: "Gap", long: "A gap to close", icon: Target, dot: "bg-status-gap", cssVar: "--status-gap" },
};

export const pctOf = (x: number) => Math.round(x * 100);

export function statusCounts(nodes: BridgeNode[]): Record<SkillStatus, number> {
  const c: Record<SkillStatus, number> = { proven: 0, "degree-done": 0, "degree-upcoming": 0, gap: 0 };
  for (const n of nodes) c[n.status] += 1;
  return c;
}

export const byDemand = (a: BridgeNode, b: BridgeNode) => b.demand - a.demand || a.name.localeCompare(b.name);

export function topGap(nodes: BridgeNode[]): BridgeNode | undefined {
  return nodes.filter((n) => n.status === "gap" && n.demand > 0).sort(byDemand)[0];
}

/** One-sentence text summary of the graph (the chart's text alternative, DESIGN §10). */
export function mapSummary(map: Pick<BridgeMap, "nodes" | "roleId">, visible?: BridgeNode[]): string {
  const role = map.nodes.filter((n) => n.demand > 0);
  const c = statusCounts(role);
  const degree = c["degree-done"] + c["degree-upcoming"];
  const gap = topGap(map.nodes);
  const shown = visible && visible.length !== map.nodes.length ? ` Showing ${visible.length} of ${map.nodes.length} skills.` : "";
  return (
    `Of the ${role.length} skills ${roleName(map.roleId)} ads ask for, you've proven ${c.proven}, ` +
    `your degree covers ${degree} (${c["degree-done"]} already, ${c["degree-upcoming"]} later) and ${c.gap} ${c.gap === 1 ? "is a gap" : "are gaps"}.` +
    (gap ? ` Your biggest gap is ${gap.name}, in ${pctOf(gap.demand)}% of ads.` : "") + shown
  );
}

/** "Year 2 · Semester 2" reads as "Year 2, Semester 2" in a sentence. */
export const termText = (label: string) => label.replace(/\s*·\s*/g, ", ");

export function degreeText(n: BridgeNode): string {
  const codes = n.moduleCodes.join(", ");
  if (n.status === "degree-done") return codes ? `Covered in ${codes}` : "Covered by your degree";
  if (n.status === "degree-upcoming") return `${codes || "A later module"}${n.upcomingLabel ? ` in ${termText(n.upcomingLabel)}` : ""}`;
  if (codes) return `Also taught in ${codes}`;
  return "Not covered by your degree";
}

/** A receipt for any node (the map's Why?): the same numbers the roadmap uses. */
export function nodeReceipt(n: BridgeNode, roleId: string): Receipt {
  const demandPct = pctOf(n.demand);
  const role = roleName(roleId);
  const covered: Receipt["coveredByDegree"] = n.status === "degree-done" ? "done" : n.status === "degree-upcoming" ? "upcoming" : "no";
  const trendBit = n.trend === "rising" ? " (and rising)" : "";
  const reason =
    n.status === "proven"
      ? `${demandPct}% of ${role} ads ask for ${n.name}, and you've already proven it.`
      : covered === "done"
        ? `${demandPct}% of ${role} ads ask for ${n.name}${trendBit}, and your degree has covered it. A pod PR would turn it into proof.`
        : covered === "upcoming"
          ? `${demandPct}% of ${role} ads ask for ${n.name}${trendBit}. Your degree teaches it ${n.upcomingLabel ? `in ${n.upcomingLabel}` : "later"}, so you don't need to pay for a course.`
          : `${demandPct}% of ${role} ads ask for ${n.name}${trendBit}, and none of your modules teach it.`;
  const r: Receipt = { demandPct, coveredByDegree: covered, reason };
  if (n.trend) r.trend = n.trend;
  if (n.moduleCodes[0] && covered !== "no") r.moduleCode = n.moduleCodes[0];
  if (n.evidenceIds.length) r.evidenceIds = [...n.evidenceIds];
  return r;
}

/** The system's focus ring: a 2px coral outline, instant, never animated. */
export const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
