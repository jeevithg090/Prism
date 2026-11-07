import "server-only";
import { Firecrawl } from "@mendable/firecrawl-js";

const TIMEOUT_MS = 60_000;

export type FcResult = { url: string; title: string; description?: string };

export class FirecrawlError extends Error {
  override name = "FirecrawlError";
}

let client: Firecrawl | null = null;
const fc = () => (client ??= new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY }));

async function guarded<T>(label: string, work: () => Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([work(), timeout]);
  } catch (err) {
    throw new FirecrawlError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns [] with no key, in demo mode, or on failure, because callers treat search as optional. */
export async function fcSearch(query: string, opts: number | { limit?: number } = 10): Promise<FcResult[]> {
  if (!process.env.FIRECRAWL_API_KEY || process.env.DEMO_MODE === "true") return [];
  const limit = typeof opts === "number" ? opts : opts.limit ?? 10;
  try {
    const res = await guarded("search", () => fc().search(query, { limit }));
    return (res.web ?? []).flatMap((hit) => {
      const r = hit as { url?: string; title?: string; description?: string; metadata?: { sourceURL?: string; title?: string } };
      const url = r.url ?? r.metadata?.sourceURL;
      return url ? [{ url, title: r.title ?? r.metadata?.title ?? url, description: r.description }] : [];
    });
  } catch {
    return [];
  }
}

export async function fcScrapeMarkdown(url: string): Promise<string> {
  const doc = await guarded("scrape", () => fc().scrape(url, { formats: ["markdown"] }));
  return doc.markdown ?? "";
}

export async function fcScrapeJSON<T>(url: string, jsonSchema: object, prompt: string): Promise<T> {
  const doc = await guarded("extract", () =>
    fc().scrape(url, { formats: [{ type: "json", schema: jsonSchema, prompt }] }));
  return doc.json as T;
}

export async function fcCrawl(url: string, opts: { limit: number; includePaths?: string[] }): Promise<{ url: string; markdown: string }[]> {
  const job = await guarded("crawl", () =>
    fc().crawl(url, { limit: opts.limit, includePaths: opts.includePaths, scrapeOptions: { formats: ["markdown"] } }));
  return (job.data ?? []).flatMap((d) => {
    const pageUrl = d.metadata?.sourceURL;
    return pageUrl ? [{ url: pageUrl, markdown: d.markdown ?? "" }] : [];
  });
}
