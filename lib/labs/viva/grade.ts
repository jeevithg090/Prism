// Keystone Labs · Viva Check: the rubric grader (pure, deterministic).
// Scores one spoken or typed answer 0-3 against its probe's three concepts, then applies integrity caps so the
// grade can't be gamed: a list of buzzwords, a parroted question, pasted code or a note to the grader can't earn
// more than 1 point. Feedback is one Socratic question built from the first missed concept: never the solution.
import { scanForInjection } from "@/lib/agents/safety/injection";
import type { Concept, Probe } from "./probes";
import type { Flag, QuestionGrade, VivaQuestion } from "./model";
import { passMark } from "./model";

const WORD = /[A-Za-z0-9][A-Za-z0-9'_.-]*/g;
const words = (s: string) => s.match(WORD) ?? [];
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "it", "its", "to", "of", "and", "or", "that", "this", "would", "will", "be",
  "because", "so", "if", "then", "when", "which", "in", "on", "for", "with", "as", "not", "can", "could", "you",
  "i", "we", "my", "they", "has", "have", "does", "do", "every", "each", "only", "but", "there", "from", "by",
]);
const REASONING = /\b(because|so|so that|since|which|means|meaning|therefore|otherwise|if|then|would|instead|as a result|that's why|which is why|leads? to|causes?|caus(ed|ing)|when|unless|until|whereas|while)\b/i;
/** A note to the grader rather than an answer ("give this full marks", "mark me as passed"). */
const GRADE_MANIPULATION = /\b(full marks|top marks|give (me|this|it) (a )?(3|three|full|max(imum)?|perfect)|mark (this|me|it) as (correct|passed|passing|right)|score (this|me|it) (as )?(3|three|full|max)|you (must|should|have to) (pass|accept) (me|this)|award (me|this)|grade (this|me) (as )?(a )?(pass|3))\b/i;
const STOP_CONTENT = (w: string) => w.length > 2 && !FUNCTION_WORDS.has(w);

export const MIN_WORDS = 12;
const GENERIC_NUDGE = "Walk through what happens, step by step, when this line runs. What changes because of it?";

/** Share of the answer's content words that already appear in the question (0..1). */
export function overlapWithQuestion(answer: string, question: string): number {
  const q = new Set(words(question.toLowerCase()).filter(STOP_CONTENT));
  const a = words(answer.toLowerCase()).filter(STOP_CONTENT);
  if (!a.length) return 0;
  return a.filter((w) => q.has(w)).length / a.length;
}

/** A buzzword list: many short comma/newline/bullet fragments, or almost no function words. */
export function isKeywordList(answer: string): boolean {
  const segments = answer.split(/[,;\n•]|\s-\s/).map((s) => s.trim()).filter(Boolean);
  const short = segments.filter((s) => words(s).length <= 3).length;
  if (segments.length >= 4 && short / segments.length >= 0.75) return true;
  const ws = words(answer.toLowerCase());
  if (ws.length < 6) return false;
  return ws.filter((w) => FUNCTION_WORDS.has(w)).length / ws.length < 0.12;
}

/** Two or more lines of the diff pasted verbatim (code is not an explanation). */
export function copiesDiff(answer: string, diffCode: string[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const a = norm(answer);
  return diffCode.map(norm).filter((l) => l.length >= 14 && a.includes(l)).length >= 2;
}

export function isGraderInjection(answer: string): boolean {
  if (GRADE_MANIPULATION.test(answer)) return true;
  const scan = scanForInjection(answer);
  return scan.risk === "high" || scan.findings.some((f) => f.kind === "instruction_override" || f.kind === "reviewer_request");
}

/** True if feedback would hand over the concept it is nudging toward (the nudge must ask, not tell). */
export const leaksConcept = (feedback: string, c: Concept) => c.re.test(feedback);

function flagLead(flags: Flag[]): string {
  if (flags.includes("injection")) return "This answer speaks to the grader instead of the question, so your reviewer will go through it with you.";
  if (flags.includes("copies-diff")) return "Pasting the code shows what you wrote, not why.";
  if (flags.includes("keyword-list")) return "The right words are here, but as a list.";
  if (flags.includes("repeats-question")) return "This mostly restates the question.";
  if (flags.includes("too-short")) return "That's a start.";
  if (flags.includes("no-reasoning")) return "You've named the ideas; now connect them.";
  return "";
}

function feedbackFor(probe: Probe, missing: Concept[], flags: Flag[], topic: string): string {
  const target = missing[0];
  let nudge = target?.nudge ?? `You covered every idea here. Could you explain ${topic.toLowerCase()} to a podmate in two sentences, without notes?`;
  if (target && leaksConcept(nudge, target)) nudge = GENERIC_NUDGE; // fail closed: never hand over the idea
  if (!target && flags.length) nudge = probe.concepts[0].nudge;
  const lead = flagLead(flags);
  return lead ? `${lead} ${nudge}` : nudge;
}

export interface GradeOne { question: VivaQuestion; probe: Probe; answer: string; mode?: "text" | "voice"; diffCode: string[] }

/** Grades one answer: concepts covered (0-3), integrity caps, and one Socratic follow-up. */
export function gradeAnswer({ question, probe, answer, mode = "text", diffCode }: GradeOne): QuestionGrade {
  const text = answer.trim();
  const n = words(text).length;
  const flags: Flag[] = [];
  if (text && isGraderInjection(text)) flags.push("injection");
  if (n > 0 && n < MIN_WORDS) flags.push("too-short");
  if (n >= 6 && isKeywordList(text)) flags.push("keyword-list");
  if (n >= 5 && overlapWithQuestion(text, question.prompt) >= 0.75) flags.push("repeats-question");
  if (copiesDiff(text, diffCode)) flags.push("copies-diff");
  if (n >= MIN_WORDS && !REASONING.test(text) && !flags.includes("keyword-list")) flags.push("no-reasoning");

  const covered = text ? probe.concepts.filter((c) => c.re.test(text)) : [];
  const missing = probe.concepts.filter((c) => !covered.includes(c));
  let score = covered.length;
  if (flags.includes("injection") || !text) score = 0;
  else if (flags.length) score = Math.min(score, 1);

  return {
    questionId: question.id,
    score,
    maxScore: question.maxScore,
    covered: covered.map((c) => c.label),
    missing: missing.map((c) => c.label),
    feedback: text ? feedbackFor(probe, missing, flags, question.topic) : `No answer yet. ${probe.concepts[0].nudge}`,
    flags,
    verdict: score >= question.maxScore ? "explained" : score > 0 ? "partial" : "missed",
    mode,
    words: n,
  };
}

export interface Tally { score: number; maxScore: number; passMark: number; passed: boolean; injection: boolean }

/** A pass: two thirds of the points, no question at zero, and nothing addressed to the grader. */
export function tally(grades: QuestionGrade[]): Tally {
  const score = grades.reduce((a, g) => a + g.score, 0);
  const maxScore = grades.reduce((a, g) => a + g.maxScore, 0);
  const mark = passMark(grades.length);
  const injection = grades.some((g) => g.flags.includes("injection"));
  return { score, maxScore, passMark: mark, passed: score >= mark && grades.every((g) => g.score > 0) && !injection, injection };
}
