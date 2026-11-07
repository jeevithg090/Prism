// Display helpers for the Skill Half-life Radar (pure).
import type { ModuleHalfLife } from "@/lib/labs/halflife/schema";

export const yrs = (y: number) => `${y.toFixed(1)} years`;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Small shares keep one decimal: 0.039 → "3.9%". */
export const share = (x: number) => { const v = x * 100; return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`; };
export const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2029-10" → "Oct 2029". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MONTHS[(m ?? 1) - 1] ? `${MONTHS[m - 1]} ${y}` : month;
}

export type Band = "now" | "soon" | "watch" | "fresh";
export function band(urgency: number): Band {
  return urgency >= 25 ? "now" : urgency >= 10 ? "soon" : urgency > 0 ? "watch" : "fresh";
}
export const BAND_LABEL: Record<Band, string> = { now: "Refresh now", soon: "Refresh soon", watch: "Watch", fresh: "Up to date" };

/** One short phrase for a module's demand outlook. */
export function lifeLabel(m: Pick<ModuleHalfLife, "status" | "halfLifeYears">): string {
  if (m.status === "decaying" && m.halfLifeYears !== null) return `Half-life ${yrs(m.halfLifeYears)}`;
  if (m.status === "growing") return "Demand growing";
  if (m.status === "durable") return "Durable, over 20 years";
  return "Foundations, no trend tracked";
}

/** "A", "A and B", "A, B and C". */
export const andList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const ROLE_NAMES: Record<string, string> = { "ml-engineer": "ML engineer", "software-engineer": "software engineer", "data-analyst": "data analyst" };
export const roleName = (id: string) => ROLE_NAMES[id] ?? id.replace(/-/g, " ");

/** A 3-year horizon is when this year's first-years graduate (3-year BSc); other horizons are named by their date. */
export const GRADUATION_YEARS = 3;
export const isGraduation = (horizonYears: number) => horizonYears === GRADUATION_YEARS;
/** "by graduation" at 3 years, else "by Oct 2031". */
export const byHorizon = (horizonYears: number, horizonMonth: string) =>
  isGraduation(horizonYears) ? "by graduation" : `by ${monthLabel(horizonMonth)}`;
/** The label on the horizon line of the decay curve: "Graduation" or "In 5 years". */
export const horizonLineLabel = (horizonYears: number) =>
  isGraduation(horizonYears) ? "Graduation" : `In ${horizonYears} ${horizonYears === 1 ? "year" : "years"}`;
