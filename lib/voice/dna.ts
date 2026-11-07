// Maps the Onboarding Coach's `save_dna` client-tool parameters to a Partial<LearningDNA> (contract §5).
// Pure and client-safe: the coach's values come from speech, so every field is normalised defensively
// and anything we can't understand is dropped rather than guessed.
import type { LearningDNA } from "@/lib/types";
import { roleName } from "./roles";

/** Parameters the ElevenLabs agent sends to the `save_dna` client tool (see voice/agents.md). */
export interface SaveDnaParams {
  targetRoles?: string[] | string;
  timelineLabel?: string;
  hoursPerWeek?: number | string;
  theoryPractice?: number | string;
  budget?: string;
  constraints?: string[] | string;
}

export const KNOWN_ROLE_IDS = ["ml-engineer", "software-engineer", "data-analyst"] as const;
type KnownRoleId = (typeof KNOWN_ROLE_IDS)[number];

const MAX_ROLES = 2;
const MAX_CONSTRAINTS = 6;
const MAX_TEXT = 120;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// Splits a spoken list. Only role lists split on "and" ("ML engineer and data analyst"); for free-text
// constraints "and" is usually part of the phrase ("caring for my brother and sister").
function toStringList(v: unknown, splitOnAnd = false): string[] {
  const sep = splitOnAnd ? /,|;|\band\b/i : /,|;/;
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(sep) : [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT))
    .filter((s) => s.length > 0);
}

/** "ML engineer" / "machine learning engineer" / "ml-engineer" -> "ml-engineer"; unknown -> undefined. */
export function normaliseRoleId(spoken: string): KnownRoleId | undefined {
  const s = spoken.toLowerCase().replace(/[-_\s]+/g, " ").trim();
  const asId = s.replace(/ /g, "-");
  if ((KNOWN_ROLE_IDS as readonly string[]).includes(asId)) return asId as KnownRoleId;
  if (/machine learning|\bml\b|\bai engineer|\bmlops\b/.test(s)) return "ml-engineer";
  if (/\bdata analy|\banalyst\b|\bbusiness intelligence\b|\bbi analyst\b/.test(s)) return "data-analyst";
  if (/software|developer|\bswe\b|\bsde\b|back ?end|front ?end|full ?stack|web dev|programmer/.test(s)) return "software-engineer";
  return undefined;
}

