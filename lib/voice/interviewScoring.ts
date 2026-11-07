import "server-only";
// P4 · Mock-interview scoring. Deterministic first (works with no keys, explainable, testable):
//   content    = coverage of the discussed skill's keywords (+ depth: reasons, numbers, examples)
//   structure  = STAR markers present (situation, task, action, result)
//   clarity    = average sentence length
//   confidence = filler words per minute (+ hedging)
// then an optional llmJSON refinement, and the result is saved as an interview, a momentum event and
// keystone-interview evidence (Proof Ladder rung 3: "explained it").
import { z } from "zod";
import { emit, newRunId } from "@/lib/agents/events";
import { llmJSON } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { skillName } from "@/lib/schemas/community";
import type { EvidenceItem, InterviewFeedback, Level } from "@/lib/types";
import type { InterviewResult } from "@/lib/voice/schemas";

export type Scores = InterviewFeedback["scores"];
type Dim = keyof Scores;
const DIMS: Dim[] = ["content", "structure", "clarity", "confidence"];

const FILLER_RE = /\b(um+|uh+|erm+|you know|sort of|kind of|basically|literally)\b/gi;
/** "like" only as a filler: surrounded by commas or opening a clause and followed by a comma. */
const LIKE_RE = /(^|[,.!?;]\s*)like,/gi;
const HEDGE_RE = /\b(i think|maybe|i guess|probably|not sure|i don't know|hopefully)\b/gi;

const SPEAKER_RE = /^\s*(ai|agent|interviewer|user|you|candidate)\s*:\s*/i;

/** The candidate's words only: `user:` lines (or the whole text when nothing is labelled). */
export function userText(transcript: string): string {
  const lines = transcript.split(/\r?\n/);
  const labelled = lines.some((l) => SPEAKER_RE.test(l));
  if (!labelled) return transcript.trim();
  return lines
    .filter((l) => /^\s*(user|you|candidate)\s*:/i.test(l))
    .map((l) => l.replace(SPEAKER_RE, "").trim())
    .join("\n");
}

export function fillerMatches(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n/)) {
    for (const m of line.matchAll(FILLER_RE)) out.push(m[1].toLowerCase());
    out.push(...Array.from(line.matchAll(LIKE_RE), () => "like"));
  }
  return out;
}

/** Filler words a minute in the candidate's lines, to one decimal place. */
export function fillerWordsPerMin(transcript: string, durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  const count = fillerMatches(userText(transcript)).length;
  return Math.round((count / (durationSec / 60)) * 10) / 10;
}

// ---------- content: skill keywords ----------
const SKILL_KEYWORDS: Record<string, string[]> = {
  docker: ["dockerfile", "image", "container", "layer", "cache", "caching", "base image", "requirements", "pip install", "docker run", "docker compose", "compose", "port", "volume", "entrypoint", "cmd", "copy", "build", "registry", "isolated", "file system"],
  pytorch: ["tensor", "model", "training", "batch", "gpu", "epoch", "loss", "optimizer", "dataloader", "inference", "gradient", "fine-tune", "checkpoint", "torch"],
  python: ["function", "module", "package", "list", "dictionary", "pandas", "numpy", "test", "virtual environment", "pip", "class", "exception", "type hints"],
  sql: ["table", "query", "join", "index", "primary key", "foreign key", "schema", "select", "where", "normalise", "postgres", "migration", "constraint"],
  aws: ["ec2", "s3", "lambda", "region", "iam", "bucket", "deploy", "instance", "load balancer", "cloud", "permissions", "cost"],
  react: ["component", "state", "props", "hook", "render", "accessibility", "aria", "screen reader", "form", "effect", "keyboard"],
  git: ["branch", "commit", "pull request", "merge", "rebase", "conflict", "review", "history"],
};
const GENERIC_KEYWORDS = ["test", "review", "pull request", "merged", "bug", "design", "trade-off", "measured", "users", "deploy", "documentation"];
const DEPTH_RE = /\b(because|so that|which means|for example|for instance|\d+(\.\d+)?\s?(%|percent|seconds|minutes|ms|mb|x)?|from \w+ (minutes|seconds) to)\b/gi;

