import "server-only";
// Trend Forecaster (P1): monthly share of HN "Who is hiring?" posts per skill → OLS on logit(share)
// → 12-month projection with a 95% prediction band → Rising / Stable / Declining.
import fs from "node:fs";
import path from "node:path";
import { emit } from "@/lib/agents/events";
import { matchSkills } from "@/lib/agents/skillmap";
import { withCache } from "@/lib/cache";
import { getComments, listWhoIsHiring, monthlyShares } from "@/lib/connectors/hn";
import { canReplay, formatRecordedAt, hasRecording, replayOrRecord } from "@/lib/replay";
import type { SkillId, TrendLabel, TrendPoint, TrendSeries } from "@/lib/types";

/** Growth thresholds per year: above +15% is rising, below −15% is declining. */
export const RISING_AT = 0.15;
export const DECLINING_AT = -0.15;
/** The fit uses the most recent 24 months; the projection runs 12 months ahead. */
export const FIT_WINDOW = 24;
export const HORIZON = 12;
const EPS = 1e-4;
const Z95 = 1.96;

/** Skills the forecaster tracks (the ones that matter for the 3 roles and the demo story). */
export const TREND_SKILLS: SkillId[] = [
  "llm-evaluation", "llm-apps", "vector-databases", "mlops", "pytorch", "docker", "typescript", "kubernetes", "aws",
  "python", "machine-learning", "ci-cd", "react", "sql", "pandas", "scikit-learn", "java", "tensorflow",
];

// ---------- pure maths ----------

export const logit = (p: number) => Math.log(p / (1 - p));
export const sigmoid = (y: number) => 1 / (1 + Math.exp(-y));
const clampShare = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));
const round = (v: number, dp: number) => Number(v.toFixed(dp));

export type OLSFit = { slope: number; intercept: number; residualSE: number; n: number; meanX: number; sxx: number };

/** Ordinary least squares y = a + b·x, with the residual standard error s = √(SSE / (n − 2)). */
export function olsFit(xs: number[], ys: number[]): OLSFit {
  const n = xs.length;
  if (n === 0 || n !== ys.length) return { slope: 0, intercept: 0, residualSE: 0, n, meanX: 0, sxx: 0 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const residualSE = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, residualSE, n, meanX, sxx };
}

export function labelFor(growthPerYear: number): TrendLabel {
  return growthPerYear > RISING_AT ? "rising" : growthPerYear < DECLINING_AT ? "declining" : "stable";
}

/** "2026-10" + 3 → "2027-01". */
export function addMonths(month: string, k: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/**
 * Fit the last 24 months on the logit scale (so shares stay inside 0..1 and growth is multiplicative),
 * then project 12 months with a 95% prediction interval: se = s·√(1 + 1/n + (x₀ − x̄)² / Sxx).
 * growthPerYear = e^(12·b) − 1 (growth in the odds, ≈ growth in share for small shares).
 */
export function forecast(history: TrendPoint[], horizon = HORIZON): Pick<TrendSeries, "projection" | "growthPerYear" | "label"> {
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month));
  const win = sorted.slice(-FIT_WINDOW);
  if (!win.length) return { projection: [], growthPerYear: 0, label: "stable" };
  const xs = win.map((_, i) => i);
  const ys = win.map((p) => logit(clampShare(p.share)));
  const fit = olsFit(xs, ys);
  const growthPerYear = Math.exp(12 * fit.slope) - 1;
  const last = win[win.length - 1].month;
  const projection = Array.from({ length: horizon }, (_, k) => {
    const h = k + 1;
    const x0 = fit.n - 1 + h;
    const yhat = fit.intercept + fit.slope * x0;
    const se = fit.residualSE * Math.sqrt(1 + 1 / fit.n + (fit.sxx > 0 ? (x0 - fit.meanX) ** 2 / fit.sxx : 0));
    return {
      month: addMonths(last, h),
      share: round(sigmoid(yhat), 4),
      low: round(sigmoid(yhat - Z95 * se), 4),
      high: round(sigmoid(yhat + Z95 * se), 4),
    };
  });
  return { projection, growthPerYear: round(growthPerYear, 3), label: labelFor(growthPerYear) };
}

export function toSeries(skillId: SkillId, history: TrendPoint[]): TrendSeries {
  const h = [...history].sort((a, b) => a.month.localeCompare(b.month));
  return { skillId, history: h, ...forecast(h), source: "hn-whoishiring" };
}

// ---------- data ----------

