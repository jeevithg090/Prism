// Readiness (contract §5 / P2 Task 5): how much of a role's demand you already cover.
// Pure and isomorphic: the client uses it for summaries, the server for maps and roadmaps.
import type { BridgeNode, SkillId, SkillStatus } from "@/lib/types";

/** Coverage weight per status: proven 1.0, degree-done 0.7, degree-upcoming 0.4, gap 0. */
export const COVERAGE: Record<SkillStatus, number> = { proven: 1, "degree-done": 0.7, "degree-upcoming": 0.4, gap: 0 };

export const round2 = (x: number) => Math.round(x * 100) / 100;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Σ demand × coverage / Σ demand over role skills (demand > 0), unrounded. 0 when there are no role skills. */
export function readinessRaw(nodes: Pick<BridgeNode, "demand" | "status">[]): number {
  const role = nodes.filter((n) => n.demand > 0);
  const total = role.reduce((a, n) => a + n.demand, 0);
  if (!total) return 0;
  return role.reduce((a, n) => a + n.demand * (COVERAGE[n.status] ?? 0), 0) / total;
}

/** The contract readiness formula, rounded to 2 decimals. */
export function computeReadiness(nodes: Pick<BridgeNode, "demand" | "status">[]): number {
  return round2(readinessRaw(nodes));
}
/** P2's name for the same function. */
export const readiness = computeReadiness;

/** Planned skills count as proven and degree skills taught before the target date as degree-done. */
export function projectNodes<T extends Pick<BridgeNode, "skillId" | "status">>(nodes: T[], plannedSkillIds: SkillId[], upcomingByTarget: SkillId[]): T[] {
  const planned = new Set(plannedSkillIds);
  const upcoming = new Set(upcomingByTarget);
  return nodes.map((n) => {
    if (planned.has(n.skillId) && n.status !== "proven") return { ...n, status: "proven" as const };
    if (upcoming.has(n.skillId) && n.status === "degree-upcoming") return { ...n, status: "degree-done" as const };
    return n;
  });
}

export function projectedReadiness(nodes: BridgeNode[], plannedSkillIds: SkillId[], upcomingByTarget: SkillId[]): number {
  return computeReadiness(projectNodes(nodes, plannedSkillIds, upcomingByTarget));
}

/**
 * Moves a stored readiness by the formula's change between two node sets. Curated maps carry a readiness the
 * formula doesn't reproduce exactly (it was computed over the full role demand), so we shift it by the delta,
 * the same way the proof loop does. Rounded to 2 decimals and clamped to 0..1.
 */
export function shiftReadiness(stored: number, before: Pick<BridgeNode, "demand" | "status">[], after: Pick<BridgeNode, "demand" | "status">[]): number {
  return round2(clamp01(stored + readinessRaw(after) - readinessRaw(before)));
}
