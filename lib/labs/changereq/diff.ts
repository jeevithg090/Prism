// Plan-as-code: the diff engine behind a change request. Pure and deterministic (no store, no clock, no LLM).
//  1. score every candidate skill before and after the refresh with the Roadmap Agent's priority formula
//  2. walk the editable weeks in order; a week changes only when another skill now beats it by the churn
//     threshold AND did not before the refresh (so a hunk is always caused by the market move, never by noise)
//  3. check the result like CI: hours, started weeks, prerequisites, pod issues, readiness, forecast confidence
//  4. apply: a new roadmap version with rebuilt weeks and fresh receipts
import { hoursSplit, proofFor, repoLabel, SKILL_TASKS } from "@/lib/agents/roadmap";
import { COVERED_LATER_FACTOR, DECLINING_FACTOR } from "@/lib/graph/plan";
import { projectNodes, shiftReadiness } from "@/lib/graph/readiness";
import { roleName } from "@/lib/graph/roles";
import type { BridgeEdge, BridgeNode, Pod, Receipt, RoadmapTask, RoadmapWeek, Roadmap, RoleDemand, SkillId, TrendLabel, TrendSeries } from "@/lib/types";
import type { Check, Hunk, Signal } from "./types";

/** A swap must beat the week it replaces by 15%, so the plan does not churn on small moves. */
export const CHURN_THRESHOLD = 0.15;
export const MAX_HUNKS = 3;
const DAY = 86_400_000;

export interface Signals {
  demand: Map<SkillId, number>;
  trend: Map<SkillId, { growth: number; label: TrendLabel; band?: number }>;
}

