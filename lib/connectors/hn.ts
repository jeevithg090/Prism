import "server-only";
// Hacker News "Ask HN: Who is hiring?" threads via the public Algolia API (no key needed).
// Used by the Trend Forecaster: share of monthly hiring posts that mention each skill.

const BASE = "https://hn.algolia.com/api/v1";
const TIMEOUT_MS = 20_000;

export class HNError extends Error {}

export type HiringThread = { id: string; month: string /* YYYY-MM */; title: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/", "#47": "/" };

/** HN comment HTML → plain text: tags removed, entities decoded, whitespace collapsed. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(br|p|li|div)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      const known = ENTITIES[e] ?? ENTITIES[e.toLowerCase()];
      if (known) return known;
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!res.ok) throw new HNError(`HN Algolia ${res.status}`);
  return (await res.json()) as T;
}

/** The last `months` monthly "Who is hiring?" threads, newest first. */
export async function listWhoIsHiring(months = 36): Promise<HiringThread[]> {
  const out = new Map<string, HiringThread>();
  for (let page = 0; page < 5 && out.size < months; page++) {
    const j = await getJSON<{ hits: { objectID: string; title?: string; created_at: string }[]; nbPages?: number }>(
      `${BASE}/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=100&page=${page}`,
    );
    for (const h of j.hits) {
      if (!h.title || !/who is hiring\?/i.test(h.title)) continue;
      const month = h.created_at.slice(0, 7);
      if (!out.has(month)) out.set(month, { id: h.objectID, month, title: h.title });
    }
    if (!j.hits.length || (j.nbPages !== undefined && page + 1 >= j.nbPages)) break;
  }
  return [...out.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, months);
}

/** Top-level comments (one per job post) of a thread, as plain text. */
export async function getComments(id: string): Promise<string[]> {
  const j = await getJSON<{ children?: { text?: string | null }[] }>(`${BASE}/items/${encodeURIComponent(id)}`);
  return (j.children ?? []).map((c) => (c.text ? stripHtml(c.text) : "")).filter((t) => t.length > 0);
}

/**
 * Share of posts per month that mention each skill. `match` returns the skill ids a post mentions
 * (the deterministic alias matcher; no LLM, so the history is reproducible).
 */
export function monthlyShares(
  threads: { month: string; comments: string[] }[],
  skillIds: string[],
  match: (text: string) => Iterable<string>,
): Record<string, { month: string; share: number }[]> {
  const out: Record<string, { month: string; share: number }[]> = Object.fromEntries(skillIds.map((s) => [s, []]));
  for (const t of [...threads].sort((a, b) => a.month.localeCompare(b.month))) {
    if (!t.comments.length) continue;
    const counts = new Map<string, number>();
    for (const c of t.comments) for (const id of new Set(match(c))) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const s of skillIds) out[s].push({ month: t.month, share: Number(((counts.get(s) ?? 0) / t.comments.length).toFixed(4)) });
  }
  return out;
}
