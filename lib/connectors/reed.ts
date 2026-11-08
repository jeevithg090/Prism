import "server-only";
// Reed.co.uk job search, the Market Agent's fallback when Adzuna fails. Docs: https://www.reed.co.uk/developers/jobseeker
// Basic auth with the API key as the username and an empty password.
import type { JobAd } from "@/lib/connectors/adzuna";
import { replayOrRecord } from "@/lib/replay";

export class ReedError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const TIMEOUT_MS = 15_000;

export function hasReedKey(): boolean {
  return Boolean(process.env.REED_API_KEY);
}

type ReedResult = {
  jobTitle?: string; employerName?: string; jobDescription?: string; jobUrl?: string;
  minimumSalary?: number | null; maximumSalary?: number | null; date?: string;
};

export function mapReedResult(r: ReedResult): JobAd {
  return {
    title: (r.jobTitle ?? "").trim(), company: (r.employerName ?? "").trim() || "Unknown employer",
    description: (r.jobDescription ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), url: r.jobUrl ?? "",
    salaryMin: r.minimumSalary ?? undefined, salaryMax: r.maximumSalary ?? undefined, created: r.date,
  };
}

/** Demo toggle (lib/replay.ts): Live records the ads; Demo replays them for the same search. */
export function searchReed(keywords: string, opts: { location?: string; take?: number } = {}): Promise<JobAd[]> {
  return replayOrRecord<JobAd[]>(
    "market",
    { op: "reed", keywords, location: opts.location ?? null, take: opts.take ?? 100 },
    () => fetchReed(keywords, opts),
    {
      requires: ["REED_API_KEY"], missError: () => new ReedError("no_key"), loose: false,
      meta: { kind: "job-ads", label: `reed: ${keywords}` }, validate: (v) => Array.isArray(v), shouldRecord: (v) => v.length > 0,
    },
  );
}

async function fetchReed(keywords: string, opts: { location?: string; take?: number }): Promise<JobAd[]> {
  const key = process.env.REED_API_KEY;
  if (!key) throw new ReedError("no_key");
  const q = new URLSearchParams({ keywords, resultsToTake: String(opts.take ?? 100) });
  if (opts.location && opts.location.toLowerCase() !== "uk") q.set("locationName", opts.location);
  const res = await fetch(`https://www.reed.co.uk/api/1.0/search?${q}`, {
    headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new ReedError(`Reed ${res.status}`, res.status);
  const j = (await res.json()) as { results?: ReedResult[] };
  return (j.results ?? []).map(mapReedResult).filter((a) => a.title);
}
