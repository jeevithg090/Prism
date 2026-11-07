// Pure helpers for "Turn into CV bullets" (deterministic fallback + LLM prompt/parse).
import type { MomentumEvent } from "@/lib/schemas/community";
import { MOMENTUM_KINDS } from "@/lib/momentum";

export type CvBulletsResult = { bullets: string[]; source: "ai" | "template" };

export const CV_SYSTEM_PROMPT = [
  "You turn a university student's verified learning events into CV bullet points.",
  "Write exactly 3 bullet points in STAR style (situation, task, action, result), one sentence each, under 30 words.",
  "UK English. Start each with a past-tense verb. Use only facts that appear in the events: never invent numbers, employers, users or outcomes.",
  "Output only the 3 bullets, one per line, each starting with \"- \".",
].join("\n");

export function cvUserPrompt(events: MomentumEvent[]): string {
  const lines = events.map((e) => `- [${e.kind}] ${e.label ?? e.kind} (${e.ts.slice(0, 10)})${e.url ? ` ${e.url}` : ""}`);
  return `Verified events, newest first:\n${lines.join("\n")}`;
}

/** Bullet lines from LLM text ("- x", "• x", "1. x"); headings and blanks are dropped. */
export function parseBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.endsWith(":"));
}

const s = (n: number) => (n === 1 ? "" : "s");
function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
function repoName(events: MomentumEvent[]): string | undefined {
  for (const e of events) {
    const m = e.url?.match(/github\.com\/[^/]+\/([^/]+)\/pull\//);
    if (m) return m[1];
  }
  return undefined;
}

/** Deterministic STAR-style bullets built from the events (up to 3, biggest steps first). */
export function templateBullets(events: MomentumEvent[]): string[] {
  const byKind = new Map<string, MomentumEvent[]>();
  for (const e of events) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);

  const bullets: string[] = [];
  for (const kind of MOMENTUM_KINDS) {
    const list = byKind.get(kind);
    if (!list?.length) continue;
    const n = list.length;
    switch (kind) {
      case "pr-merged": {
        const repo = repoName(list);
        const title = list.map((e) => e.label?.split(": ").slice(1).join(": ")).find(Boolean);
        bullets.push(`Collaborated in a peer-learning pod on ${repo ?? "a team project"}, picking up issues and merging ${n} pull request${s(n)} after peer code review${title ? `, including “${title}”` : ""}.`);
        break;
      }
      case "roadmap-milestone": {
        const topics = list.map((e) => e.label?.match(/^Completed Week \d+:\s*(.+)$/)?.[1]).filter((t): t is string => !!t).reverse();
        bullets.push(`Followed a self-directed learning plan alongside my degree and completed ${n} milestone${s(n)}${topics.length ? ` (${joinAnd(topics)})` : ""}, each finished with a hands-on proof task.`);
        break;
      }
      case "helped-newcomer":
        bullets.push(`Volunteered as a near-peer mentor and helped ${n} newer student${s(n)} get unstuck, explaining technical ideas in plain language.`);
        break;
      case "mock-interview":
        bullets.push(`Prepared for technical interviews with ${n} mock interview${s(n)}, acting on structured feedback about content, structure and clarity.`);
        break;
      case "problem-solved":
        bullets.push(`Strengthened problem-solving fundamentals by solving ${n} coding problem${s(n)} on top of coursework.`);
        break;
    }
    if (bullets.length === 3) break;
  }
  return bullets;
}
