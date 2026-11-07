import "server-only";

const API = "https://hn.algolia.com/api/v1";

export function stripHtml(html: string): string {
  return html
    .replace(/<(p|br|li|pre)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\S+/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN API responded ${res.status}`);
  return (await res.json()) as T;
}

export async function listWhoIsHiring(months = 36): Promise<{ id: string; month: string }[]> {
  const byMonth = new Map<string, string>();
  for (let page = 0; page < 5 && byMonth.size < months; page++) {
    const { hits, nbPages } = await getJson<{
      hits: { objectID: string; title: string; created_at: string }[]; nbPages: number;
    }>(`${API}/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=100&page=${page}`);
    for (const h of hits) {
      if (!/Who is hiring\?/i.test(h.title)) continue;
      const month = h.created_at.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, h.objectID);
    }
    if (page + 1 >= nbPages) break;
  }
  return [...byMonth].map(([month, id]) => ({ id, month })).sort((a, b) => a.month.localeCompare(b.month)).slice(-months);
}

export async function getComments(id: string): Promise<string[]> {
  const item = await getJson<{ children?: { text?: string | null }[] }>(`${API}/items/${id}`);
  return (item.children ?? []).flatMap((c) => (c.text ? [stripHtml(c.text)] : []));
}
