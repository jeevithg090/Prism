import "server-only";
// DEV.to public API → conservative evidence. Writing publicly about a technology in your own words shows aware
// use (level 1, confidence 0.5): it proves you engage with the topic, not that you build with it. Only DEV
// article tags the taxonomy can name become items; the broad community ones (webdev, beginners…), a DEV user
// without articles, and any failure produce nothing. No key needed.
import { emit } from "@/lib/agents/events";
import { listEvidence } from "@/lib/graph/data";
import { replayOrRecord } from "@/lib/replay";
import { getStore } from "@/lib/store";
import type { EvidenceItem, SkillId } from "@/lib/types";

export const ARTICLE_CONFIDENCE = 0.5;

export type DevArticle = {
  id?: number; title?: string; url?: string; published_at?: string; published_timestamp?: string;
  tag_list?: string[]; tags?: string;
};

/** DEV article tags that name a taxonomy skill (verified against dev.to/api tag names). Others are skipped. */
export const TAG_TO_SKILL: Record<string, SkillId> = {
  python: "python", java: "java", javascript: "javascript", typescript: "typescript",
  cpp: "cpp", sql: "sql", postgresql: "postgresql", html: "html-css", css: "html-css",
  react: "react", node: "nodejs", nodejs: "nodejs", express: "nodejs", docker: "docker",
  kubernetes: "kubernetes", git: "git", github: "git", linux: "linux", aws: "aws",
  testing: "testing", unittesting: "testing", security: "security-basics",
  algorithms: "algorithms", machinelearning: "machine-learning", "machine-learning": "machine-learning",
  "deep-learning": "deep-learning", deeplearning: "deep-learning", pytorch: "pytorch",
  tensorflow: "tensorflow", sklearn: "scikit-learn", "scikit-learn": "scikit-learn",
  pandas: "pandas", numpy: "numpy", statistics: "statistics",
};

const PER_PAGE = 30;
const MAX_TITLE = 80;

/** The user's published articles, newest first (the API returns newest first; we don't depend on that). */
async function articlesFor(handle: string): Promise<DevArticle[]> {
  return replayOrRecord<DevArticle[]>(
    "devto",
    { op: "articles", handle },
    async () => {
      const res = await fetch(`https://dev.to/api/articles?username=${encodeURIComponent(handle)}&per_page=${PER_PAGE}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`DEV ${res.status}`);
      const j = (await res.json()) as DevArticle[];
      if (!Array.isArray(j)) throw new Error("DEV: unexpected response");
      return j;
    },
    {
      loose: false,
      meta: { kind: "devto", label: `articles @${handle}` },
      validate: (v) => v !== null && typeof v === "object",
      shouldRecord: (v) => Array.isArray(v) && v.length > 0,
    },
  );
}

const publishedOf = (a: DevArticle): string => a.published_at ?? a.published_timestamp ?? "";
const articleTags = (a: DevArticle): string[] =>
  Array.isArray(a.tag_list) ? a.tag_list : typeof a.tags === "string" ? a.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

/**
 * Articles → skills: one item per distinct skill, sourced from and linked to its newest article. Zero articles
 * or no mappable tag → no items. Pure.
 */
export function articlesToEvidence(userId: string, handle: string, articles: DevArticle[], now = new Date()): EvidenceItem[] {
  const sorted = [...articles].filter((a) => a.title?.trim()).sort((a, b) => publishedOf(b).localeCompare(publishedOf(a)));
  if (!sorted.length) return [];
  const latest = sorted[0];
  const count = articles.length;
  const quote = `Wrote ${count} DEV article${count === 1 ? "" : "s"} · latest "${(latest.title ?? "").slice(0, MAX_TITLE)}"`;
  const items: EvidenceItem[] = [];
  const seen = new Set<SkillId>();
  for (const a of sorted) {
    for (const tag of articleTags(a)) {
      const skillId = TAG_TO_SKILL[tag.trim().toLowerCase().replace(/\s+/g, "")];
      if (!skillId || seen.has(skillId)) continue;
      seen.add(skillId);
      items.push({
        id: `ev_${userId}_${skillId}_devto`, userId, skillId, level: 1, confidence: ARTICLE_CONFIDENCE,
        source: "devto" as const, url: a.url?.trim() || `https://dev.to/${handle}`, quote,
        createdAt: now.toISOString(),
      });
    }
  }
  return items;
}

/**
 * Reads the user's published articles. Saves each mapped skill to the store (an account with zero articles
 * stores nothing, which is honest). On any failure it emits an error event and returns the evidence you
 * already have; it never throws.
 */
export async function syncDevtoEvidence(input: { userId: string; handle: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, handle, runId } = input;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "evidence", status, message, data });
  };
  say("started", `Evidence Agent: reading DEV for @${handle}`);
  try {
    const articles = await articlesFor(handle);
    const tags = new Set(articles.flatMap(articleTags)).size;
    const mappable = new Set(articles.flatMap(articleTags).filter((t) => TAG_TO_SKILL[t.trim().toLowerCase().replace(/\s+/g, "")])).size;
    say("progress", `read ${articles.length} article${articles.length === 1 ? "" : "s"} · ${mappable} of ${tags} tags map to your skills`, {
      articles: articles.length, tags, mappable,
    });
    const items = articlesToEvidence(userId, handle, articles);
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
    say("done", `found ${items.length} skills in ${articles.length} DEV article${articles.length === 1 ? "" : "s"}`, { skills: items.length, articles: articles.length });
    return listEvidence(userId);
  } catch (err) {
    say("error", "DEV wasn't available just now: keeping the evidence we already have", { reason: err instanceof Error ? err.message : "unknown" });
    return listEvidence(userId);
  }
}