function mapRoles(v: unknown): string[] | undefined {
  const ids: string[] = [];
  for (const s of toStringList(v, true)) {
    const id = normaliseRoleId(s);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.length ? ids.slice(0, MAX_ROLES) : undefined;
}

function mapHours(v: unknown): number | undefined {
  const n = toNumber(v);
  return n === undefined ? undefined : clamp(Math.round(n), 1, 40);
}

function mapTheoryPractice(v: unknown): number | undefined {
  let n = toNumber(v);
  if (n === undefined) return undefined;
  // Agents sometimes send a 0..1 fraction ("0.7" = 70% practice). Only a value with a fractional part
  // can be a fraction: whole numbers (0, 1, 50) are read as the 0–100 percent the tool schema declares.
  if (n > 0 && n < 1) n = n * 100;
  return clamp(Math.round(n), 0, 100);
}

const FREE_WORDS = new Set(["free", "free only", "free-only", "only free", "no budget", "none", "nothing", "zero"]);
const PAID_WORDS = new Set(["paid-ok", "paid ok", "paid", "paid is ok", "paid is fine", "happy to pay", "can pay", "ok to pay"]);

const MENTIONS_PAY = /\bpa(y|id|ying)\b/;
// Phrases that sound negative but say paying is fine ("I don't mind if it's paid").
const TOLERANT_NEGATIONS = /\b(don'?t mind|do not mind|no problem|not a problem)\b/g;
const TOLERANT = /\b(don'?t mind|do not mind|no problem|not a problem|happy to|willing to|fine|ok|okay)\b/;
// A refusal close to the pay word: "can't pay", "don't want to pay", "no paid courses", "rather not pay".
const REFUSES_PAY = /\b(no|not|never|can'?t|cannot|don'?t|won'?t|wouldn'?t)\s+(?:[\w']+\s+){0,3}?pa(y|id|ying)\b/;

function mapBudget(v: unknown): LearningDNA["budget"] | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase().replace(/\u2019/g, "'").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (FREE_WORDS.has(s)) return "free";
  if (PAID_WORDS.has(s)) return "paid-ok";
  if (MENTIONS_PAY.test(s)) {
    const refuses = REFUSES_PAY.test(s.replace(TOLERANT_NEGATIONS, " "));
    const tolerant = TOLERANT.test(s);
    if (refuses && tolerant) return undefined; // Mixed signals: let the student pick in the form.
    return refuses ? "free" : "paid-ok";
  }
  if (/\bfree\b/.test(s)) return "free";
  return undefined;
}

function mapTimeline(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT);
  return s.length ? s : undefined;
}

function mapConstraints(v: unknown): string[] | undefined {
  const out: string[] = [];
  for (const s of toStringList(v)) {
    if (/^(none|no|nothing|n\/a|no constraints)$/i.test(s)) continue;
    if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.length ? out.slice(0, MAX_CONSTRAINTS) : undefined;
}

/**
 * Normalise the coach's `save_dna` values into a Partial<LearningDNA>.
 * Clamps hoursPerWeek to 1–40 and theoryPractice to 0–100 (rounded), keeps only known role ids (max 2),
 * maps budget to "free" | "paid-ok", and omits every field that is missing or unusable.
 */
export function mapToDNA(p: SaveDnaParams | Record<string, unknown> | null | undefined): Partial<LearningDNA> {
  if (!p || typeof p !== "object") return {};
  const src = p as Record<string, unknown>;
  const dna: Partial<LearningDNA> = {
    targetRoles: mapRoles(src.targetRoles),
    timelineLabel: mapTimeline(src.timelineLabel),
    hoursPerWeek: mapHours(src.hoursPerWeek),
    theoryPractice: mapTheoryPractice(src.theoryPractice),
    budget: mapBudget(src.budget),
    constraints: mapConstraints(src.constraints),
  };
  for (const k of Object.keys(dna) as (keyof LearningDNA)[]) {
    if (dna[k] === undefined) delete dna[k];
  }
  return dna;
}

export interface DnaSummaryRow {
  key: keyof LearningDNA;
  label: string;
  value: string;
}

/** Human-readable rows for the confirmation sheet, in form order. */
export function summariseDNA(dna: Partial<LearningDNA>): DnaSummaryRow[] {
  const rows: DnaSummaryRow[] = [];
  if (dna.targetRoles?.length) {
    rows.push({ key: "targetRoles", label: dna.targetRoles.length > 1 ? "Target roles" : "Target role", value: dna.targetRoles.map(roleName).join(" + ") });
  }
  if (dna.timelineLabel) rows.push({ key: "timelineLabel", label: "Timeline", value: dna.timelineLabel });
  if (dna.hoursPerWeek !== undefined) {
    rows.push({ key: "hoursPerWeek", label: "Time each week", value: `${dna.hoursPerWeek} ${dna.hoursPerWeek === 1 ? "hour" : "hours"}` });
  }
  if (dna.theoryPractice !== undefined) {
    const tp = dna.theoryPractice;
    rows.push({ key: "theoryPractice", label: "Theory or practice", value: `${100 - tp}% theory · ${tp}% practice` });
  }
  if (dna.budget) rows.push({ key: "budget", label: "Budget", value: dna.budget === "free" ? "Free resources only" : "Paid courses are OK" });
  if (dna.constraints?.length) rows.push({ key: "constraints", label: "Things to plan around", value: dna.constraints.join(", ") });
  return rows;
}
