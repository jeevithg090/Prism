// Skill Half-life Radar · the maths (pure, deterministic, no I/O).
//
// For every module of a programme:
//  1. what it teaches: the syllabus skills plus skills found in its topics and learning outcomes (Skill Mapper);
//  2. half-life: the Trend Forecaster's own fit (OLS on logit(share of hiring posts), last 24 months) per taught
//     skill, combined into a module demand index D(h) = Σ level·p(h) / Σ level·p(0). The half-life is the first
//     month where D(h) ≤ ½. Untracked foundations (no forecast) are assumed to hold their value;
//  3. drift: rising skills next door that the module does not teach, through a Bridge Map prerequisite edge
//     (only when the programme covers every prerequisite by that module's year) or a curated "taught together" pair;
//  4. urgency (0..100) = decay points + drift points, where
//       decay = 100 · trackedShare · max(0, 1 − D(horizon))                       (demand lost by graduation)
//       drift = 100 · Σ cohortDemand(x) · min(1, growthPerYear(x)) for drift x that NO module teaches;
//  5. a refresh note drafted from those receipts and linked to one of the module's own learning outcomes.
import { addMonths, FIT_WINDOW, labelFor, logit, olsFit, sigmoid } from "@/lib/agents/trends";
import { matchSkills } from "@/lib/agents/skillmap";
import { skillName } from "@/lib/schemas/community";
import type { Module, Programme, SkillId, TrendLabel, TrendPoint, TrendSeries } from "@/lib/types";
import type { DriftSkill, ModuleHalfLife, RefreshNote, TaughtSkill } from "./schema";

export const MAX_YEARS = 20;
/** Forecast months drawn on the decay curve (the straight-line trend, extended). */
export const CURVE_MONTHS = 72;
const CURVE_STEP = 3;
const EPS = 1e-4;
const MIN_POINTS = 6;

