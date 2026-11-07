// What-if Simulator engine: counterfactual futures for a student's plan, computed from the parts of Keystone that
// already decide the plan, not from a new model:
//  - readiness = the Bridge Map formula (lib/graph/readiness), anchored on the stored readiness like the proof loop
//  - the queue = the Roadmap Agent's focus skills in order (store "roadmaps", else planRoadmap)
//  - prerequisite edges + the planner's 0.6 rule, exam weeks at half hours, degree modules done at term end
//  - demand moves with the Trend Forecaster's projection, sampled inside its 95% prediction band
// Monte Carlo with a seeded PRNG and common random numbers: both plans see the same 200 futures, so "A beats B in
// 7 of 10 futures" is a paired comparison. Pure and deterministic: same inputs, same answer.
import assumptionsJson from "@/data/fixtures/labs/whatif.json";
import { planRoadmap, PREREQ_NOT_READY, teachingModule } from "@/lib/graph/plan";
import { clamp01, COVERAGE, readinessRaw, round2 } from "@/lib/graph/readiness";
import { addDays, isExamWeek, isoDate, nextMonday, parseUpcomingLabel, termEnd, type TermRef } from "@/lib/graph/terms";
import type { BridgeEdge, BridgeNode, Programme, Roadmap, SkillId, TrendSeries } from "@/lib/types";

// ---------- assumptions ----------

export interface AssumptionNote { id: string; label: string; text: string; source: string }
export interface Assumptions {
  runs: number;
  confidence: number;
  seed: string;
  demoNow: string;
  maxHoursPerWeek: number;
  followThrough: [number, number];
  effortSpread: [number, number];
  defaultEffortHours: number;
  effortHours: Record<string, number>;
  placement: { startMonthDay: string; weeks: number; learningHoursPerWeek: number };
  notes: AssumptionNote[];
}
export const ASSUMPTIONS = assumptionsJson as unknown as Assumptions;

export const WEEK_MS = 7 * 86_400_000;
export const MAX_WEEKS = 104;
const EPS = 0.005;
const Z95 = 1.96;

// ---------- the plan a student tries ----------

export interface PlanSpec {
  id: "a" | "b";
  label: string;
  hoursPerWeek: number;
  /** Learn this skill first (one of the roadmap's focus skills); null keeps the Roadmap Agent's order. */
  firstSkillId: SkillId | null;
  /** Study hours a part-time job costs you each week (0 = no job). Paused during a placement. */
  jobHoursLost: number;
  placement: boolean;
}

export interface SimContext {
  userId: string;
  roleId: string;
  now: Date;
  startedAt: string;
  targetDate: string;
  /** The stored readiness the map shows today; the simulation moves it by the formula's change. */
  readinessNow: number;
  nodes: BridgeNode[];
  edges: BridgeEdge[];
  /** Focus skills in the Roadmap Agent's order, open ones only. */
  queue: SkillId[];
  trends: TrendSeries[];
  programme?: Programme | null;
  assumptions?: Assumptions;
}

// ---------- results ----------

export interface BandPoint { week: number; date: string; p10: number; p50: number; p90: number }
export interface Milestone { skillId: SkillId; name: string; date: string | null; doneShare: number; slowStart: boolean }
export interface PlanResult {
  id: PlanSpec["id"];
  label: string;
  spec: PlanSpec;
  series: BandPoint[];
  final: { p10: number; p50: number; p90: number };
  milestones: Milestone[];
  firstProofDate: string | null;
  /** Share of futures where every queued skill is proven by the target date. */
  allDoneShare: number;
  allDoneDate: string | null;
  plannedHours: number;
  /** Smallest hours a week (same settings) that finishes every queued skill in ≥ confidence of futures. */
  hoursNeeded: number | null;
  notes: string[];
}
export interface Comparison {
  aFinalWins: number;
  bFinalWins: number;
  aLeads: number;
  bLeads: number;
  firstProofGapWeeks: number;
  verdict: string;
}
export interface SimulationResult {
  userId: string;
  roleId: string;
  startDate: string;
  targetDate: string;
  weeks: number;
  runs: number;
  confidence: number;
  readinessNow: number;
  queue: { skillId: SkillId; name: string }[];
  baseline: { week: number; date: string; p50: number }[];
  plans: PlanResult[];
  comparison: Comparison | null;
  generatedAt: string;
}