function keywordHits(text: string, skillId: string, extra: string[] = []): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9+#.\- ]+/g, " ")} `;
  const list = [...new Set([...(SKILL_KEYWORDS[skillId] ?? []), ...GENERIC_KEYWORDS, ...extra.map((e) => e.toLowerCase())])];
  return list.filter((k) => t.includes(` ${k} `) || t.includes(` ${k}s `));
}

// ---------- structure: STAR ----------
const STAR: Record<"situation" | "task" | "action" | "result", RegExp> = {
  situation: /\b(in (our|my|the) (pod|team|project|course|module|internship|group)|we('re| are| were) (building|working|making)|the (problem|situation|context) (was|is)|when (i|we) (started|joined|were))\b/i,
  task: /\b(my (issue|task|job|role|goal|part) (was|is)|i (needed|had|was asked) to|i was responsible|the goal was)\b/i,
  action: /\bi (wrote|built|added|moved|changed|used|created|tested|fixed|decided|tried|set up|refactored|implemented|designed|split|asked|measured|replaced)\b/i,
  result: /\b(as a result|in the end|the result|which meant|so now|now (it|we|anyone|everyone)|it worked|(went|dropped|fell) from|reduced|improved|approved|was merged|got merged|i learned|i learnt)\b/i,
};

function sentences(text: string): string[] {
  return text.split(/[.!?]+(?:\s|$)|\n/).map((s) => s.trim()).filter((s) => (s.match(/\S+/g)?.length ?? 0) >= 2);
}
const wordCount = (s: string) => s.match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
/** Shortens a quote at a word boundary, with an ellipsis when cut. */
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "")}…`);

export interface RuleScore {
  scores: Scores;
  fillerWordsPerMin: number;
  strengths: string[];
  improvements: string[];
  detail: { words: number; keywordHits: string[]; star: string[]; avgSentence: number; fillers: number; topFiller?: string; hedges: number };
}

/** Deterministic scores + specific strengths and improvements for one transcript. */
export function scoreTranscript(i: { transcript: string; durationSec: number; skillId: string; roleKeywords?: string[] }): RuleScore {
  const text = userText(i.transcript);
  const words = wordCount(text);
  const skill = skillName(i.skillId);

  const hits = keywordHits(text, i.skillId, i.roleKeywords);
  const depth = text.match(DEPTH_RE)?.length ?? 0;
  let content = 1 + 3 * Math.min(1, hits.length / 6) + (depth >= 2 ? 1 : depth === 1 ? 0.5 : 0);
  if (words < 40) content = Math.min(content, 2);

  const star = (Object.keys(STAR) as (keyof typeof STAR)[]).filter((k) => STAR[k].test(text));
  let structure = 1 + star.length;
  if (words < 25) structure = Math.min(structure, 2);

  const sents = sentences(text);
  const avg = sents.length ? sents.reduce((n, s) => n + wordCount(s), 0) / sents.length : words;
  const clarity = avg < 6 ? 3 : avg <= 22 ? 5 : avg <= 26 ? 4 : avg <= 32 ? 3 : avg <= 40 ? 2 : 1;

  const fillers = fillerMatches(text);
  const fpm = fillerWordsPerMin(i.transcript, i.durationSec);
  const hedges = text.match(HEDGE_RE)?.length ?? 0;
  let confidence = fpm < 2 ? 5 : fpm < 4 ? 4 : fpm < 6 ? 3 : fpm < 9 ? 2 : 1;
  if (words > 0 && (hedges / words) * 100 > 2) confidence -= 1;
  if (words < 25) confidence = Math.min(confidence, 2);

  const scores: Scores = { content: clamp(content), structure: clamp(structure), clarity: clamp(clarity), confidence: clamp(confidence) };

  const tally = new Map<string, number>();
  for (const f of fillers) tally.set(f, (tally.get(f) ?? 0) + 1);
  const topFiller = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const missing = (["situation", "task", "action", "result"] as const).filter((k) => !star.includes(k));
  const avgR = Math.round(avg);
  const resultQuote = text.match(/[^.!?\n]*\b(as a result|went from|it worked|approved|was merged|reduced|improved)\b[^.!?\n]*/i)?.[0]?.trim();
  const suggestions = (SKILL_KEYWORDS[i.skillId] ?? GENERIC_KEYWORDS).filter((k) => !hits.includes(k)).slice(0, 2);

  const strength: Record<Dim, string> = {
    content: hits.length
      ? `You used precise ${skill} details: ${hits.slice(0, 3).join(", ")}.`
      : `You stayed on the question and answered what was asked.`,
    structure: resultQuote
      ? `You ended on a result the interviewer can remember: "${clip(resultQuote, 90)}".`
      : `Your answers had a clear order, from the situation to what you did.`,
    clarity: `Short, clear sentences (about ${avgR} words each) that are easy to follow.`,
    confidence: `Calm delivery: ${fpm} filler words a minute (aim for under 4).`,
  };
  const improvement: Record<Dim, string> = {
    content: suggestions.length
      ? `Name the ${skill} details you used, such as ${suggestions.join(" and ")}, so the interviewer hears depth.`
      : `Add one number or example to each answer, like how long a build took before and after.`,
    structure: missing.length
      ? `Structure answers as situation → action → result; your answers skipped the ${missing.join(" and ")}.`
      : `Say the result first in one line, then explain how you got there.`,
    clarity: avgR > 22
      ? `Your sentences ran to about ${avgR} words; split long answers into two or three sentences.`
      : `Slow down on the technical bit and define one term before you use it.`,
    confidence: fillers.length
      ? `Pause instead of saying "${topFiller}": you used ${fillers.length} filler word${fillers.length === 1 ? "" : "s"} (${fpm} a minute; aim for under 4).`
      : hedges
        ? `Swap hedges like "I think" for direct statements: "I chose…", "I measured…".`
        : `Own the decisions out loud: "I chose X because Y" sounds more confident than "we just did it".`,
  };
  // Strengths: the two best dimensions; improvements: the two weakest (stable order on ties).
  const ranked = [...DIMS].sort((a, b) => scores[b] - scores[a] || DIMS.indexOf(a) - DIMS.indexOf(b));
  const weakest = [...DIMS].sort((a, b) => scores[a] - scores[b] || DIMS.indexOf(b) - DIMS.indexOf(a));
  const strengths = ranked.slice(0, 2).map((d) => strength[d]);
  const improvements = weakest.slice(0, 2).map((d) => improvement[d]);

  return {
    scores, fillerWordsPerMin: fpm, strengths, improvements,
    detail: { words, keywordHits: hits, star, avgSentence: Math.round(avg * 10) / 10, fillers: fillers.length, topFiller, hedges },
  };
}

const LlmScoreZ = z.object({
  scores: z.object({
    content: z.number().int().min(1).max(5), structure: z.number().int().min(1).max(5),
    clarity: z.number().int().min(1).max(5), confidence: z.number().int().min(1).max(5),
  }),
  strengths: z.array(z.string().min(1)).length(2),
  improvements: z.array(z.string().min(1)).length(2),
});

const COACH_SYSTEM =
  "You are an encouraging interview coach for university students. Score the CANDIDATE's answers only, 1-5 each for content (accuracy, depth), structure (clear situation→action→result), clarity (plain, concise), confidence (decisive, ownership). Give 2 specific strengths and 2 specific, actionable improvements quoting their words where possible. Plain UK English, second person.";

export interface ScoreInput {
  userId: string; roleId: string; roleName?: string; transcript: string; durationSec: number;
  skillId: string; prTitle?: string; roleKeywords?: string[]; runId?: string;
}

/**
 * Scores the interview (rules, then an optional LLM refinement that is skipped in DEMO_MODE or on any error)
 * and saves it: `interviews` (feeds the 🎤 Interview-ready badge), a `mock-interview` momentum event, and
 * keystone-interview evidence for communication and, when the content held up, the discussed skill.
 */
export async function scoreInterview(i: ScoreInput): Promise<InterviewResult> {
  const runId = i.runId ?? newRunId();
  const skill = skillName(i.skillId);
  emit({ runId, agent: "voice", status: "started", message: `Scoring your ${i.roleName ?? i.roleId} mock interview` });

  const rules = scoreTranscript(i);
  let scores = rules.scores;
  let strengths = rules.strengths;
  let improvements = rules.improvements;
  let scoredBy: InterviewResult["scoredBy"] = "rules";
  emit({
    runId, agent: "voice", status: "progress",
    message: `${rules.detail.words} words · ${rules.fillerWordsPerMin} filler words/min · ${rules.detail.star.length} of 4 STAR parts`,
  });

  if (process.env.DEMO_MODE !== "true") {
    try {
      const llm = await llmJSON({
        agent: "voice", runId, system: COACH_SYSTEM, schema: LlmScoreZ, schemaName: "interview_feedback", temperature: 0.2,
        user: `ROLE: ${i.roleName ?? i.roleId}\nTOPIC: their merged pod PR "${i.prTitle ?? skill}" (${skill})\nTRANSCRIPT:\n${i.transcript.slice(0, 12000)}`,
      });
      const blend = (d: Dim) => clamp((rules.scores[d] + llm.scores[d]) / 2);
      scores = { content: blend("content"), structure: blend("structure"), clarity: blend("clarity"), confidence: blend("confidence") };
      strengths = llm.strengths;
      improvements = llm.improvements;
      scoredBy = "rules+llm";
    } catch {
      // no key or a bad response: the rule-based feedback stands on its own
    }
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const id = `iv_${i.userId}_${now.getTime()}`;
  const avg = (scores.content + scores.structure + scores.clarity + scores.confidence) / 4;
  const feedback: InterviewFeedback = {
    userId: i.userId, roleId: i.roleId, scores, fillerWordsPerMin: rules.fillerWordsPerMin,
    strengths, improvements, transcript: i.transcript.slice(0, 20000), createdAt,
  };

  const store = getStore();
  await store.upsert("interviews", id, { id, ...feedback, durationSec: i.durationSec, skillId: i.skillId }, i.userId);
  await store.upsert("momentum_events", `mock-interview-${id}`, {
    id: `mock-interview-${id}`, userId: i.userId, kind: "mock-interview", ts: createdAt, label: `Mock interview: ${i.roleName ?? i.roleId}`, url: "/interview",
  }, i.userId);

  const evidence: InterviewResult["evidence"] = [];
  const save = async (skillId: string, level: Level, confidence: number, quote: string, label: string) => {
    const ev: EvidenceItem = {
      id: `ev_interview_${id}_${skillId}`, userId: i.userId, skillId, level, confidence: Math.round(confidence * 100) / 100,
      source: "keystone-interview", url: "/interview", quote, createdAt,
    };
    await store.upsert("evidence", ev.id, ev, i.userId);
    evidence.push({ id: ev.id, skillId, label, level });
  };
  await save("communication", avg >= 3.5 ? 2 : 1, Math.min(0.9, 0.4 + avg / 10),
    `Mock interview for ${i.roleName ?? i.roleId}: structure ${scores.structure}/5, clarity ${scores.clarity}/5`, "Communication");
  if (scores.content >= 3 && i.skillId !== "communication") {
    await save(i.skillId, 3, Math.min(0.9, 0.55 + scores.content * 0.07),
      `Explained "${i.prTitle ?? skill}" in a mock interview (content ${scores.content}/5)`, `${skill} (explained)`);
  }
  emit({
    runId, agent: "evidence", status: "done",
    message: `Saved as proof: ${evidence.map((e) => e.label).join(" · ")}`,
    data: { userId: i.userId, evidenceIds: evidence.map((e) => e.id) },
  });
  emit({ runId, agent: "voice", status: "done", message: `Interview scored: average ${avg.toFixed(1)} of 5`, data: { scores } });

  return { ...feedback, id, durationSec: i.durationSec, skillId: i.skillId, skillName: skill, evidence, scoredBy };
}