export type Edge = { from: SkillId; to: SkillId; kind: "prereq" | "co-occurs"; why?: string };
export type HalfLifeConfig = {
  pairs: { a: SkillId; b: SkillId; why: string }[];
  successors: Record<SkillId, SkillId[]>;
  keywords: Record<SkillId, string[]>;
};
export type SkillFit = {
  skillId: SkillId; slope: number; y0: number; lastMonth: string; shareNow: number;
  growthPerYear: number; label: TrendLabel; history: TrendPoint[];
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clampShare = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => { const v = x * 100; return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`; };
const MONTH = /^\d{4}-\d{2}$/;
const yrs = (y: number) => y.toFixed(1);
/** Soft skills the Skill Mapper finds in ordinary prose ("Communication and remote procedure calls"): never counted from topics. */
const PROSE_SKILLS = new Set<SkillId>(["communication", "teamwork"]);
const COMMON_NOUNS = new Set<SkillId>(["databases", "algorithms", "statistics", "testing", "agile", "data-structures"]);
/** A skill name inside a sentence: "Deep learning" → "deep learning"; proper nouns and acronyms stay ("Linux", "LLM apps"). */
export function inSentence(id: SkillId): string {
  const n = skillName(id);
  return (/\s/.test(n) && !/[A-Z]/.test(n.slice(1))) || COMMON_NOUNS.has(id) ? n.toLowerCase() : n;
}
/** "a Docker exercise", "an LLM apps exercise", "an MLOps exercise". */
export function article(word: string): string {
  return /^(?:[aeiou]|LLM|ML|SQL|NLP|S3|F[A-Z]|R\b)/i.test(word) && !/^(?:us|uni)/i.test(word) ? "an" : "a";
}
/** "A", "A and B", "A, B and C". */
const andList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---------- 1. per-skill fit (the Trend Forecaster's own model) ----------

/** OLS on logit(share) over the last 24 months; y0 is the fitted value at the last month. Null if too little data. */
export function fitSkill(series: Pick<TrendSeries, "skillId" | "history">): SkillFit | null {
  const h = (series.history ?? [])
    .filter((p) => p && MONTH.test(p.month) && Number.isFinite(p.share) && p.share >= 0 && p.share <= 1)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (h.length < MIN_POINTS) return null;
  const win = h.slice(-FIT_WINDOW);
  const fit = olsFit(win.map((_, i) => i), win.map((p) => logit(clampShare(p.share))));
  const y0 = fit.intercept + fit.slope * (win.length - 1);
  const growthPerYear = Math.exp(12 * fit.slope) - 1;
  return {
    skillId: series.skillId, slope: fit.slope, y0, lastMonth: win[win.length - 1].month,
    shareNow: sigmoid(y0), growthPerYear, label: labelFor(growthPerYear), history: h,
  };
}

/** Projected share h months after the last data month. */
export const shareAt = (f: Pick<SkillFit, "y0" | "slope">, h: number) => sigmoid(f.y0 + f.slope * h);

/** Years until one skill's share halves, from logit(p/2) = y0 + b·h. Null when it isn't falling (or takes > 20 years). */
export function skillHalfLifeYears(f: Pick<SkillFit, "y0" | "slope" | "shareNow">): number | null {
  if (!(f.slope < 0)) return null;
  const months = (logit(f.shareNow / 2) - f.y0) / f.slope;
  return months > 0 && months <= MAX_YEARS * 12 ? r1(months / 12) : null;
}

type Weighted = { fit: SkillFit; w: number };

/** Module demand index h months ahead (today = 1). */
export function moduleIndex(tracked: Weighted[], h: number): number {
  const base = tracked.reduce((a, t) => a + t.w * t.fit.shareNow, 0);
  if (!(base > 0)) return 1;
  return tracked.reduce((a, t) => a + t.w * shareAt(t.fit, h), 0) / base;
}

/** First time (years) the module demand index falls to ½, linearly interpolated between months. Null if never within 20 years. */
export function moduleHalfLifeYears(tracked: Weighted[]): number | null {
  if (!tracked.length) return null;
  let prev = 1;
  for (let h = 1; h <= MAX_YEARS * 12; h++) {
    const cur = moduleIndex(tracked, h);
    if (cur <= 0.5) {
      const frac = prev === cur ? 0 : (prev - 0.5) / (prev - cur);
      return r1((h - 1 + frac) / 12);
    }
    prev = cur;
  }
  return null;
}

// ---------- 2. what a module teaches ----------

/** Syllabus skills, plus skills the Skill Mapper finds in the topics and learning outcomes (capped at level 2). */
export function taughtSkills(m: Pick<Module, "skills" | "topics" | "learningOutcomes">): { skillId: SkillId; level: 1 | 2 | 3; source: "syllabus" | "topics" }[] {
  const out = new Map<SkillId, { skillId: SkillId; level: 1 | 2 | 3; source: "syllabus" | "topics" }>();
  for (const s of m.skills ?? []) if (s.level >= 1) out.set(s.skillId, { skillId: s.skillId, level: Math.min(3, s.level) as 1 | 2 | 3, source: "syllabus" });
  const text = [...(m.topics ?? []), ...(m.learningOutcomes ?? [])].join(". ");
  for (const [id, lvl] of matchSkills(text)) {
    if (!out.has(id) && !PROSE_SKILLS.has(id) && lvl >= 1) out.set(id, { skillId: id, level: Math.min(2, lvl) as 1 | 2, source: "topics" });
  }
  return [...out.values()];
}

// ---------- 3. drift ----------

export function buildEdges(graphEdges: Edge[], curatedPrereqs: Record<SkillId, SkillId[]>, cfg: HalfLifeConfig): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  const add = (e: Edge) => {
    const k = e.kind === "prereq" ? `p:${e.from}>${e.to}` : `c:${[e.from, e.to].sort().join("~")}`;
    if (e.from === e.to || seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  for (const e of graphEdges) if (e && typeof e.from === "string" && typeof e.to === "string") add({ from: e.from, to: e.to, kind: e.kind === "co-occurs" ? "co-occurs" : "prereq" });
  for (const [to, froms] of Object.entries(curatedPrereqs)) for (const from of froms ?? []) add({ from, to, kind: "prereq" });
  for (const p of cfg.pairs) add({ from: p.a, to: p.b, kind: "co-occurs", why: p.why });
  return out;
}

type DriftCtx = {
  edges: Edge[];
  fits: Map<SkillId, SkillFit>;
  cohortDemand: Map<SkillId, number>;
  /** code → skills it teaches; code → year. */
  coverage: Map<string, Set<SkillId>>;
  years: Map<string, number>;
};

/** Rising skills adjacent to the module that it does not teach (see the header for the rules). */
export function driftFor(code: string, covered: Set<SkillId>, ctx: DriftCtx): DriftSkill[] {
  const year = ctx.years.get(code) ?? 4;
  const coveredByYear = new Set<SkillId>();
  for (const [c, skills] of ctx.coverage) if ((ctx.years.get(c) ?? 4) <= year) skills.forEach((s) => coveredByYear.add(s));
  const prereqsOf = (x: SkillId) => [...new Set(ctx.edges.filter((e) => e.kind === "prereq" && e.to === x).map((e) => e.from))];

  const out: DriftSkill[] = [];
  for (const [x, fit] of ctx.fits) {
    if (fit.label !== "rising" || covered.has(x)) continue;
    let via: DriftSkill["via"] | null = null;
    const pre = prereqsOf(x);
    const from = pre.find((p) => covered.has(p));
    if (from && pre.every((p) => coveredByYear.has(p))) {
      via = { skillId: from, name: skillName(from), kind: "prereq", why: `${skillName(x)} builds on ${inSentence(from)}, which this module teaches` };
    }
    if (!via) {
      const pair = ctx.edges.find((e) => e.kind === "co-occurs" && ((e.from === x && covered.has(e.to)) || (e.to === x && covered.has(e.from))));
      if (pair) {
        const src = pair.from === x ? pair.to : pair.from;
        via = { skillId: src, name: skillName(src), kind: "co-occurs", why: pair.why ?? `${skillName(x)} is usually taught with ${inSentence(src)}` };
      }
    }
    if (!via) continue;
    const coveredBy = [...ctx.coverage.entries()].filter(([c, s]) => c !== code && s.has(x)).map(([c]) => c).sort();
    const demand = ctx.cohortDemand.get(x) ?? 0;
    out.push({
      skillId: x, name: skillName(x), growthPerYear: r3(fit.growthPerYear), cohortDemandPct: Math.round(demand * 100), via, coveredBy,
      points: coveredBy.length ? 0 : r1(100 * demand * Math.min(1, fit.growthPerYear)),
    });
  }
  return out.sort((a, b) => b.points - a.points || b.growthPerYear - a.growthPerYear || a.skillId.localeCompare(b.skillId));
}

// ---------- 4. refresh note ----------

const clipLO = (lo: string) => { const s = lo.replace(/\.$/, "").trim(); return s.length > 90 ? `${s.slice(0, 87)}…` : s; };

/** The learning outcome a note links to: one that mentions `mention` (Skill Mapper), else the best keyword match, else the first. */
export function pickOutcome(outcomes: string[], opts: { mention?: SkillId; keywords?: string[] }): number {
  if (!outcomes.length) return 0;
  let best = 0;
  let bestScore = -1;
  outcomes.forEach((lo, i) => {
    const low = lo.toLowerCase();
    const score = (opts.mention && matchSkills(lo).has(opts.mention) ? 10 : 0) + (opts.keywords ?? []).filter((k) => low.includes(k)).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

export function draftNote(input: {
  module: Pick<Module, "code" | "title" | "learningOutcomes">;
  taught: TaughtSkill[];
  drift: DriftSkill[];
  parts: { decay: number; drift: number };
  halfLifeYears: number | null;
  fits: Map<SkillId, SkillFit>;
  cfg: HalfLifeConfig;
  /** drift skill → every module it is adjacent to (so a note can ask colleagues to agree one owner). */
  alsoNextTo?: Record<SkillId, string[]>;
}): RefreshNote | null {
  const { module: m, taught, drift, parts, fits, cfg } = input;
  const los = m.learningOutcomes ?? [];
  const taughtIds = new Set(taught.map((t) => t.skillId));

  const falling = taught.filter((t) => t.tracked && (t.growthPerYear ?? 0) < 0).sort((a, b) => (a.growthPerYear ?? 0) - (b.growthPerYear ?? 0))[0];
  if (parts.decay > 0 && parts.decay >= parts.drift && falling) {
    const d = falling.skillId;
    const succ = (cfg.successors[d] ?? []).find((s) => fits.get(s)?.label === "rising" && !taughtIds.has(s));
    const i = pickOutcome(los, { mention: d, keywords: succ ? cfg.keywords[succ] : [] });
    const lo = los[i] ?? "";
    const mentions = lo ? matchSkills(lo).has(d) : false;
    const D = skillName(d);
    const facts = `${D} appears in ${pct1(falling.shareNow ?? 0)} of hiring posts and is falling ${pct(Math.abs(falling.growthPerYear ?? 0))} a year` +
      `${input.halfLifeYears !== null ? ` (module half-life ${yrs(input.halfLifeYears)} years)` : ""}`;
    let text: string;
    if (succ) {
      const S = skillName(succ);
      const sg = fits.get(succ)?.growthPerYear ?? 0;
      text = lo
        ? `${mentions ? `Revise learning outcome ${i + 1} ('${clipLO(lo)}') so it no longer depends on ${D}` : `Keep learning outcome ${i + 1} ('${clipLO(lo)}')`}, and deliver one lab in ${S}. ${facts}, while ${S} is rising ${pct(sg)} a year.`
        : `Deliver one lab of ${m.code} in ${S}. ${facts}, while ${S} is rising ${pct(sg)} a year.`;
    } else {
      text = `${lo ? `Review learning outcome ${i + 1} ('${clipLO(lo)}'): k` : "K"}eep the transferable ideas and spend less lab time on ${D}-specific detail. ${facts}.`;
    }
    const sf = succ ? fits.get(succ) : undefined;
    return {
      kind: "rebalance", text, skillIds: succ ? [d, succ] : [d], learningOutcomeIndex: i, learningOutcome: lo, source: "template",
      ...(succ && sf ? { successor: { skillId: succ, name: skillName(succ), growthPerYear: r3(sf.growthPerYear), shareNow: Number(sf.shareNow.toFixed(4)) } } : {}),
    };
  }

  const x = drift.find((s) => s.points > 0);
  if (!x) return null;
  const i = pickOutcome(los, { mention: x.via.skillId, keywords: cfg.keywords[x.skillId] });
  const lo = los[i] ?? "";
  const demand = x.cohortDemandPct > 0 ? ` and ${x.cohortDemandPct}% of the job ads this cohort targets ask for it` : "";
  const X = inSentence(x.skillId);
  const also = (input.alsoNextTo?.[x.skillId] ?? []).filter((c) => c !== m.code);
  const text = `Add ${article(X)} ${X} exercise to ${m.code} ${m.title} that builds on ${inSentence(x.via.skillId)}${lo ? ` (supports learning outcome ${i + 1}: '${clipLO(lo)}')` : ""}. ` +
    `${x.name} is rising ${pct(x.growthPerYear)} a year in hiring posts${demand}; no module teaches it yet.` +
    (also.length ? ` It also sits next to ${andList(also)}, so agree which module owns it.` : "");
  return { kind: "extend", text, skillIds: [x.skillId], learningOutcomeIndex: i, learningOutcome: lo, source: "template" };
}

// ---------- 5. one programme ----------

export type ComputeInput = {
  programme: Pick<Programme, "modules">;
  trends: Pick<TrendSeries, "skillId" | "history">[];
  edges: Edge[];
  cohortDemand: Map<SkillId, number>;
  horizonYears: number;
  cfg: HalfLifeConfig;
  flagged?: Set<string>;
};
export type ComputeOutput = {
  modules: Omit<ModuleHalfLife, "decision">[];
  lastDataMonth: string;
  horizonMonth: string;
  forecastsUsed: number;
};

function curveFor(tracked: Weighted[], lastMonth: string): ModuleHalfLife["curve"] {
  if (!tracked.length) return [];
  const base = tracked.reduce((a, t) => a + t.w * t.fit.shareNow, 0);
  const byMonth = tracked.map((t) => new Map(t.fit.history.map((p) => [p.month, p.share])));
  const months = [...byMonth[0].keys()].filter((mo) => mo <= lastMonth && byMonth.every((m) => m.has(mo))).sort();
  const hist = months.map((month) => ({
    month, kind: "history" as const,
    index: r1((100 * tracked.reduce((a, t, k) => a + t.w * (byMonth[k].get(month) ?? 0), 0)) / base),
  }));
  const fc: ModuleHalfLife["curve"] = [];
  for (let h = CURVE_STEP; h <= CURVE_MONTHS; h += CURVE_STEP) fc.push({ month: addMonths(lastMonth, h), kind: "forecast", index: r1(100 * moduleIndex(tracked, h)) });
  return [...hist, { month: lastMonth, kind: "forecast", index: 100 }, ...fc];
}

export function computeHalfLife(input: ComputeInput): ComputeOutput {
  const fits = new Map<SkillId, SkillFit>();
  for (const s of input.trends) { const f = fitSkill(s); if (f) fits.set(s.skillId, f); }
  const lastDataMonth = [...fits.values()].map((f) => f.lastMonth).sort().pop() ?? new Date().toISOString().slice(0, 7);
  const H = input.horizonYears * 12;

  const taughtBy = new Map<string, ReturnType<typeof taughtSkills>>();
  const coverage = new Map<string, Set<SkillId>>();
  const years = new Map<string, number>();
  for (const m of input.programme.modules) {
    const t = taughtSkills(m);
    taughtBy.set(m.code, t);
    coverage.set(m.code, new Set(t.map((x) => x.skillId)));
    years.set(m.code, m.year);
  }
  const usedForecasts = new Set<SkillId>();

  const modules = input.programme.modules.map((m) => {
    const raw = taughtBy.get(m.code) ?? [];
    const tracked: Weighted[] = raw.filter((t) => fits.has(t.skillId)).map((t) => ({ fit: fits.get(t.skillId)!, w: t.level }));
    tracked.forEach((t) => usedForecasts.add(t.fit.skillId));
    const totalW = raw.reduce((a, t) => a + t.level, 0);
    const trackedShare = totalW ? tracked.reduce((a, t) => a + t.w, 0) / totalW : 0;

    const taught: TaughtSkill[] = raw.map((t) => {
      const f = fits.get(t.skillId);
      return {
        skillId: t.skillId, name: skillName(t.skillId), level: t.level, source: t.source, tracked: !!f,
        ...(f ? {
          label: f.label, growthPerYear: r3(f.growthPerYear), shareNow: Number(f.shareNow.toFixed(4)),
          shareAtHorizon: Number(shareAt(f, H).toFixed(4)), halfLifeYears: skillHalfLifeYears(f),
        } : {}),
      };
    }).sort((a, b) => Number(b.tracked) - Number(a.tracked) || b.level - a.level || a.skillId.localeCompare(b.skillId));

    const retained = tracked.length ? moduleIndex(tracked, H) : null;
    const halfLifeYears = moduleHalfLifeYears(tracked);
    const status: ModuleHalfLife["status"] = !tracked.length ? "no-signal" : halfLifeYears !== null ? "decaying" : (retained ?? 1) >= 1 ? "growing" : "durable";

    const drift = driftFor(m.code, coverage.get(m.code) ?? new Set(), { edges: input.edges, fits, cohortDemand: input.cohortDemand, coverage, years });
    drift.forEach((d) => usedForecasts.add(d.skillId));
    const decay = r1(100 * trackedShare * Math.max(0, 1 - (retained ?? 1)));
    const driftPts = r1(Math.min(100, drift.reduce((a, d) => a + d.points, 0)));
    const parts = { decay, drift: driftPts };
    const urgency = Math.min(100, Math.round(decay + driftPts));

    return {
      code: m.code, title: m.title, year: m.year, semester: String(m.semester),
      taught, trackedShare: r3(trackedShare), halfLifeYears, status,
      retainedAtHorizon: retained === null ? null : r3(retained),
      curve: curveFor(tracked, lastDataMonth),
      drift, urgency, urgencyParts: parts, refreshNote: null as RefreshNote | null,
      flagged: input.flagged?.has(m.code) ?? false,
    };
  });

  // Second pass: a drift skill next to several modules is flagged in each note, so colleagues agree one owner.
  const alsoNextTo: Record<SkillId, string[]> = {};
  for (const m of modules) for (const d of m.drift) if (d.points > 0) (alsoNextTo[d.skillId] ??= []).push(m.code);
  for (const m of modules) {
    const src = input.programme.modules.find((x) => x.code === m.code);
    if (src && m.urgency > 0) m.refreshNote = draftNote({ module: src, taught: m.taught, drift: m.drift, parts: m.urgencyParts, halfLifeYears: m.halfLifeYears, fits, cfg: input.cfg, alsoNextTo });
  }

  modules.sort((a, b) => b.urgency - a.urgency || (a.halfLifeYears ?? 99) - (b.halfLifeYears ?? 99) || a.code.localeCompare(b.code));
  return { modules, lastDataMonth, horizonMonth: addMonths(lastDataMonth, H), forecastsUsed: usedForecasts.size };
}

/** Cohort-weighted demand: Σ over target roles of (share of the cohort aiming for it) × (share of its job ads asking for the skill). */
export function cohortDemand(roleMix: { roleId: string; weight: number }[], demand: Record<string, Record<SkillId, number>>): Map<SkillId, number> {
  const out = new Map<SkillId, number>();
  const total = roleMix.reduce((a, r) => a + (demand[r.roleId] ? r.weight : 0), 0);
  if (!total) return out;
  for (const r of roleMix) {
    const d = demand[r.roleId];
    if (!d) continue;
    for (const [skill, share] of Object.entries(d)) out.set(skill, (out.get(skill) ?? 0) + (r.weight / total) * share);
  }
  return out;
}