export function signalsFrom(market: RoleDemand | null | undefined, trends: TrendSeries[] | null | undefined): Signals {
  const demand = new Map((market?.skills ?? []).map((s) => [s.skillId, s.share]));
  const trend = new Map(
    (trends ?? []).map((t) => {
      const p = t.projection.at(-1);
      const band = p && p.share > 0 ? (p.high - p.low) / p.share : undefined;
      return [t.skillId, { growth: t.growthPerYear, label: t.label, ...(band !== undefined ? { band } : {}) }];
    }),
  );
  return { demand, trend };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (x: number) => Math.round(x * 100);
const signed = (g: number) => `${g >= 0 ? "+" : "−"}${Math.abs(pct(g))}%/yr`;

/** The Roadmap Agent's priority: demand × (1 + rising growth) × 0.3 if the degree covers it later × 0.5 if cooling. */
export function priorityOf(node: Pick<BridgeNode, "skillId" | "demand" | "status" | "trend">, s: Signals): number {
  const demand = s.demand.get(node.skillId) ?? node.demand;
  const t = s.trend.get(node.skillId);
  const growth = t?.growth ?? 0;
  const label = t?.label ?? node.trend;
  return demand * (1 + Math.max(growth, 0)) * (node.status === "degree-upcoming" ? COVERED_LATER_FACTOR : 1) * (label === "declining" ? DECLINING_FACTOR : 1);
}

export function signalOf(node: BridgeNode, s: Signals): Signal {
  const t = s.trend.get(node.skillId);
  return {
    skillId: node.skillId, name: node.name,
    demandPct: pct(s.demand.get(node.skillId) ?? node.demand),
    ...(t ? { growthPerYear: t.growth, label: t.label } : node.trend ? { label: node.trend } : {}),
    priority: r3(priorityOf(node, s)),
  };
}

/** Weeks that never change: anything you've ticked, and any week starting within 7 days of now. */
export function lockedWeeks(roadmap: Roadmap, now: Date): Set<number> {
  const out = new Set<number>();
  for (const w of roadmap.weeks) {
    const starts = new Date(`${w.startDate.slice(0, 10)}T00:00:00Z`).getTime();
    if (starts < now.getTime() + 7 * DAY || w.tasks.some((t) => t.done)) out.add(w.week);
  }
  return out;
}

/** Skills that could fill a week: role skills you haven't proven, not taught before your target date, not professional. */
export function candidatePool(nodes: BridgeNode[], roadmap: Roadmap): BridgeNode[] {
  const skipped = new Set(roadmap.skipped.map((s) => s.skillId));
  return nodes.filter((n) => n.demand > 0 && n.category !== "professional" && (n.status === "gap" || n.status === "degree-upcoming") && !skipped.has(n.skillId));
}

export interface ProposeInput {
  roadmap: Roadmap;
  nodes: BridgeNode[];
  before: Signals;
  after: Signals;
  now: Date;
  roleLabel?: string;
}

function receiptLine(h: Omit<Hunk, "receipt" | "id">, role: string): string {
  const a = h.incoming.after, b = h.incoming.before, out = h.outgoing.after, outB = h.outgoing.before;
  const move2 = (x?: number, y?: number) => (x === undefined || y === undefined ? "" : pct(x) === pct(y) ? `, forecast steady at ${signed(y)}` : `, forecast ${signed(x)} → ${signed(y)}`);
  const growth = move2(b.growthPerYear, a.growthPerYear);
  const outGrowth = move2(outB.growthPerYear, out.growthPerYear);
  const incoming = `${a.name} is now in ${a.demandPct}% of ${role} ads (was ${b.demandPct}%)${growth}`;
  const outgoing = `${out.name} ${out.demandPct === outB.demandPct ? `stays at ${out.demandPct}%` : `moved ${outB.demandPct}% → ${out.demandPct}%`}${outGrowth}`;
  const move = h.kind === "reorder" ? `so it moves up ${h.weeksSooner} ${h.weeksSooner === 1 ? "week" : "weeks"} and ${out.name} takes week ${h.otherWeek}` : `so it takes week ${h.week} and ${out.name} leaves your 12 weeks`;
  return `${incoming}; ${outgoing}, ${move}.`;
}

/** The hunks of a change request: at most MAX_HUNKS, each week changed at most once, each caused by the refresh. */
export function proposeHunks(i: ProposeInput): Hunk[] {
  const role = i.roleLabel ?? roleName(i.roadmap.roleId);
  const byId = new Map(i.nodes.map((n) => [n.skillId, n]));
  const locked = lockedWeeks(i.roadmap, i.now);
  const focus = new Map(i.roadmap.weeks.map((w) => [w.week, w.focusSkillId]));
  const touched = new Set<number>();
  const pool = candidatePool(i.nodes, i.roadmap);
  const hunks: Hunk[] = [];
  const pB = (n: BridgeNode) => priorityOf(n, i.before);
  const pA = (n: BridgeNode) => priorityOf(n, i.after);

  for (const w of i.roadmap.weeks) {
    if (hunks.length >= MAX_HUNKS) break;
    if (locked.has(w.week) || touched.has(w.week)) continue;
    const cur = byId.get(focus.get(w.week)!);
    if (!cur) continue;
    const planned = new Set(focus.values());
    type Cand = { node: BridgeNode; from?: number };
    const cands: Cand[] = [];
    for (const w2 of i.roadmap.weeks) {
      if (w2.week <= w.week || locked.has(w2.week) || touched.has(w2.week)) continue;
      const n = byId.get(focus.get(w2.week)!);
      if (n && n.skillId !== cur.skillId && !cands.some((c) => c.node.skillId === n.skillId)) cands.push({ node: n, from: w2.week });
    }
    for (const n of pool) if (!planned.has(n.skillId)) cands.push({ node: n });
    const flipped = cands
      .filter((c) => pA(c.node) > pA(cur) * (1 + CHURN_THRESHOLD) && !(pB(c.node) > pB(cur) * (1 + CHURN_THRESHOLD)))
      .sort((a, b) => pA(b.node) - pA(a.node) || a.node.skillId.localeCompare(b.node.skillId));
    const pick = flipped[0];
    if (!pick) continue;
    const base = {
      kind: pick.from ? ("reorder" as const) : ("swap-in" as const),
      week: w.week, startDate: w.startDate,
      ...(pick.from ? { otherWeek: pick.from, weeksSooner: pick.from - w.week } : {}),
      outgoing: { before: signalOf(cur, i.before), after: signalOf(cur, i.after) },
      incoming: { before: signalOf(pick.node, i.before), after: signalOf(pick.node, i.after) },
    };
    hunks.push({ id: `h${hunks.length + 1}`, ...base, receipt: receiptLine(base, role) });
    focus.set(w.week, pick.node.skillId);
    touched.add(w.week);
    if (pick.from) {
      focus.set(pick.from, cur.skillId);
      touched.add(pick.from);
    }
  }
  return hunks;
}

/** The focus skill of every week after the hunks are applied. */
export function focusAfter(roadmap: Roadmap, hunks: Hunk[]): Map<number, SkillId> {
  const focus = new Map(roadmap.weeks.map((w) => [w.week, w.focusSkillId]));
  for (const h of hunks) {
    const incoming = h.incoming.after.skillId, outgoing = h.outgoing.after.skillId;
    focus.set(h.week, incoming);
    if (h.kind === "reorder" && h.otherWeek) focus.set(h.otherWeek, outgoing);
  }
  return focus;
}

/** Projected readiness at the end of the plan (stored value shifted by the formula delta, new market weights). */
export function readinessFor(roadmap: Roadmap, nodes: BridgeNode[], after: Signals, hunks: Hunk[]): { before: number; after: number } {
  const weighted = nodes.map((n) => ({ ...n, demand: after.demand.get(n.skillId) ?? n.demand }));
  const upcoming = roadmap.skipped.map((s) => s.skillId);
  const plannedBefore = [...new Set(roadmap.weeks.map((w) => w.focusSkillId))];
  const plannedAfter = [...new Set(focusAfter(roadmap, hunks).values())];
  const b = projectNodes(weighted, plannedBefore, upcoming);
  const a = projectNodes(weighted, plannedAfter, upcoming);
  return { before: roadmap.readinessProjected, after: shiftReadiness(roadmap.readinessProjected, b, a) };
}

export interface CheckInput {
  roadmap: Roadmap;
  next: Roadmap;
  hunks: Hunk[];
  nodes: BridgeNode[];
  edges: BridgeEdge[];
  pod?: Pod | null;
  locked: Set<number>;
  after: Signals;
  readiness: { before: number; after: number };
}

const hoursOf = (r: Roadmap) => r.weeks.reduce((s, w) => s + w.tasks.reduce((a, t) => a + t.hours, 0), 0);
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** CI-style checks on the proposed roadmap. Every check reports real numbers from the two versions. */
export function runChecks(i: CheckInput): Check[] {
  const checks: Check[] = [];
  const hb = hoursOf(i.roadmap), ha = hoursOf(i.next);
  checks.push({ id: "hours", label: "Your weekly hours stay the same", status: hb === ha ? "pass" : "fail", detail: `${ha} hours across ${i.next.weeks.length} weeks (was ${hb}).` });

  const changedLocked = i.roadmap.weeks.filter((w) => i.locked.has(w.week) && i.next.weeks.find((x) => x.week === w.week)?.focusSkillId !== w.focusSkillId);
  const lockedList = [...i.locked].sort((a, b) => a - b);
  checks.push({
    id: "locked", label: "Weeks you've started stay put",
    status: changedLocked.length ? "fail" : "pass",
    detail: changedLocked.length ? `Week ${changedLocked.map((w) => w.week).join(", ")} would change.` : lockedList.length ? `Week ${list(lockedList.map(String))} ${lockedList.length === 1 ? "is" : "are"} locked and unchanged.` : "No week has started yet.",
  });

  const byId = new Map(i.nodes.map((n) => [n.skillId, n]));
  const weekOf = new Map<SkillId, number>();
  for (const w of i.next.weeks) if (!weekOf.has(w.focusSkillId)) weekOf.set(w.focusSkillId, w.week);
  const late: string[] = [];
  for (const h of i.hunks) {
    for (const skill of [h.incoming.after.skillId, h.outgoing.after.skillId]) {
      const at = weekOf.get(skill);
      if (!at) continue;
      for (const e of i.edges) {
        if (e.kind !== "prereq" || e.to !== skill) continue;
        const pre = byId.get(e.from);
        if (!pre || pre.status === "proven" || pre.status === "degree-done") continue;
        const preAt = weekOf.get(e.from);
        if (preAt && preAt >= at) late.push(`${pre.name} (week ${preAt}) comes after ${byId.get(skill)?.name ?? skill} (week ${at})`);
      }
    }
  }
  checks.push({ id: "prereqs", label: "Prerequisites come first", status: late.length ? "warn" : "pass", detail: late.length ? `${late.join("; ")}.` : "Every moved skill's prerequisites are proven, taught by your degree or planned earlier." });

  const userIssues = (i.pod?.project?.issues ?? []).filter((iss) => iss.assigneeUserId === i.roadmap.userId);
  const moved = new Set(i.hunks.flatMap((h) => [h.outgoing.after.skillId, h.incoming.after.skillId]));
  const hit = userIssues.filter((iss) => moved.has(iss.skillId));
  checks.push({
    id: "pod", label: "Your pod issues still line up",
    status: hit.length ? "warn" : "pass",
    detail: hit.length ? `Your pod issue "${hit[0].title}" is tied to a week that moves; tell your pod before you approve.` : `None of your ${userIssues.length} pod ${userIssues.length === 1 ? "issue is" : "issues are"} on a week that moves.`,
  });

  const drop = i.readiness.after < i.readiness.before;
  checks.push({
    id: "readiness", label: "Projected readiness doesn't drop",
    status: drop ? "fail" : "pass",
    detail: `${pct(i.readiness.before)}% → ${pct(i.readiness.after)}% by the end of your plan.`,
  });

  const wide = i.hunks.filter((h) => (i.after.trend.get(h.incoming.after.skillId)?.band ?? 0) > 1);
  checks.push({
    id: "confidence", label: "The forecast is confident enough",
    status: wide.length ? "warn" : "pass",
    detail: wide.length
      ? `${list(wide.map((h) => h.incoming.after.name))}: the 95% band is wider than the forecast itself, so treat the trend as a hint.`
      : "Every incoming skill's 95% forecast band is narrower than the forecast.",
  });
  return checks;
}

export function riskOf(checks: Check[]): "low" | "medium" | "high" {
  if (checks.some((c) => c.status === "fail")) return "high";
  const warns = checks.filter((c) => c.status === "warn").length;
  return warns ? "medium" : "low";
}

// ---------- apply ----------

function renumber(tasks: RoadmapTask[], week: number): RoadmapTask[] {
  return tasks.map((t, idx) => ({ ...t, id: `t_${week}_${idx + 1}`, done: false }));
}

/** Template tasks for a skill with the week's hours (same split rules as the Roadmap Agent). */
export function templateTasks(node: Pick<BridgeNode, "skillId" | "name">, week: number, hours: number, theoryPractice: number, repo: string): RoadmapTask[] {
  const tpl = SKILL_TASKS[node.skillId];
  const { learn, build } = hoursSplit(hours, theoryPractice);
  const fill = (s: string) => s.replaceAll("{repo}", repo).replaceAll("{name}", node.name);
  const out: Omit<RoadmapTask, "id">[] = [];
  if (learn > 0) out.push({ type: "learn", title: tpl?.learn ?? `Read the official ${node.name} getting-started guide`, ...(tpl?.url ? { resourceUrl: tpl.url } : {}), free: true, hours: learn });
  if (build >= 3) {
    const practice = Math.max(1, Math.round(build / 3));
    out.push({ type: "practice", title: tpl?.practice ?? `Practise ${node.name} on a small exercise`, free: true, hours: practice });
    out.push({ type: "build", title: fill(tpl?.build ?? `Use ${node.name} in a small PR to {repo}`), free: true, hours: build - practice });
  } else if (build > 0) {
    out.push({ type: "build", title: fill(tpl?.build ?? `Use ${node.name} in a small PR to {repo}`), free: true, hours: build });
  }
  return out.map((t, idx) => ({ ...t, id: `t_${week}_${idx + 1}` }));
}

function receiptFrom(sig: Signal, node: BridgeNode | undefined, old: Receipt | undefined, role: string, why: string): Receipt {
  const r: Receipt = {
    demandPct: sig.demandPct,
    coveredByDegree: node?.status === "degree-upcoming" ? "upcoming" : "no",
    reason: `${sig.demandPct}% of ${role} ads ask for ${sig.name}${sig.growthPerYear !== undefined && sig.growthPerYear > 0 ? ` (up ${pct(sig.growthPerYear)}% a year)` : ""}. ${why}`,
  };
  if (sig.label) r.trend = sig.label;
  if (sig.growthPerYear !== undefined) r.growthPerYear = sig.growthPerYear;
  if (old?.moduleCode && node?.status === "degree-upcoming") r.moduleCode = old.moduleCode;
  if (node?.evidenceIds?.length) r.evidenceIds = [...node.evidenceIds];
  return r;
}

export interface ApplyInput {
  roadmap: Roadmap;
  hunks: Hunk[];
  nodes: BridgeNode[];
  pod?: Pod | null;
  theoryPractice?: number;
  changeRequestNumber: number;
  now: Date;
  readinessAfter: number;
}

/** The merged roadmap: version + 1, hunk weeks rebuilt (hours kept per week), every other week untouched. */
export function applyHunks(i: ApplyInput): Roadmap {
  const role = roleName(i.roadmap.roleId);
  const byId = new Map(i.nodes.map((n) => [n.skillId, n]));
  const oldByWeek = new Map(i.roadmap.weeks.map((w) => [w.week, w]));
  const oldBySkill = new Map<SkillId, RoadmapWeek>();
  for (const w of i.roadmap.weeks) if (!oldBySkill.has(w.focusSkillId)) oldBySkill.set(w.focusSkillId, w);
  const sigs = new Map<SkillId, Signal>();
  for (const h of i.hunks) { sigs.set(h.incoming.after.skillId, h.incoming.after); sigs.set(h.outgoing.after.skillId, h.outgoing.after); }
  const focus = focusAfter(i.roadmap, i.hunks);
  const changed = new Set(i.hunks.flatMap((h) => [h.week, ...(h.otherWeek ? [h.otherWeek] : [])]));
  const repo = repoLabel(i.pod);

  const weeks = i.roadmap.weeks.map((w): RoadmapWeek => {
    if (!changed.has(w.week)) return w;
    const skill = focus.get(w.week)!;
    const node = byId.get(skill);
    const hours = w.tasks.reduce((s, t) => s + t.hours, 0);
    const source = oldBySkill.get(skill);
    const sourceHours = source ? source.tasks.reduce((s, t) => s + t.hours, 0) : -1;
    const tasks = source && sourceHours === hours
      ? renumber(source.tasks, w.week)
      : templateTasks({ skillId: skill, name: node?.name ?? skill }, w.week, hours, i.theoryPractice ?? 50, repo);
    const sig = sigs.get(skill) ?? (node ? { skillId: skill, name: node.name, demandPct: pct(node.demand), priority: 0 } : undefined);
    const from = oldByWeek.get(w.week);
    const why = from && from.focusSkillId !== skill
      ? `Change request #${i.changeRequestNumber} moved it to week ${w.week} after this week's market refresh.`
      : "Unchanged focus.";
    const week: RoadmapWeek = {
      week: w.week, startDate: w.startDate, focusSkillId: skill, isExamWeek: w.isExamWeek, tasks,
      proof: source?.proof ?? proofFor({ skillId: skill, name: node?.name ?? skill, category: node?.category ?? "practice" }, i.pod),
      receipt: sig ? receiptFrom(sig, node, source?.receipt, role, why) : (source?.receipt ?? w.receipt),
    };
    if (source?.degreeLink) week.degreeLink = source.degreeLink;
    return week;
  });
  return {
    ...i.roadmap,
    version: i.roadmap.version + 1,
    readinessProjected: i.readinessAfter,
    weeks,
    generatedAt: i.now.toISOString(),
  };
}

/** "Pull LLM evaluation forward to week 7" / "Swap week 8: Kubernetes → Vector databases". */
export function titleFor(hunks: Hunk[]): string {
  if (!hunks.length) return "No changes this week";
  const h = hunks[0];
  const first = h.kind === "reorder" ? `Move ${h.incoming.after.name} up to week ${h.week}` : `Swap week ${h.week}: ${h.outgoing.after.name} → ${h.incoming.after.name}`;
  return hunks.length === 1 ? first : `${first} and ${hunks.length - 1} more ${hunks.length === 2 ? "change" : "changes"}`;
}
