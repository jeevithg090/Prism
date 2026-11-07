import "server-only";
// Firecrawl web search (REST v2). [] without a key, in DEMO_MODE, or on any failure, so callers degrade.
// Demo toggle (lib/replay.ts): Live mode records non-empty results; Demo mode replays them for the same query.
import { LLMError } from "@/lib/llm-error";
import { replayOrRecord } from "@/lib/replay";

export type FcResult = { url: string; title: string; description?: string };

export async function fcSearch(query: string, opts?: { limit?: number }): Promise<FcResult[]> {
  if (process.env.DEMO_MODE === "true") return [];
  const limit = opts?.limit ?? 5;
  try {
    return await replayOrRecord<FcResult[]>(
      "firecrawl",
      { op: "search", query, limit },
      async () => {
        const key = process.env.FIRECRAWL_API_KEY;
        if (!key) throw new LLMError("no_key");
        const r = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ query, limit }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!r.ok) throw new Error(`Firecrawl ${r.status}`);
        const j = (await r.json()) as { data?: { web?: FcResult[] } | FcResult[] };
        const d = j.data;
        return Array.isArray(d) ? d : d?.web ?? [];
      },
      {
        requires: ["FIRECRAWL_API_KEY"],
        meta: { kind: "search", label: query },
        loose: false,
        validate: (v) => Array.isArray(v),
        shouldRecord: (v) => v.length > 0,
      },
    );
  } catch {
    return [];
  }
}