function readJSON<T>(rel: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Recorded monthly history: a backfill in data/cache/trends-raw.json if present, else the fixture's history. */
export function recordedHistory(): Record<SkillId, TrendPoint[]> {
  const raw = readJSON<Record<SkillId, TrendPoint[]>>("data/cache/trends-raw.json");
  if (raw && Object.keys(raw).length) return raw;
  const fixture = readJSON<TrendSeries[]>("data/fixtures/trends.json") ?? [];
  return Object.fromEntries(fixture.map((s) => [s.skillId, s.history]));
}

let liveMemo: { at: number; data: TrendSeries[] } | null = null;
const LIVE_TTL_MS = 6 * 60 * 60 * 1000;

type HNShares = { threads: number; posts: number; months: number; shares: Record<SkillId, TrendPoint[]> };
const LIVE_MONTHS = 36;
/** Demo toggle key for the live HN backfill: Live mode records the monthly shares it read; Demo replays them. */
const hnKey = (months: number) => ({ op: "whoishiring-shares", months, skills: TREND_SKILLS });

/** Live HN backfill (opt-in with TRENDS_LIVE=true: ~36 threads × hundreds of posts, so it's slow and memoised). */
async function liveTrends(runId?: string, months = LIVE_MONTHS): Promise<TrendSeries[]> {
  if (liveMemo && Date.now() - liveMemo.at < LIVE_TTL_MS) return liveMemo.data;
  const hn = await replayOrRecord<HNShares>(
    "hn",
    hnKey(months),
    async () => {
      const threads = await listWhoIsHiring(months);
      if (runId) emit({ runId, agent: "trends", status: "progress", message: `Trend Forecaster: found ${threads.length} monthly hiring threads`, data: { threads: threads.length } });
      const withComments: { month: string; comments: string[] }[] = [];
      for (let i = 0; i < threads.length; i += 4) {
        const batch = await Promise.all(threads.slice(i, i + 4).map(async (t) => ({ month: t.month, comments: await getComments(t.id).catch(() => []) })));
        withComments.push(...batch);
      }
      const posts = withComments.reduce((a, t) => a + t.comments.length, 0);
      if (posts === 0) throw new Error("no HN posts");
      const shares = monthlyShares(withComments, TREND_SKILLS, (text) => matchSkills(text).keys());
      return { threads: threads.length, posts, months: withComments.length, shares };
    },
    {
      meta: { kind: "hn-whoishiring", label: `${months} months of HN Who is hiring? threads` },
      loose: false,
      validate: (v) => !!v && typeof v === "object" && typeof (v as HNShares).shares === "object",
      onReplay: (rec) => {
        if (runId) emit({ runId, agent: "trends", status: "progress", message: `Trend Forecaster: replayed ${rec.value.threads} monthly hiring threads from a real run (recorded ${formatRecordedAt(rec.recordedAt)})`, data: { threads: rec.value.threads, replay: true, recordedAt: rec.recordedAt } });
      },
    },
  );
  if (runId) emit({ runId, agent: "trends", status: "progress", message: `Trend Forecaster: read ${hn.posts} job posts across ${hn.months} months`, data: { posts: hn.posts, months: hn.months } });
  const data = Object.entries(hn.shares).filter(([, h]) => h.length >= 6).map(([id, h]) => toSeries(id, h));
  liveMemo = { at: Date.now(), data };
  return data;
}

async function buildTrends(runId?: string): Promise<TrendSeries[]> {
  // Demo mode replays a recorded live backfill when one exists, even without TRENDS_LIVE.
  if (process.env.TRENDS_LIVE === "true" || ((await canReplay()) && hasRecording("hn", hnKey(LIVE_MONTHS), { loose: false }))) {
    try {
      return await liveTrends(runId);
    } catch {
      if (runId) emit({ runId, agent: "trends", status: "progress", message: "Trend Forecaster: Hacker News didn't answer, so we used the recorded history" });
    }
  }
  // The projection is always recomputed from the history by forecast(), never copied from a file.
  return Object.entries(recordedHistory()).map(([id, h]) => toSeries(id, h));
}

export async function getTrends(skillIds?: SkillId[], opts: { runId?: string; demo?: boolean } = {}): Promise<TrendSeries[]> {
  const { runId } = opts;
  if (runId) emit({ runId, agent: "trends", status: "started", message: "Trend Forecaster: reading Hacker News hiring history" });
  const all = opts.demo
    ? readJSON<TrendSeries[]>("data/fixtures/trends.json") ?? []
    : await withCache("trends", () => buildTrends(runId), { fixture: "trends.json" });
  const wanted = skillIds?.length ? new Set(skillIds) : null;
  const out = wanted ? all.filter((s) => wanted.has(s.skillId)) : all;
  if (runId) {
    const rising = out.filter((s) => s.label === "rising").sort((a, b) => b.growthPerYear - a.growthPerYear);
    const top = rising[0];
    emit({
      runId, agent: "trends", status: "done",
      message: `Trend Forecaster: ${out.length} skills forecast, ${rising.length} rising${top ? ` · fastest ${top.skillId} +${Math.round(top.growthPerYear * 100)}%/yr` : ""}`,
      data: { skills: out.length, rising: rising.length, months: out[0]?.history.length ?? 0 },
    });
  }
  return out;
}

/** skillId → trend label, for joining onto market demand. */
export async function trendLabels(opts: { demo?: boolean } = {}): Promise<Map<SkillId, TrendLabel>> {
  const all = await getTrends(undefined, { demo: opts.demo }).catch(() => [] as TrendSeries[]);
  return new Map(all.map((s) => [s.skillId, s.label]));
}
