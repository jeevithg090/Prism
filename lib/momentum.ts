// P5 · Momentum: rank students on growth, not on absolute output.
// Pure functions only (no store, no fs), so client components can use them too.
import type { MomentumWeek } from "@/lib/types";

export type MomentumKind = "pr-merged" | "roadmap-milestone" | "helped-newcomer" | "mock-interview" | "problem-solved";

export const POINTS: Record<MomentumKind, number> = {
  "pr-merged": 5,
  "roadmap-milestone": 4,
  "helped-newcomer": 3,
  "mock-interview": 3,
  "problem-solved": 1,
};

/** Display/breakdown order: biggest steps first. */
export const MOMENTUM_KINDS = Object.keys(POINTS) as MomentumKind[];

/** Anti-gaming: each kind counts at most 5 events a week… */
export const MAX_EVENTS_PER_KIND = 5;
/** …except problem-solved, which is capped by points instead (10 a week). */
export const PROBLEM_SOLVED_WEEKLY_CAP = 10;
/** Number of weeks returned by computeMomentum. */
export const MOMENTUM_WEEKS = 6;
/** Number of previous weeks averaged into the baseline. */
export const BASELINE_WEEKS = 4;

const DAY_MS = 86_400_000;

function isKind(k: string): k is MomentumKind {
  return Object.prototype.hasOwnProperty.call(POINTS, k);
}

/** ISO-8601 week of a date in UTC, e.g. 2026-11-07 → "2026-W45", 2027-01-01 → "2026-W53". */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon = 1 … Sun = 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the week-year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday 00:00 UTC of the ISO week containing `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d;
}

/** Score one week's (already deduped) events with the anti-gaming caps. */
export function scoreWeek(kinds: string[]): { score: number; breakdown: MomentumWeek["breakdown"] } {
  const counts = new Map<MomentumKind, number>();
  for (const k of kinds) if (isKind(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const breakdown: MomentumWeek["breakdown"] = [];
  for (const kind of MOMENTUM_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (!count) continue;
    const points = kind === "problem-solved"
      ? Math.min(count * POINTS[kind], PROBLEM_SOLVED_WEEKLY_CAP)
      : Math.min(count, MAX_EVENTS_PER_KIND) * POINTS[kind];
    breakdown.push({ kind, points, count });
  }
  return { score: breakdown.reduce((s, b) => s + b.points, 0), breakdown };
}

/**
 * Weekly momentum for one user: the last 6 ISO weeks ending at `now`'s week, oldest first.
 * Events are filtered by userId and deduped by kind+timestamp; unknown kinds and bad dates are ignored.
 * baseline = mean score of the previous 4 weeks (minimum 1); changePct = round((score − baseline) / baseline × 100).
 * A week with no activity after weeks with no activity reports 0% (not −100%).
 */
export function computeMomentum(
  events: { userId: string; kind: string; ts: string }[],
  userId: string,
  now: Date = new Date(),
): MomentumWeek[] {
  const seen = new Set<string>();
  const byWeek = new Map<string, string[]>();
  for (const e of events) {
    if (e.userId !== userId || !isKind(e.kind)) continue;
    const t = new Date(e.ts);
    if (Number.isNaN(t.getTime())) continue;
    const key = `${e.kind}|${t.toISOString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = isoWeek(t);
    const list = byWeek.get(w);
    if (list) list.push(e.kind);
    else byWeek.set(w, [e.kind]);
  }

  const total = MOMENTUM_WEEKS + BASELINE_WEEKS;
  const monday = mondayOf(now);
  const scored = Array.from({ length: total }, (_, i) => {
    const week = isoWeek(new Date(monday.getTime() - (total - 1 - i) * 7 * DAY_MS));
    return { week, ...scoreWeek(byWeek.get(week) ?? []) };
  });

  return scored.slice(BASELINE_WEEKS).map((w, j) => {
    const prev = scored.slice(j, j + BASELINE_WEEKS);
    const mean = prev.reduce((s, p) => s + p.score, 0) / BASELINE_WEEKS;
    const baseline = Math.max(1, mean);
    const changePct = w.score === 0 && mean === 0 ? 0 : Math.round(((w.score - baseline) / baseline) * 100);
    return { userId, week: w.week, score: w.score, baseline: Math.round(baseline * 100) / 100, changePct, breakdown: w.breakdown };
  });
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** One breakdown entry in plain English, e.g. "2 merged PRs", "helped 1 newcomer". */
export function describeKind(kind: string, count: number): string {
  switch (kind) {
    case "pr-merged": return `${count} merged ${plural(count, "PR")}`;
    case "roadmap-milestone": return `${count} ${plural(count, "milestone")}`;
    case "helped-newcomer": return `helped ${count} ${plural(count, "newcomer")}`;
    case "mock-interview": return `${count} mock ${plural(count, "interview")}`;
    case "problem-solved": return `${count} ${plural(count, "problem")} solved`;
    default: return `${count} × ${kind}`;
  }
}

/** "2 merged PRs · 1 milestone · helped 1 newcomer" ("" when there's nothing yet). */
export function describeBreakdown(breakdown: MomentumWeek["breakdown"]): string {
  return breakdown.filter((b) => b.count > 0).map((b) => describeKind(b.kind, b.count)).join(" · ");
}

/** "+18%", "0%", "−12%" (typographic minus). */
export function formatChange(changePct: number): string {
  if (changePct > 0) return `+${changePct}%`;
  if (changePct < 0) return `−${Math.abs(changePct)}%`;
  return "0%";
}

/** Drop repeated events (same kind + same instant); keeps the first occurrence. */
export function dedupeEvents<E extends { kind: string; ts: string }>(events: E[]): E[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const t = new Date(e.ts);
    const key = `${e.kind}|${Number.isNaN(t.getTime()) ? e.ts : t.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Newest first (unparseable dates last). */
export function newestFirst<E extends { ts: string }>(events: E[]): E[] {
  const t = (e: E) => { const n = Date.parse(e.ts); return Number.isNaN(n) ? -Infinity : n; };
  return [...events].sort((a, b) => t(b) - t(a));
}

/** Fallback Build Log text for an event stored without a label. */
export const DEFAULT_EVENT_LABEL: Record<MomentumKind, string> = {
  "pr-merged": "Merged a pull request",
  "roadmap-milestone": "Completed a roadmap milestone",
  "helped-newcomer": "Helped a newcomer",
  "mock-interview": "Practised a mock interview",
  "problem-solved": "Solved a coding problem",
};