// ---------- small pure helpers ----------

/** FNV-1a: a stable 32-bit seed from a string. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny, fast, seeded PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (y: number) => 1 / (1 + Math.exp(-y));
const clampShare = (p: number) => Math.min(1 - 1e-4, Math.max(1e-4, p));

/** Linear-interpolated quantile of a sorted array. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return 0;
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);

export const effortFor = (skillId: SkillId, a: Assumptions = ASSUMPTIONS) => a.effortHours[skillId] ?? a.defaultEffortHours;

const labelOf = (nodes: BridgeNode[], id: SkillId) => nodes.find((n) => n.skillId === id)?.name ?? id;

/** Moves `first` to the front of the queue (no-op when it isn't queued). */
export function orderQueue(queue: SkillId[], first: SkillId | null | undefined): SkillId[] {
  if (!first || !queue.includes(first)) return [...queue];
  return [first, ...queue.filter((id) => id !== first)];
}

/**
 * The skills a plan works through, in the Roadmap Agent's order: the student's stored roadmap focus skills when
 * there is one (that's the plan they're actually on), else the planner's ranking. Proven and degree-done skills drop out.
 */
export function planQueue(i: {
  nodes: BridgeNode[]; edges: BridgeEdge[]; startedAt: string; targetDate: string; now: Date;
  programme?: Programme | null; trends?: TrendSeries[] | null; roadmap?: Roadmap | null;
}): SkillId[] {
  const byId = new Map(i.nodes.map((n) => [n.skillId, n]));
  const open = (id: SkillId) => {
    const n = byId.get(id);
    return !!n && n.status !== "proven" && n.status !== "degree-done";
  };
  const fromRoadmap = [...new Set((i.roadmap?.weeks ?? []).map((w) => w.focusSkillId))].filter(open);
  if (fromRoadmap.length) return fromRoadmap;
  return planRoadmap({ nodes: i.nodes, edges: i.edges, startedAt: i.startedAt, targetDate: i.targetDate, programme: i.programme, trends: i.trends, now: i.now })
    .planned.filter(open);
}

// ---------- the prepared world (shared by every plan and every future) ----------

interface World {
  ctx: SimContext;
  a: Assumptions;
  nWeeks: number;
  dates: Date[];
  exam: boolean[];
  placementWeeks: boolean[];
  placementEnd: number; // last placement week index, -1 if no placement fits
  nodes: BridgeNode[];
  /** Week index from which a degree-upcoming node counts as degree-done (Infinity = not before the target). */
  degreeWeek: number[];
  prereqs: Map<SkillId, SkillId[]>;
  nodeIndex: Map<SkillId, number>;
  /** Per node: demand ratio parameters per week (null = demand stays as today). */
  trend: ({ mid: Float64Array; se: Float64Array; shareNow: number } | null)[];
  raw0: number;
  runs: number;
  // paired random draws
  z: Float64Array[]; // [run][node]
  effortMult: Float64Array[]; // [run][node]
  pace: Float64Array[]; // [run][week]
}

function placementWindow(target: Date, a: Assumptions): Date | null {
  const [mm, dd] = a.placement.startMonthDay.split("-").map(Number);
  let y = target.getUTCFullYear();
  let start = new Date(Date.UTC(y, mm - 1, dd));
  if (start.getTime() + a.placement.weeks * WEEK_MS > target.getTime()) {
    y -= 1;
    start = new Date(Date.UTC(y, mm - 1, dd));
  }
  return start;
}

