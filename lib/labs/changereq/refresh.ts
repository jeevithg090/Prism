// The weekly refresh: one new month of hiring-thread shares per skill, a re-weighted ad sample, and the
// Trend Forecaster's own OLS-on-logit model refitted on the new history. Deterministic: DEMO_MODE replays a
// recorded scenario (data/fixtures/labs/changereq.refresh.json); otherwise the shocks are a seeded hash of the
// ISO week, so the same week always gives the same refresh. Both are labelled "simulated" in the UI.
import { addMonths, toSeries, FIT_WINDOW } from "@/lib/agents/trends";
import type { RoleDemand, SkillId, TrendSeries } from "@/lib/types";

export type Shock = { trend: number; market: number };
export interface Scenario {
  id: string;
  label: string;
  /** YYYY-MM of the new data point; defaults to the month after the last recorded one. */
  month?: string;
  simulated: boolean;
  shocks: Record<SkillId, Shock>;
}

export interface Refreshed {
  scenario: Scenario;
  month: string;
  trends: TrendSeries[];
  market: RoleDemand | null;
  seriesRefit: number;
  monthsFit: number;
}

const round = (v: number, dp: number) => Number(v.toFixed(dp));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** ISO-8601 week id, "2026-W46". */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

/** FNV-1a 32-bit, mapped to [-1, 1). */
function unit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h / 0x1_0000_0000) * 2 - 1;
}

/** A seeded weekly scenario (outside DEMO_MODE): small, reproducible moves for every tracked skill. */
export function weeklyScenario(now: Date, skills: SkillId[]): Scenario {
  const week = isoWeek(now);
  const shocks: Record<SkillId, Shock> = {};
  for (const s of skills) shocks[s] = { trend: round(unit(`${week}:${s}:t`) * 0.3, 3), market: round(unit(`${week}:${s}:m`) * 0.03, 3) };
  return { id: `refresh_${week}`, label: `Weekly refresh, ${week}`, simulated: true, shocks };
}

/**
 * Appends one month to each series (the last recorded share × (1 + trend shock)) and refits the forecast with
 * trends.ts `toSeries` (OLS on logit share over the last 24 months). Skills without a shock still get their
 * new month at the last recorded share, so every series is refitted on the same window.
 */
export function refreshTrends(trends: TrendSeries[], scenario: Scenario): { trends: TrendSeries[]; month: string } {
  const lastMonth = trends.map((t) => t.history.at(-1)?.month ?? "").sort().at(-1) ?? "";
  const month = scenario.month ?? (lastMonth ? addMonths(lastMonth, 1) : "");
  const next = trends.map((t) => {
    const hist = [...t.history].sort((a, b) => a.month.localeCompare(b.month)).filter((p) => p.month !== month);
    const last = hist.at(-1)?.share ?? 0;
    const shock = scenario.shocks[t.skillId]?.trend ?? 0;
    const share = round(clamp(last * (1 + shock), 0.0001, 0.9999), 4);
    return toSeries(t.skillId, [...hist, { month, share }]);
  });
  return { trends: next, month };
}

/** Shifts each skill's share of ads by its market shock (percentage points as a 0..1 delta), re-sorted. */
export function refreshMarket(market: RoleDemand | null, scenario: Scenario, trends: TrendSeries[]): RoleDemand | null {
  if (!market) return null;
  const label = new Map(trends.map((t) => [t.skillId, t.label]));
  const skills = market.skills
    .map((s) => {
      const share = round(clamp(s.share + (scenario.shocks[s.skillId]?.market ?? 0), 0, 1), 3);
      const trend = label.get(s.skillId) ?? s.trend;
      return { ...s, share, ...(trend ? { trend } : {}) };
    })
    .sort((a, b) => b.share - a.share || a.skillId.localeCompare(b.skillId));
  return { ...market, skills };
}

export function applyRefresh(trends: TrendSeries[], market: RoleDemand | null, scenario: Scenario): Refreshed {
  const t = refreshTrends(trends, scenario);
  return {
    scenario,
    month: t.month,
    trends: t.trends,
    market: refreshMarket(market, scenario, t.trends),
    seriesRefit: t.trends.length,
    monthsFit: Math.min(FIT_WINDOW, t.trends[0]?.history.length ?? 0),
  };
}
