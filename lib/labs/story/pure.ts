// Story Mode pure helpers: grounding, live-check comparison, pacing and text cleanup. No I/O.
import { groundAnswer } from "@/lib/agents/coach/grounding";
import type { StoryFact, StoryVerify } from "./schema";

/** Words a presenter speaks per second (about 150 wpm). */
export const WORDS_PER_SECOND = 2.5;
export const MIN_SECONDS = 7;
export const MAX_SECONDS = 24;

/** On-screen time for a narration: reading pace plus a breath, clamped. */
export function secondsFor(narration: string): number {
  const words = narration.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(words / WORDS_PER_SECOND + 2)));
}

/**
 * The Coach's grounding check, reused: every number in the narration must trace back to one of the beat's
 * facts (0.38 also allows 38). Untraceable numbers are rewritten out, or their sentence is dropped.
 */
export function groundNarration(narration: string, facts: StoryFact[]): { narration: string; checked: string[]; removed: string[] } {
  const record: Record<string, string | number> = {};
  for (const f of facts) {
    record[f.key] = f.value;
    record[`${f.key}__display`] = f.display;
  }
  const r = groundAnswer(narration, { facts: record, sources: [] });
  return { narration: r.answer, checked: r.checked, removed: r.removed };
}

/** Reads a dot path ("weeks.0.receipt.demandPct", "members.length") from a JSON value. */
export function pickPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (part === "length" && (Array.isArray(cur) || typeof cur === "string")) { cur = cur.length; continue; }
    if (Array.isArray(cur)) {
      const i = Number(part);
      cur = Number.isInteger(i) ? cur[i] : undefined;
      continue;
    }
    if (typeof cur !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function formatVerify(v: unknown, format: StoryVerify["format"]): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (format === "pct") return `${Math.round((v <= 1 ? v * 100 : v))}%`;
    return String(Math.round(v * 100) / 100);
  }
  if (typeof v === "string") return v;
  return v === undefined ? "missing" : JSON.stringify(v).slice(0, 40);
}

export type VerifyOutcome = { status: "match" | "changed" | "missing"; actual: string; expected: string };

/** Compares what the live API returns now with what the script says (numbers within half a percent). */
export function compareVerify(verify: Pick<StoryVerify, "pick" | "expect" | "format">, data: unknown): VerifyOutcome {
  const actual = pickPath(data, verify.pick);
  const expected = formatVerify(verify.expect, verify.format);
  if (actual === undefined || actual === null) return { status: "missing", actual: "missing", expected };
  if (typeof verify.expect === "number" && typeof actual === "number") {
    const tol = verify.format === "pct" && verify.expect <= 1 ? 0.005 : 0.5;
    return { status: Math.abs(actual - verify.expect) <= tol ? "match" : "changed", actual: formatVerify(actual, verify.format), expected };
  }
  return { status: String(actual) === String(verify.expect) ? "match" : "changed", actual: formatVerify(actual, verify.format), expected };
}

/** Markdown hint → something a voice can read: no bold, code ticks, links or "See …" tails. */
export function speakable(markdown: string): string {
  return markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*(?:See|Compare)\b[^.?!]*https?:\/\/\S+/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** "**Layer caching:** question… See https://…" → { topic: "Layer caching", question: first question sentence }. */
export function splitHint(markdown: string): { topic: string; question: string } {
  const m = markdown.match(/^\*\*([^*]+?):?\*\*:?\s*([\s\S]*)$/);
  const topic = (m?.[1] ?? "Question").replace(/:$/, "").trim();
  const body = speakable(m?.[2] ?? markdown);
  const firstQuestion = body.match(/^[^?]*\?/)?.[0]?.trim();
  return { topic, question: (firstQuestion ?? body).slice(0, 220) };
}

export const pct = (x: number) => Math.round(x * 100);

/** "Docker, PyTorch and SQL". */
export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
