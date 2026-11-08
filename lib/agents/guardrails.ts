// Reusable guardrails for Keystone agents (pure functions, safe to import anywhere).
// Each guardrail returns { output, action: "pass" | "modified" | "blocked", detail? } and is applied
// by the harness (lib/agents/harness.ts) in order, or mid-run with ctx.guard() before a side effect.
import type { AgentCtx, Guardrail, GuardrailCtx, GuardrailResult } from "@/lib/agents/harness";

const MAX_DEPTH = 6;

/** Maps every string inside a value (strings, arrays, plain objects), skipping `skipKeys`. */
function mapStrings(value: unknown, fn: (s: string, key?: string) => string, skipKeys: ReadonlySet<string> = new Set(), depth = 0, key?: string): unknown {
  if (typeof value === "string") return fn(value, key);
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn, skipKeys, depth + 1, key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = skipKeys.has(k) ? v : mapStrings(v, fn, skipKeys, depth + 1, k);
  return out;
}

/** Visits every key/value pair (depth-limited). */
function walk(value: unknown, visit: (key: string | undefined, v: unknown) => void, depth = 0, key?: string): void {
  visit(key, value);
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit, depth + 1, key));
  else for (const [k, v] of Object.entries(value)) walk(v, visit, depth + 1, k);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- noFullSolutions ----------
export const MAX_CODE_LINES = 5;
export const CODE_REMOVED = "_(A longer code sample was removed here. Try writing this part yourself, then ask your reviewer.)_";
export const SOLUTION_REMOVED = "_(A full solution was offered here and removed. Try it yourself first, then ask your reviewer.)_";

