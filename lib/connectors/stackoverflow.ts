import "server-only";
// Stack Exchange public API 2.3 → conservative evidence. Stack Overflow activity is real-world help-giving:
// a top tag says the person works in that technology enough to answer others on it (level 1, confidence 0.55).
// Only tags the taxonomy can name become items; everything else is skipped. No key: the anonymous quota is
// ~300 requests/day per IP, which is ample for a student sync. Node's fetch decompresses the gzip responses.
import { emit } from "@/lib/agents/events";
import { listEvidence } from "@/lib/graph/data";
import { replayOrRecord } from "@/lib/replay";
import { getStore } from "@/lib/store";
import type { EvidenceItem, SkillId } from "@/lib/types";

export const TAG_CONFIDENCE = 0.55;

export type SeUser = {
  user_id: number; display_name: string; reputation: number; link: string;
  badge_counts?: { bronze?: number; silver?: number; gold?: number };
};
export type SeTag = { tag_name: string; answer_count?: number; answer_score?: number };
type SeItems<T> = { items?: T[] };

/** Stack Overflow top tags that name a taxonomy skill (verified against the Stack Exchange API's tag names). */
export const TAG_TO_SKILL: Record<string, SkillId> = {
  python: "python", java: "java", javascript: "javascript", typescript: "typescript",
  c: "c", "c++": "cpp", sql: "sql", mysql: "sql", "sql-server": "sql",
  postgresql: "postgresql", html: "html-css", css: "html-css", react: "react", reactjs: "react",
  nodejs: "nodejs", "node.js": "nodejs", express: "nodejs", docker: "docker", kubernetes: "kubernetes",
  git: "git", github: "git", linux: "linux", bash: "linux", "amazon-web-services": "aws",
  rest: "rest-apis", testing: "testing", "unit-testing": "testing", security: "security-basics",
  algorithm: "algorithms", algorithms: "algorithms", "machine-learning": "machine-learning",
  "deep-learning": "deep-learning", tensorflow: "tensorflow", pytorch: "pytorch",
  "scikit-learn": "scikit-learn", pandas: "pandas", numpy: "numpy", statistics: "statistics", probability: "statistics",
};

const API = "https://api.stackexchange.com/2.3";

/** A public Stack Exchange read. 4xx with a `no_such_user`-style error, or an empty items array, throws. */
async function seGet<T>(op: string, handle: string, path: string): Promise<T[]> {
  return replayOrRecord<T[]>(
    "stackexchange",
    { op, handle },
    async () => {
      const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}site=stackoverflow`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Stack Exchange ${res.status}`);
      const items = (await res.json()) as SeItems<T>;
      if (!Array.isArray(items?.items)) throw new Error("Stack Exchange: unexpected response");
      if (!items.items.length) throw new Error(`No Stack Overflow user "${handle}"`);
      return items.items;
    },
    {
      loose: false,
      meta: { kind: "stackexchange", label: `${op} user ${handle}` },
      validate: (v) => v !== null && typeof v === "object",
      shouldRecord: (v) => Array.isArray(v) && v.length > 0,
    },
  );
}

/**
 * Top tags → skills: one item per skill (the highest-ranked tag wins), level 1 as the minimum honest claim.
 * Unknown tags are skipped; a profile with no mappable tag earns nothing. Pure.
 */
export function tagsToEvidence(userId: string, user: SeUser, tags: SeTag[], now = new Date()): EvidenceItem[] {
  const url = user.link?.trim() || `https://stackoverflow.com/users/${user.user_id}`;
  const items: EvidenceItem[] = [];
  const seen = new Set<SkillId>();
  for (const { tag_name } of tags ?? []) {
    const skillId = TAG_TO_SKILL[tag_name?.trim().toLowerCase() ?? ""];
    if (!skillId || seen.has(skillId)) continue;
    seen.add(skillId);
    items.push({
      id: `ev_${userId}_${skillId}_stackoverflow`, userId, skillId, level: 1, confidence: TAG_CONFIDENCE,
      source: "stackoverflow" as const, url,
      quote: `Stack Overflow reputation ${user.reputation ?? 0} · top tag ${tag_name}`,
      createdAt: now.toISOString(),
    });
  }
  return items;
}

/**
 * Reads the numeric user's profile (required) and top tags (best effort: without tags nothing is claimed).
 * Saves each item to the store. On any failure it emits an error event and returns the evidence you already
 * have; it never throws.
 */
export async function syncStackOverflowEvidence(input: { userId: string; handle: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, handle, runId } = input;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "evidence", status, message, data });
  };
  say("started", `Evidence Agent: reading Stack Overflow for user ${handle}`);
  try {
    // The profile is the hard fact and must load; top tags are best effort, and both APIs are fetched in parallel.
    const [users, tags] = await Promise.all([
      seGet<SeUser>("user", handle, `/users/${encodeURIComponent(handle)}`),
      seGet<SeTag>("top-tags", handle, `/users/${encodeURIComponent(handle)}/top-tags`).catch(() => [] as SeTag[]),
    ]);
    const user = users[0];
    if (!user) throw new Error(`No Stack Overflow user "${handle}"`);
    say("progress", `reputation ${user.reputation ?? 0} · ${tags.length} top tags`, {
      reputation: user.reputation ?? null, badges: user.badge_counts ?? null, tags: tags.length,
    });
    const items = tagsToEvidence(userId, user, tags);
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
    say("done", `found ${items.length} skills from your answers and top tags`, { skills: items.length, reputation: user.reputation ?? 0 });
    return listEvidence(userId);
  } catch (err) {
    say("error", "Stack Overflow wasn't available just now: keeping the evidence we already have", { reason: err instanceof Error ? err.message : "unknown" });
    return listEvidence(userId);
  }
}