function prepare(ctx: SimContext, opts: { runs?: number; central?: boolean } = {}): World {
  const a = ctx.assumptions ?? ASSUMPTIONS;
  const start0 = nextMonday(ctx.now);
  const target = new Date(ctx.targetDate);
  const span = Number.isFinite(target.getTime()) ? Math.floor((target.getTime() - start0.getTime()) / WEEK_MS) + 1 : 1;
  const nWeeks = Math.min(MAX_WEEKS, Math.max(1, span));
  const dates = Array.from({ length: nWeeks }, (_, w) => addDays(start0, 7 * w));
  const exam = dates.map((d) => isExamWeek(d));

  const pStart = placementWindow(target, a);
  const placementWeeks = dates.map((d) => !!pStart && d.getTime() >= pStart.getTime() && d.getTime() < pStart.getTime() + a.placement.weeks * WEEK_MS);
  const placementEnd = placementWeeks.lastIndexOf(true);

  const nodes = ctx.nodes;
  const nodeIndex = new Map(nodes.map((n, i) => [n.skillId, i]));
  const degreeWeek = nodes.map((n) => {
    if (n.status !== "degree-upcoming") return Number.POSITIVE_INFINITY;
    const term: TermRef | null = teachingModule(n, ctx.startedAt, ctx.programme)?.term ?? parseUpcomingLabel(n.upcomingLabel);
    if (!term) return Number.POSITIVE_INFINITY;
    const end = termEnd(term, ctx.startedAt).getTime();
    const w = dates.findIndex((d) => d.getTime() + 6 * 86_400_000 >= end);
    return w < 0 ? Number.POSITIVE_INFINITY : w;
  });

  const prereqs = new Map<SkillId, SkillId[]>();
  for (const e of ctx.edges) if (e.kind === "prereq") prereqs.set(e.to, [...(prereqs.get(e.to) ?? []), e.from]);

  const trendById = new Map(ctx.trends.map((t) => [t.skillId, t]));
  const trend = nodes.map((n) => {
    const t = trendById.get(n.skillId);
    const last = t?.history?.length ? [...t.history].sort((x, y) => x.month.localeCompare(y.month)).at(-1) : undefined;
    if (!t || !last || !t.projection?.length || n.demand <= 0) return null;
    const proj = [...t.projection].sort((x, y) => x.month.localeCompare(y.month));
    const mid = new Float64Array(nWeeks);
    const se = new Float64Array(nWeeks);
    const shareNow = clampShare(last.share);
    dates.forEach((d, w) => {
      const month = isoDate(d).slice(0, 7);
      if (month <= last.month) {
        mid[w] = logit(shareNow);
        se[w] = 0;
        return;
      }
      const p = proj.find((x) => x.month === month) ?? (month > proj[proj.length - 1].month ? proj[proj.length - 1] : proj[0]);
      mid[w] = logit(clampShare(p.share));
      se[w] = Math.max(0, (logit(clampShare(p.high)) - logit(clampShare(p.low))) / (2 * Z95));
    });
    return { mid, se, shareNow };
  });

  const runs = opts.central ? 1 : Math.max(1, Math.round(opts.runs ?? a.runs));
  const rng = mulberry32(hashSeed(`${a.seed}:${ctx.userId}:${ctx.roleId}`));
  const z: Float64Array[] = [];
  const effortMult: Float64Array[] = [];
  const pace: Float64Array[] = [];
  const [eLo, eHi] = a.effortSpread;
  const [pLo, pHi] = a.followThrough;
  for (let r = 0; r < runs; r++) {
    const zr = new Float64Array(nodes.length);
    const er = new Float64Array(nodes.length);
    const pr = new Float64Array(nWeeks);
    for (let i = 0; i < nodes.length; i++) {
      zr[i] = opts.central ? 0 : normal(rng);
      er[i] = opts.central ? (eLo + eHi) / 2 : eLo + (eHi - eLo) * rng();
    }
    for (let w = 0; w < nWeeks; w++) pr[w] = opts.central ? (pLo + pHi) / 2 : pLo + (pHi - pLo) * rng();
    z.push(zr);
    effortMult.push(er);
    pace.push(pr);
  }

  return {
    ctx, a, nWeeks, dates, exam, placementWeeks, placementEnd, nodes, degreeWeek, prereqs, nodeIndex, trend,
    raw0: readinessRaw(nodes), runs, z, effortMult, pace,
  };
}

