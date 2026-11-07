// P5 · Keystone Coach "reflect" step: the grounding check (evaluator pattern, principle 3 + 10).
// Every number or percentage in a draft answer must trace back to the student context facts or a tool
// observation. Ungrounded numbers are rewritten out of their sentence (or the sentence is dropped).
import type { Facts } from "./context";

// A standalone number: not part of a word or code ("COMP2xxx2", "W45", "pod_ab12"), optional decimals / %.
const NUM_RE = /(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?%?(?![\w])/g;
const QUAL = "(?:about |around |roughly |over |nearly |almost |only |just |up to |more than |less than )?";

/** "41%" → "41", "1,200" → "1200", "0.820" → "0.82". */
export function normalizeNumber(token: string): string {
  const n = Number(token.replace(/[%,]/g, ""));
  return Number.isFinite(n) ? String(n) : token;
}

export function numbersIn(text: string): string[] {
  return text.match(NUM_RE) ?? [];
}

/** Every number the Coach may cite: fact values (0.41 also allows 41) and numbers inside source texts. */
export function allowedNumbers(facts: Facts, sources: string[]): Set<string> {
  const allowed = new Set<string>();
  const addText = (s: string) => numbersIn(s).forEach((t) => allowed.add(normalizeNumber(t)));
  for (const v of Object.values(facts)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      allowed.add(String(v));
      if (v > 0 && v < 1) allowed.add(String(Math.round(v * 100)));
    } else if (typeof v === "string") {
      addText(v);
    }
  }
  sources.forEach((s) => s && addText(s));
  return allowed;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rewrites one sentence without `token`; returns null when the sentence should be dropped. */
function rewriteWithout(sentence: string, token: string): string | null {
  const t = esc(token);
  const isPct = token.endsWith("%");
  type Rule = { re: RegExp; rep: (match: string, group: string) => string };
  const rules: Rule[] = [
    { re: new RegExp(`${QUAL}${t} of (?:all |the )?`, "i"), rep: () => "many " },
    { re: new RegExp(`${QUAL}${t} (week|day|hour|month|year|minute)s?\\b`, "i"), rep: (_m, unit) => `a few ${unit}s` },
  ];
  if (isPct) rules.push({ re: new RegExp(`\\s*(?:to|by|at|from|of|is|was|reaches|hits)?\\s*${QUAL}${t}`, "i"), rep: () => "" });
  else rules.push({ re: new RegExp(`${QUAL}${t} ([a-z]+s)\\b`, "i"), rep: (_m, noun) => `several ${noun}` });
  for (const { re, rep } of rules) {
    if (re.test(sentence)) {
      const out = sentence.replace(re, rep).replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
      if (!numbersIn(out).some((x) => x === token) && out.replace(/[^a-z]/gi, "").length > 12) return out;
    }
  }
  return null;
}

export interface GroundingResult {
  answer: string;
  /** Numbers that could not be traced and were rewritten out. */
  removed: string[];
  /** Numbers that were checked and are grounded. */
  checked: string[];
}

export const GROUNDING_FALLBACK = "I left out a number I couldn't check against your data. Ask me again and I'll look it up with a tool.";

/** The grounding check. Pure and deterministic. */
export function groundAnswer(draft: string, opts: { facts: Facts; sources: string[] }): GroundingResult {
  const allowed = allowedNumbers(opts.facts, opts.sources);
  const removed: string[] = [];
  const checked: string[] = [];
  const paragraphs = draft.split("\n").map((para) => {
    const kept: string[] = [];
    for (const original of para.split(/(?<=[.!?])\s+/)) {
      let s: string | null = original;
      for (const token of numbersIn(original)) {
        if (allowed.has(normalizeNumber(token))) {
          if (!checked.includes(token)) checked.push(token);
          continue;
        }
        removed.push(token);
        s = s === null ? null : rewriteWithout(s, token);
      }
      if (s) kept.push(s);
    }
    return kept.join(" ").trim();
  });
  const answer = paragraphs.filter(Boolean).join("\n").trim();
  return { answer: answer || GROUNDING_FALLBACK, removed, checked };
}
