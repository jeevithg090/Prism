import "server-only";
// LOCAL SHIM of P1's fcSearch. Returns [] without a key.
export type FcResult = { url: string; title: string; description?: string };
export async function fcSearch(query: string, opts?: { limit?: number }): Promise<FcResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || process.env.DEMO_MODE === "true") return [];
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ query, limit: opts?.limit ?? 5 }) });
    const j = (await r.json()) as { data?: { web?: FcResult[] } | FcResult[] };
    const d = j.data; return Array.isArray(d) ? d : d?.web ?? [];
  } catch { return []; }
}