// ---------- one plan, one future ----------

/** Planned study hours in week w (before the week's follow-through). */
export function hoursInWeek(spec: PlanSpec, w: { exam: boolean; placement: boolean }, a: Assumptions = ASSUMPTIONS): number {
  if (spec.placement && w.placement) return a.placement.learningHoursPerWeek;
  const base = Math.max(0, spec.hoursPerWeek - Math.max(0, spec.jobHoursLost));
  if (base <= 0) return 0;
  return w.exam ? Math.max(1, Math.round(base * 0.5)) : base;
}

interface RunOutcome { order: SkillId[]; doneWeek: Int32Array; slowStart: boolean[] }

function runPlan(world: World, spec: PlanSpec, r: number): RunOutcome {
  const order = orderQueue(world.ctx.queue, spec.firstSkillId);
  const doneWeek = new Int32Array(order.length).fill(-1);
  const slowStart = order.map(() => false);
  const completed = new Set<SkillId>();
  const ready = (id: SkillId, w: number) =>
    (world.prereqs.get(id) ?? []).every((p) => {
      const i = world.nodeIndex.get(p);
      if (i === undefined) return true;
      const n = world.nodes[i];
      return n.status === "proven" || n.status === "degree-done" || world.degreeWeek[i] <= w || completed.has(p);
    });
  let k = 0;
  let remaining = -1;
  for (let w = 0; w < world.nWeeks && k < order.length; w++) {
    let h = hoursInWeek(spec, { exam: world.exam[w], placement: world.placementWeeks[w] }, world.a) * world.pace[r][w];
    while (h > 1e-9 && k < order.length) {
      if (remaining < 0) {
        const id = order[k];
        const idx = world.nodeIndex.get(id);
        const base = effortFor(id, world.a) * (idx === undefined ? 1 : world.effortMult[r][idx]);
        const ok = ready(id, w);
        slowStart[k] = !ok;
        remaining = ok ? base : base / PREREQ_NOT_READY;
      }
      const used = Math.min(h, remaining);
      remaining -= used;
      h -= used;
      if (remaining <= 1e-9) {
        doneWeek[k] = w;
        completed.add(order[k]);
        k++;
        remaining = -1;
      }
    }
  }
  return { order, doneWeek, slowStart };
}

/** Readiness at the end of each week for one future, given the week each node turns proven. */
function readinessPath(world: World, r: number, provenWeek: Float64Array): Float64Array {
  const out = new Float64Array(world.nWeeks);
  const { nodes, trend, degreeWeek } = world;
  for (let w = 0; w < world.nWeeks; w++) {
    let total = 0;
    let covered = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.demand <= 0) continue;
      const t = trend[i];
      const d = t && t.se[w] >= 0 ? n.demand * (sigmoid(t.mid[w] + world.z[r][i] * t.se[w]) / t.shareNow) : n.demand;
      const cov = w >= provenWeek[i] ? 1 : n.status === "degree-upcoming" && w >= degreeWeek[i] ? COVERAGE["degree-done"] : (COVERAGE[n.status] ?? 0);
      total += d;
      covered += d * cov;
    }
    const raw = total ? covered / total : 0;
    out[w] = clamp01(world.ctx.readinessNow + raw - world.raw0);
  }
  return out;
}

function provenWeeks(world: World, spec: PlanSpec | null, outcome: RunOutcome | null): Float64Array {
  const pw = new Float64Array(world.nodes.length).fill(Number.POSITIVE_INFINITY);
  if (!spec || !outcome) return pw;
  outcome.order.forEach((id, k) => {
    const i = world.nodeIndex.get(id);
    if (i !== undefined && outcome.doneWeek[k] >= 0) pw[i] = outcome.doneWeek[k];
  });
  if (spec.placement && world.placementEnd >= 0) {
    world.nodes.forEach((n, i) => {
      if (n.category === "professional" && n.demand > 0 && n.status !== "proven") pw[i] = Math.min(pw[i], world.placementEnd);
    });
  }
  return pw;
}

