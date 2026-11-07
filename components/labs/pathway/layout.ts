// Layered top-to-bottom layout for the mini path graph (pure, so it is unit-tested).
// Row 0: what you have and what your degree covers · then each learn step one row below its deepest prerequisite ·
// the opportunity last. Rows wrap at PER_ROW nodes so the graph stays narrow enough for a 375px phone region.
import type { OpportunityPath, PathStep } from "@/lib/labs/pathway/types";

export const NODE_W = 148;
export const NODE_H = 56;
export const GAP_X = 16;
export const GAP_Y = 40;
export const PAD = 8;
export const PER_ROW = 3;
export const GOAL_W = NODE_W * 2 + GAP_X;

export type GraphNodeKind = "have" | "degree" | "learn" | "ghost" | "goal";
export interface GraphNode { id: string; kind: GraphNodeKind; x: number; y: number; w: number; h: number; step?: PathStep; ghostOf?: string; extraHours?: number }
export interface GraphEdge { from: string; to: string; kind: "prereq" | "requires" | "alternative"; d: string }
export interface GraphLayout { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 4}`;
};

/**
 * Skills you already have are drawn only when a step builds on them (or when there is nothing to learn); the rest are
 * counted on the goal node (`alsoHave`), so no long edge runs behind the path.
 */
export function graphSteps(path: OpportunityPath): { steps: PathStep[]; alsoHave: PathStep[] } {
  const learn = path.steps.filter((s) => s.mode === "learn");
  if (!learn.length) return { steps: path.steps, alsoHave: [] };
  const used = new Set(learn.flatMap((s) => s.prereqs));
  const steps = path.steps.filter((s) => s.mode !== "have" || used.has(s.skillId));
  const alsoHave = path.steps.filter((s) => s.mode === "have" && !used.has(s.skillId));
  return { steps, alsoHave };
}

export function layoutPath(path: OpportunityPath): GraphLayout & { alsoHave: PathStep[] } {
  const { steps, alsoHave } = graphSteps(path);
  const byId = new Map(steps.map((s) => [s.skillId, s]));
  const level = new Map<string, number>();
  const levelOf = (id: string, seen = new Set<string>()): number => {
    const hit = level.get(id);
    if (hit !== undefined) return hit;
    const s = byId.get(id);
    if (!s || s.mode !== "learn" || seen.has(id)) return 0;
    seen.add(id);
    const l = 1 + Math.max(0, ...s.prereqs.map((p) => levelOf(p, seen)));
    level.set(id, l);
    return l;
  };
  for (const s of steps) level.set(s.skillId, s.mode === "learn" ? levelOf(s.skillId) : 0);

  type Item = { id: string; kind: GraphNodeKind; step?: PathStep; ghostOf?: string; extraHours?: number };
  const levels = new Map<number, Item[]>();
  const push = (l: number, it: Item) => levels.set(l, [...(levels.get(l) ?? []), it]);
  for (const s of steps) push(level.get(s.skillId) ?? 0, { id: s.skillId, kind: s.mode, step: s });
  for (const a of path.alternatives) {
    if (byId.has(a.instead)) continue;
    push(level.get(a.chosen) ?? 1, { id: a.instead, kind: "ghost", ghostOf: a.chosen, extraHours: a.extraHours });
  }
  const maxLevel = Math.max(0, ...levels.keys());

  // Rows: each level split into chunks of PER_ROW.
  const rows: Item[][] = [];
  for (let l = 0; l <= maxLevel; l++) {
    const items = levels.get(l) ?? [];
    for (let k = 0; k < items.length; k += PER_ROW) rows.push(items.slice(k, k + PER_ROW));
  }
  const width = Math.max(GOAL_W, PER_ROW * NODE_W + (PER_ROW - 1) * GAP_X) + PAD * 2;
  const nodes: GraphNode[] = [];
  rows.forEach((row, r) => {
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
    const x0 = (width - rowW) / 2;
    row.forEach((it, k) => nodes.push({ ...it, x: x0 + k * (NODE_W + GAP_X), y: PAD + r * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H }));
  });
  const goalY = PAD + rows.length * (NODE_H + GAP_Y);
  nodes.push({ id: "goal", kind: "goal", x: (width - GOAL_W) / 2, y: goalY, w: GOAL_W, h: NODE_H + 8 });
  const height = goalY + NODE_H + 8 + PAD;

  const at = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  for (const e of path.edges) {
    const a = at.get(e.source);
    const b = at.get(e.target === "goal" ? "goal" : e.target);
    if (!a || !b || a === b) continue;
    // Spread arrows into the goal across its width so they don't pile on one point.
    const tx = b.kind === "goal" ? Math.min(b.x + b.w - 12, Math.max(b.x + 12, a.x + a.w / 2)) : b.x + b.w / 2;
    edges.push({ from: a.id, to: b.id, kind: e.kind, d: curve(a.x + a.w / 2, a.y + a.h, tx, b.y) });
  }
  return { nodes, edges, width, height, alsoHave };
}
