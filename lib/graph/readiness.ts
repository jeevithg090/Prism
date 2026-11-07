import type { BridgeNode, SkillId } from "@/lib/types";

const coverage = { proven: 1, "degree-done": 0.7, "degree-upcoming": 0.4, gap: 0 } as const;

export function readiness(nodes: BridgeNode[]): number {
  const roleNodes = nodes.filter((node) => node.demand > 0);
  const total = roleNodes.reduce((sum, node) => sum + node.demand, 0);
  if (!total) return 0;
  const score = roleNodes.reduce((sum, node) => sum + node.demand * coverage[node.status], 0) / total;
  return Math.round(score * 100) / 100;
}

export function projectedReadiness(nodes: BridgeNode[], plannedSkillIds: SkillId[], upcomingByTarget: SkillId[]): number {
  const planned = new Set(plannedSkillIds);
  const upcoming = new Set(upcomingByTarget);
  return readiness(nodes.map((node) => ({
    ...node,
    status: planned.has(node.skillId) ? "proven" : upcoming.has(node.skillId) ? "degree-done" : node.status,
  })));
}