// ---------- hours you actually need ----------

function allDoneShare(world: World, spec: PlanSpec): number {
  if (!world.ctx.queue.length) return 1;
  let done = 0;
  for (let r = 0; r < world.runs; r++) {
    const o = runPlan(world, spec, r);
    if (o.doneWeek[o.doneWeek.length - 1] >= 0) done++;
  }
  return done / world.runs;
}

/** Binary search for the fewest planned hours a week that finish the queue in ≥ confidence of futures. */
function hoursNeeded(world: World, spec: PlanSpec): number | null {
  if (!world.ctx.queue.length) return 0;
  const need = world.a.confidence;
  let lo = 1;
  let hi = world.a.maxHoursPerWeek;
  if (allDoneShare(world, { ...spec, hoursPerWeek: hi }) < need) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (allDoneShare(world, { ...spec, hoursPerWeek: mid }) >= need) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// ---------- the simulation ----------

const DAY_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-09-01" → "1 Sep 2027". */
export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${DAY_MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}` : iso;
}
const pctOf = (x: number) => Math.round(x * 100);
const tenths = (share: number) => Math.round(share * 10);
/** The date at the end of week w (never past the target date). */
const weekEnd = (world: World, w: number) => {
  const end = addDays(world.dates[w], 6);
  const target = new Date(world.ctx.targetDate);
  return isoDate(Number.isFinite(target.getTime()) && target.getTime() < end.getTime() && target.getTime() >= world.dates[w].getTime() ? target : end);
};

function summarisePlan(world: World, spec: PlanSpec, outcomes: RunOutcome[], paths: Float64Array[], withHours: boolean): PlanResult {
  const { nWeeks, runs } = world;
  const series: BandPoint[] = [];
  const col = new Float64Array(runs);
  for (let w = 0; w < nWeeks; w++) {
    for (let r = 0; r < runs; r++) col[r] = paths[r][w];
    const s = [...col].sort((x, y) => x - y);
    series.push({ week: w + 1, date: weekEnd(world, w), p10: round2(quantile(s, 0.1)), p50: round2(quantile(s, 0.5)), p90: round2(quantile(s, 0.9)) });
  }
  const last = series[series.length - 1];
  const order = outcomes[0]?.order ?? orderQueue(world.ctx.queue, spec.firstSkillId);
  const milestones: Milestone[] = order.map((id, k) => {
    const weeks = outcomes.map((o) => o.doneWeek[k]);
    const done = weeks.filter((w) => w >= 0);
    const doneShare = done.length / runs;
    const slow = outcomes.filter((o) => o.slowStart[k]).length / runs >= 0.5;
    return {
      skillId: id, name: labelOf(world.nodes, id),
      date: doneShare >= 0.5 ? weekEnd(world, Math.round(median(weeks.map((w) => (w >= 0 ? w : nWeeks))))) : null,
      doneShare: round2(doneShare), slowStart: slow,
    };
  });
  const all = outcomes.map((o) => (o.doneWeek.length ? o.doneWeek[o.doneWeek.length - 1] : 0));
  const share = order.length ? all.filter((w) => w >= 0).length / runs : 1;
  const plannedHours = world.dates.reduce((s, _d, w) => s + hoursInWeek(spec, { exam: world.exam[w], placement: world.placementWeeks[w] }, world.a), 0);

  const notes: string[] = [];
  milestones.forEach((m) => {
    if (!m.slowStart) return;
    const missing = (world.prereqs.get(m.skillId) ?? [])
      .filter((p) => {
        const i = world.nodeIndex.get(p);
        return i !== undefined && world.nodes[i].status !== "proven" && world.nodes[i].status !== "degree-done";
      })
      .map((p) => labelOf(world.nodes, p));
    notes.push(`${m.name} starts before ${missing.join(" and ") || "its prerequisites"}, so it takes about ${(1 / PREREQ_NOT_READY).toFixed(1)} times as long (the Roadmap Agent's prerequisite rule).`);
  });
  const exams = world.exam.filter(Boolean).length;
  if (exams) notes.push(`${exams} exam ${exams === 1 ? "week gets" : "weeks get"} half your hours.`);
  if (spec.jobHoursLost > 0) notes.push(`Your part-time job costs ${spec.jobHoursLost} of your ${spec.hoursPerWeek} hours a week.`);
  if (spec.placement) {
    notes.push(world.placementEnd >= 0
      ? `Your placement runs ${dateLabel(isoDate(world.dates[world.placementWeeks.indexOf(true)]))} to ${dateLabel(weekEnd(world, world.placementEnd))} and proves communication and teamwork at work.`
      : "A summer placement doesn't fit before your target date, so it changes nothing here.");
  }

  return {
    id: spec.id, label: spec.label, spec, series,
    final: { p10: last?.p10 ?? 0, p50: last?.p50 ?? 0, p90: last?.p90 ?? 0 },
    milestones,
    firstProofDate: milestones[0]?.date ?? null,
    allDoneShare: round2(share),
    allDoneDate: order.length && share >= 0.5 ? weekEnd(world, Math.round(median(all.map((w) => (w >= 0 ? w : nWeeks))))) : null,
    plannedHours,
    hoursNeeded: withHours ? hoursNeeded(world, spec) : null,
    notes,
  };
}

