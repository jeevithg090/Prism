import path from "node:path";
import { readJson, withCache } from "@/lib/cache";
import type { SkillId, TrendLabel, TrendPoint, TrendSeries } from "@/lib/types";

const WINDOW = 24;
const HORIZON = 12;
const RISING = 0.15;

const clamp = (p: number) => Math.min(1 - 1e-4, Math.max(1e-4, p));
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function forecast(history: TrendPoint[]): Pick<TrendSeries, "projection" | "growthPerYear" | "label"> {
  const points = history.slice(-WINDOW);
  const n = points.length;
  const ys = points.map((p) => logit(clamp(p.share)));
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = ys.reduce((sum, _, x) => sum + (x - xMean) ** 2, 0);
  const b = sxx ? ys.reduce((sum, y, x) => sum + (x - xMean) * (y - yMean), 0) / sxx : 0;
  const a = yMean - b * xMean;
  const rss = ys.reduce((sum, y, x) => sum + (y - (a + b * x)) ** 2, 0);
  const s = n > 2 ? Math.sqrt(rss / (n - 2)) : 0;

  const growthPerYear = Math.exp(12 * b) - 1;
  const label: TrendLabel = growthPerYear > RISING ? "rising" : growthPerYear < -RISING ? "declining" : "stable";
  const last = points[n - 1].month;
  const projection = Array.from({ length: HORIZON }, (_, i) => {
    const h = i + 1;
    const x0 = n - 1 + h;
    const yhat = a + b * x0;
    const se = s * Math.sqrt(1 + 1 / n + (sxx ? (x0 - xMean) ** 2 / sxx : 0));
    return {
      month: addMonths(last, h),
      share: sigmoid(yhat),
      low: sigmoid(yhat - 1.96 * se),
      high: sigmoid(yhat + 1.96 * se),
    };
  });
  return { projection, growthPerYear, label };
}

export function buildSeries(raw: Record<SkillId, TrendPoint[]>): TrendSeries[] {
  return Object.entries(raw).map(([skillId, history]) => ({
    skillId, history, ...forecast(history), source: "hn-whoishiring",
  }));
}

async function loadSeries(): Promise<TrendSeries[]> {
  const raw = await readJson<Record<SkillId, TrendPoint[]>>(path.join(process.cwd(), "data/cache/trends-raw.json"));
  if (raw) return buildSeries(raw);
  return (await readJson<TrendSeries[]>(path.join(process.cwd(), "data/fixtures/trends.json"))) ?? [];
}

export async function getTrends(skillIds?: SkillId[]): Promise<TrendSeries[]> {
  const all = await withCache("trends", loadSeries, { fixture: "trends.json" });
  if (!skillIds) return all;
  const wanted = new Set(skillIds);
  return all.filter((t) => wanted.has(t.skillId));
}