/** Phrases that offer a finished answer. A line that says it WON'T give one is left alone. */
const SOLUTION_PHRASES: RegExp[] = [
  /\bhere(?:'s|’s| is)\s+(?:the\s+|a\s+|your\s+)?(?:full|complete|entire|finished|working)\s+(?:solution|code|implementation|answer)\b/i,
  /\b(?:full|complete|entire)\s+(?:working\s+)?(?:solution|implementation)\b/i,
  /\bcomplete\s+code\b(?!\s+review)/i,
  /\bcopy\s+(?:and|&)\s+paste\s+(?:this|the\s+following)\b/i,
];
const NEGATED = /\b(?:won't|won’t|will not|not going to|never|don't|don’t|do not|can't|can’t|cannot|without|instead of)\b/i;

/** Replaces fenced code blocks (``` or ~~~) longer than `maxLines` lines with a short note. Unclosed fences count too. */
export function stripLongCodeBlocks(text: string, maxLines = MAX_CODE_LINES): string {
  return stripCode(text, maxLines).text;
}

function stripCode(text: string, maxLines: number): { text: string; removed: number; longest: number } {
  const lines = text.split("\n");
  const out: string[] = [];
  let removed = 0;
  let longest = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (!open) { out.push(lines[i]); continue; }
    const fence = open[1];
    let j = i + 1;
    while (j < lines.length && !lines[j].trim().startsWith(fence)) j++;
    const content = lines.slice(i + 1, j);
    if (content.length > maxLines || j >= lines.length) {
      out.push(CODE_REMOVED);
      removed++;
      longest = Math.max(longest, content.length);
    } else out.push(...lines.slice(i, j + 1));
    i = j;
  }
  return { text: out.join("\n"), removed, longest };
}

/** Finds solution-offering phrases and replaces those lines with a nudge. */
function stripSolutionPhrases(text: string): { text: string; flagged: string[] } {
  const flagged: string[] = [];
  const lines = text.split("\n").map((line) => {
    for (const re of SOLUTION_PHRASES) {
      const m = line.match(re);
      if (!m) continue;
      const before = line.slice(0, m.index ?? 0);
      if (NEGATED.test(before)) continue;
      flagged.push(m[0].toLowerCase());
      return SOLUTION_REMOVED;
    }
    return line;
  });
  return { text: lines.join("\n"), flagged };
}

/** Strips fenced code blocks longer than 5 lines and lines that offer a full solution, in strings or string fields. */
export function noFullSolutions<O>(opts: { maxLines?: number } = {}): Guardrail<O> {
  const maxLines = opts.maxLines ?? MAX_CODE_LINES;
  return {
    name: "noFullSolutions",
    apply(output) {
      let removed = 0;
      let longest = 0;
      const flagged: string[] = [];
      const next = mapStrings(output, (s) => {
        if (!s.includes("\n") && s.length < 12) return s;
        const code = stripCode(s, maxLines);
        removed += code.removed;
        longest = Math.max(longest, code.longest);
        const phrases = stripSolutionPhrases(code.text);
        flagged.push(...phrases.flagged);
        return phrases.text;
      }) as O;
      if (!removed && !flagged.length) return { output, action: "pass" };
      const parts = [
        removed ? `stripped ${plural(removed, "code block")} (longest ${longest} lines)` : "",
        flagged.length ? `flagged "${[...new Set(flagged)].join('", "')}"` : "",
      ].filter(Boolean);
      return { output: next, action: "modified", detail: parts.join("; ") };
    },
  };
}

// ---------- noDemographicSignals ----------
/** Badge values that must never reach a scoring function. `new-to-uni` (tenure) is allowed for the near-peer mix rule. */
export const DEMOGRAPHIC_BADGES = ["international", "first-gen", "career-changer"] as const;
const DEMOGRAPHIC_KEYS = /^(nationality|ethnicity|race|gender|sex|religion|disability|age|dateOfBirth|dob|firstGen|international|careerChanger|homeCountry)$/i;

/** Lists demographic signals found anywhere in a value ("international ×2", "key:gender"). */
export function findDemographicSignals(value: unknown): string[] {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  walk(value, (key, v) => {
    if (key && DEMOGRAPHIC_KEYS.test(key)) bump(`key:${key}`);
    if (typeof v === "string" && (DEMOGRAPHIC_BADGES as readonly string[]).includes(v)) bump(v);
  });
  return [...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
}

/**
 * Blocks when the scoring inputs contain demographic signals. By default it inspects
 * `ctx.memo.scoringInputs` (what the agent actually scored), else the run input.
 */
export function noDemographicSignals<O>(opts: { inputs?: (output: O, ctx: GuardrailCtx) => unknown } = {}): Guardrail<O> {
  return {
    name: "noDemographicSignals",
    apply(output, ctx) {
      const inspected = opts.inputs ? opts.inputs(output, ctx) : (ctx.memo.scoringInputs ?? ctx.input);
      const found = findDemographicSignals(inspected);
      if (found.length) return { output, action: "blocked", detail: `scoring inputs contain ${found.join(", ")}` };
      const n = Array.isArray(inspected) ? inspected.length : undefined;
      return { output, action: "pass", detail: n !== undefined ? `${plural(n, "scoring input")} checked: skills, interests, availability, tenure only` : undefined };
    },
  };
}

// ---------- anonymityThreshold ----------
/**
 * Aggregates about fewer than `n` people are suppressed: every array field is emptied and
 * `suppressed: true` is set. The size comes from `opts.size`, else `cohortSize` / `n` / `count`.
 */
export function anonymityThreshold<O>(n = 10, opts: { size?: (output: O) => number | undefined } = {}): Guardrail<O> {
  return {
    name: "anonymityThreshold",
    apply(output) {
      const o = output as unknown as Record<string, unknown>;
      const size = opts.size
        ? opts.size(output)
        : [o?.cohortSize, o?.n, o?.count].find((x): x is number => typeof x === "number");
      if (size === undefined) return { output, action: "pass", detail: "no group size to check" };
      if (size >= n) return { output, action: "pass", detail: `group of ${size} (≥ ${n})` };
      if (Array.isArray(output)) return { output: [] as unknown as O, action: "modified", detail: `group of ${size} < ${n}: suppressed` };
      const next: Record<string, unknown> = { ...o, suppressed: true };
      for (const [k, v] of Object.entries(next)) if (Array.isArray(v)) next[k] = [];
      return { output: next as O, action: "modified", detail: `group of ${size} < ${n}: suppressed` };
    },
  };
}

// ---------- piiRedactor ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Phone numbers start with +, 0 or "(" and have 10–15 digits (UK 07700 900123, +44 161 123 4567, (0161) 123-4567).
const PHONE_RE = /(?<![\w/.:#=-])(?:\+\d{1,3}[\s.-]?|\(0?\d{2,5}\)[\s.-]?|0)\d[\d\s.-]{6,16}\d(?![\w/-])/g;

/** Redacts emails and phone numbers (before text goes to an LLM). */
export function redactPII(text: string): string {
  return redactCount(text).text;
}

export function redactCount(text: string): { text: string; emails: number; phones: number } {
  let emails = 0;
  let phones = 0;
  const noEmails = text.replace(EMAIL_RE, () => { emails++; return "[email]"; });
  const out = noEmails.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "").length;
    if (digits < 10 || digits > 15) return m;
    phones++;
    return "[phone]";
  });
  return { text: out, emails, phones };
}

/** Redacts every string field (skipping `skipKeys`, e.g. URLs that must round-trip). */
export function redactDeep<T>(value: T, skipKeys: string[] = []): { value: T; emails: number; phones: number } {
  let emails = 0;
  let phones = 0;
  const next = mapStrings(value, (s) => {
    const r = redactCount(s);
    emails += r.emails;
    phones += r.phones;
    return r.text;
  }, new Set(skipKeys)) as T;
  return { value: next, emails, phones };
}

const piiDetail = (emails: number, phones: number, where: string) =>
  emails || phones ? `redacted ${[emails ? plural(emails, "email") : "", phones ? plural(phones, "phone number") : ""].filter(Boolean).join(" and ")} ${where}` : `no emails or phone numbers ${where}`;

/** Output guardrail: redacts emails and phone numbers in string fields. */
export function piiRedactor<O>(opts: { skipKeys?: string[] } = {}): Guardrail<O> {
  return {
    name: "piiRedactor",
    apply(output) {
      const r = redactDeep(output, opts.skipKeys);
      return r.emails || r.phones
        ? { output: r.value, action: "modified", detail: piiDetail(r.emails, r.phones, "in the output") }
        : { output, action: "pass" };
    },
  };
}

/** Input-side redaction: redacts a prompt payload before it goes to an LLM and records a piiRedactor finding. */
export function redactForLLM<T>(ctx: Pick<AgentCtx, "record">, value: T, skipKeys: string[] = []): T {
  const r = redactDeep(value, skipKeys);
  ctx.record({ name: "piiRedactor", action: r.emails || r.phones ? "modified" : "pass", detail: piiDetail(r.emails, r.phones, "in the LLM input") });
  return r.value;
}

// ---------- noOutboundMessaging ----------
const SEND_KEYS = /^(send|sent|sendAt|sendNow|autoSend|autoSent|post|posted|postTo|postUrl|publish|dispatch|deliver|deliverTo|recipient|recipients|to|cc|bcc|toEmail|emailTo|webhook|webhookUrl|mailto|channelId)$/i;

/** Blocks an output that carries send/post intent (a recipient, a webhook, an auto-send flag, a mailto: link). */
export function noOutboundMessaging<O>(): Guardrail<O> {
  return {
    name: "noOutboundMessaging",
    apply(output) {
      const hits = new Set<string>();
      walk(output, (key, v) => {
        if (key && SEND_KEYS.test(key) && v !== undefined && v !== null && v !== false) hits.add(key);
        if (typeof v === "string" && /^\s*mailto:/i.test(v)) hits.add("mailto link");
      });
      return hits.size
        ? { output, action: "blocked", detail: `send intent: ${[...hits].join(", ")}` }
        : { output, action: "pass", detail: "drafts only: nothing is sent" };
    },
  };
}

// ---------- maxItems ----------
/** Caps an array output (or `opts.field` of an object output) at `n` items. */
export function maxItems<O>(n: number, opts: { field?: string } = {}): Guardrail<O> {
  return {
    name: "maxItems",
    apply(output): GuardrailResult<O> {
      const o = output as unknown as Record<string, unknown>;
      const list = opts.field ? o?.[opts.field] : output;
      if (!Array.isArray(list)) return { output, action: "pass" };
      if (list.length <= n) return { output, action: "pass", detail: `${list.length} ≤ ${n}` };
      const capped = list.slice(0, n);
      const next = (opts.field ? { ...o, [opts.field]: capped } : capped) as O;
      return { output: next, action: "modified", detail: `capped ${opts.field ?? "items"} at ${n} (was ${list.length})` };
    },
  };
}