function compare(world: World, a: PlanResult, b: PlanResult, pa: Float64Array[], pb: Float64Array[], fa: RunOutcome[], fb: RunOutcome[]): Comparison {
  const runs = world.runs;
  let aFinal = 0, bFinal = 0, aLead = 0, bLead = 0;
  const gaps: number[] = [];
  for (let r = 0; r < runs; r++) {
    const last = world.nWeeks - 1;
    const d = pa[r][last] - pb[r][last];
    if (d > EPS) aFinal++;
    else if (d < -EPS) bFinal++;
    let aw = 0, bw = 0;
    for (let w = 0; w < world.nWeeks; w++) {
      const x = pa[r][w] - pb[r][w];
      if (x > EPS) aw++;
      else if (x < -EPS) bw++;
    }
    if (aw > bw) aLead++;
    else if (bw > aw) bLead++;
    const ra = fa[r].doneWeek[0] ?? -1;
    const rb = fb[r].doneWeek[0] ?? -1;
    gaps.push((rb < 0 ? world.nWeeks : rb) - (ra < 0 ? world.nWeeks : ra));
  }
  const cmp = {
    aFinalWins: round2(aFinal / runs), bFinalWins: round2(bFinal / runs),
    aLeads: round2(aLead / runs), bLeads: round2(bLead / runs),
    firstProofGapWeeks: Math.round(median(gaps)),
  };
  return { ...cmp, verdict: verdictFor(a, b, cmp, dateLabel(world.ctx.targetDate)) };
}

/** One plain sentence from the numbers (deterministic; no model involved). */
export function verdictFor(a: PlanResult, b: PlanResult, c: Omit<Comparison, "verdict">, target: string): string {
  const fa = pctOf(a.final.p50);
  const fb = pctOf(b.final.p50);
  if (Math.abs(fa - fb) >= 1) {
    const [win, lose, share] = fa > fb ? [a, b, c.aFinalWins] : [b, a, c.bFinalWins];
    return `${win.label} ends ahead on ${target}: ${pctOf(win.final.p50)}% ready against ${pctOf(lose.final.p50)}%, and it comes out on top in ${tenths(share)} of 10 futures.`;
  }
  // Level at the end: lead with what does differ (when proofs land), then the year-long picture.
  const [lead, share] = c.aLeads >= c.bLeads ? [a, c.aLeads] : [b, c.bLeads];
  const gap = c.firstProofGapWeeks;
  const doneGap = weeksBetween(b.allDoneDate, a.allDoneDate);
  const parts: string[] = [];
  if (gap !== 0) parts.push(`${gap > 0 ? a.label : b.label} lands your first proof ${weeksText(gap)} sooner`);
  if (doneGap) parts.push(`${parts.length && (doneGap > 0) === (gap > 0) ? "it" : doneGap > 0 ? a.label : b.label} finishes every roadmap proof ${weeksText(doneGap)} sooner`);
  const head = parts.length ? `${parts.join(", and ")}. ` : "";
  if (share < 0.05) return `${head}Both plans reach ${fa}% by ${target}${parts.length ? "" : " and stay level all the way"}.`;
  return `${head}Both reach ${fa}% by ${target}, and ${lead.label} is ahead for more of the year in ${tenths(share)} of 10 futures.`;
}
const weeksText = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? "week" : "weeks"}`;
/** Whole weeks from `from` to `to` (positive when `to` is later); 0 when either date is missing. */
function weeksBetween(to: string | null | undefined, from: string | null | undefined): number {
  if (!to || !from) return 0;
  const d = (new Date(to).getTime() - new Date(from).getTime()) / WEEK_MS;
  return Number.isFinite(d) ? Math.round(d) : 0;
}

/**
 * Simulates up to two plans (and the degree-only baseline) across the same futures. `central: true` is the
 * deterministic single-future fallback (mean pace, mean effort, mid demand).
 */
export function simulate(ctx: SimContext, plans: PlanSpec[], opts: { runs?: number; central?: boolean; hours?: boolean; now?: Date } = {}): SimulationResult {
  const world = prepare(ctx, opts);
  const results: PlanResult[] = [];
  const paths: Float64Array[][] = [];
  const outcomes: RunOutcome[][] = [];
  for (const spec of plans.slice(0, 2)) {
    const outs: RunOutcome[] = [];
    const ps: Float64Array[] = [];
    for (let r = 0; r < world.runs; r++) {
      const o = runPlan(world, spec, r);
      outs.push(o);
      ps.push(readinessPath(world, r, provenWeeks(world, spec, o)));
    }
    outcomes.push(outs);
    paths.push(ps);
    results.push(summarisePlan(world, spec, outs, ps, opts.hours !== false));
  }
  const baseCol = Array.from({ length: world.runs }, (_, r) => readinessPath(world, r, provenWeeks(world, null, null)));
  const baseline = world.dates.map((_, w) => ({
    week: w + 1, date: weekEnd(world, w), p50: round2(quantile(baseCol.map((p) => p[w]).sort((x, y) => x - y), 0.5)),
  }));
  return {
    userId: ctx.userId, roleId: ctx.roleId,
    startDate: isoDate(world.dates[0]), targetDate: isoDate(new Date(ctx.targetDate)),
    weeks: world.nWeeks, runs: world.runs, confidence: world.a.confidence,
    readinessNow: round2(ctx.readinessNow),
    queue: ctx.queue.map((id) => ({ skillId: id, name: labelOf(ctx.nodes, id) })),
    baseline,
    plans: results,
    comparison: results.length === 2 ? compare(world, results[0], results[1], paths[0], paths[1], outcomes[0], outcomes[1]) : null,
    generatedAt: (opts.now ?? ctx.now).toISOString(),
  };
}

// ---------- adopting a plan: the proposed roadmap ----------

/** Rescales a week's task hours to `total`, keeping whole hours and dropping tasks that fall to 0 (never all). */
export function rescaleTasks<T extends { hours: number }>(tasks: T[], total: number): T[] {
  const sum = tasks.reduce((s, t) => s + t.hours, 0);
  if (!tasks.length || sum === total) return tasks;
  if (sum <= 0) return tasks.map((t, i) => ({ ...t, hours: i === 0 ? total : 0 }));
  const exact = tasks.map((t) => (t.hours * total) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((s, x) => s + x, 0);
  const byFrac = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((p, q) => q.f - p.f || p.i - q.i);
  for (const { i } of byFrac) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  const kept = tasks.map((t, i) => ({ ...t, hours: out[i] })).filter((t) => t.hours > 0);
  return kept.length ? kept : [{ ...tasks[0], hours: Math.max(1, total) }];
}

export interface RoadmapDiff {
  hoursBefore: number;
  hoursAfter: number;
  weekChanges: { week: number; startDate: string; before: SkillId; after: SkillId }[];
  firstFocus: { before: SkillId | null; after: SkillId | null };
}

/**
 * The roadmap a plan proposes: the student's current weeks, with every week of the chosen first skill moved, as a
 * block, to the front of the weeks still ahead (each week keeps its slot's date and exam flag), task hours rescaled
 * to the plan's study hours (half in exam weeks), task ids renumbered and the version bumped. Weeks that have ended
 * or are fully ticked never move; ticked tasks travel with their week. Pure.
 */
export function buildProposedRoadmap(current: Roadmap, spec: PlanSpec, now: Date): Roadmap {
  const hours = Math.max(1, spec.hoursPerWeek - Math.max(0, spec.jobHoursLost));
  const weeks = [...current.weeks].sort((x, y) => x.week - y.week);
  const movable = weeks.map((w, i) => ({ w, i })).filter(({ w }) => isMovable(w, now));
  const slots = movable.map(({ i }) => i);
  const order = blockFirst(movable.map(({ w }) => w), spec.firstSkillId, (w) => w.focusSkillId);
  const placed = [...weeks];
  slots.forEach((slotIdx, j) => { placed[slotIdx] = order[j]; });
  const out = placed.map((w, idx) => {
    const slot = weeks[idx];
    const slotHours = slot.isExamWeek ? Math.max(1, Math.round(hours * 0.5)) : hours;
    const tasks = rescaleTasks(w.tasks, slotHours).map((t, k) => ({ ...t, id: `t_${slot.week}_${k + 1}` }));
    return { ...w, week: slot.week, startDate: slot.startDate, isExamWeek: slot.isExamWeek, tasks };
  });
  return { ...current, version: current.version + 1, weeks: out, generatedAt: now.toISOString() };
}

/** A week can be reordered while it hasn't ended and isn't fully ticked. */
function isMovable(w: Roadmap["weeks"][number], now: Date): boolean {
  const done = w.tasks.length > 0 && w.tasks.every((t) => t.done);
  const end = new Date(w.startDate).getTime() + WEEK_MS;
  return !done && !(Number.isFinite(end) && end <= now.getTime());
}

/** Every item whose key is `first` moves to the front as a block; everything else keeps its relative order. */
export function blockFirst<T>(items: T[], first: SkillId | null | undefined, key: (x: T) => SkillId): T[] {
  if (!first) return [...items];
  return [...items.filter((x) => key(x) === first), ...items.filter((x) => key(x) !== first)];
}

/** The weeks of a roadmap that adopting a plan may reorder, in week order. */
export function movableWeeks(r: Roadmap, now: Date): Roadmap["weeks"] {
  return [...r.weeks].sort((x, y) => x.week - y.week).filter((w) => isMovable(w, now));
}

/** Study hours in a normal (non-exam) week of a roadmap. */
export function weeklyHours(r: Roadmap): number {
  const w = r.weeks.find((x) => !x.isExamWeek) ?? r.weeks[0];
  return w ? w.tasks.reduce((s, t) => s + t.hours, 0) : 0;
}

export function diffRoadmaps(before: Roadmap, after: Roadmap): RoadmapDiff {
  const hoursOf = weeklyHours;
  const byWeek = new Map(before.weeks.map((w) => [w.week, w]));
  const weekChanges = after.weeks
    .filter((w) => byWeek.get(w.week) && byWeek.get(w.week)!.focusSkillId !== w.focusSkillId)
    .map((w) => ({ week: w.week, startDate: w.startDate, before: byWeek.get(w.week)!.focusSkillId, after: w.focusSkillId }));
  const first = (r: Roadmap) => [...r.weeks].sort((x, y) => x.week - y.week)[0]?.focusSkillId ?? null;
  return { hoursBefore: hoursOf(before), hoursAfter: hoursOf(after), weekChanges, firstFocus: { before: first(before), after: first(after) } };
}
