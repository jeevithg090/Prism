import "server-only";
// Adzuna job search (UK). Docs: https://developer.adzuna.com/docs/search
// Needs ADZUNA_APP_ID + ADZUNA_APP_KEY; without them the Market Agent serves its cached snapshot.

export type JobAd = {
  title: string; company: string; description: string; url: string;
  salaryMin?: number; salaryMax?: number; created?: string;
};

export class AdzunaError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const TIMEOUT_MS = 15_000;

export function hasAdzunaKey(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

type AdzunaResult = {
  title?: string; description?: string; redirect_url?: string; created?: string;
  company?: { display_name?: string }; salary_min?: number; salary_max?: number;
};

const clean = (s?: string) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export function mapAdzunaResult(r: AdzunaResult): JobAd {
  return {
    title: clean(r.title), company: clean(r.company?.display_name) || "Unknown employer", description: clean(r.description),
    url: r.redirect_url ?? "", salaryMin: r.salary_min ?? undefined, salaryMax: r.salary_max ?? undefined, created: r.created,
  };
}

/** Pages 1..pages of `what` in the UK (optionally narrowed to `where`), 50 results each. */
export async function searchAdzuna(what: string, opts: { where?: string; pages?: number; perPage?: number } = {}): Promise<JobAd[]> {
  if (!hasAdzunaKey()) throw new AdzunaError("no_key");
  const pages = opts.pages ?? 2;
  const out: JobAd[] = [];
  for (let page = 1; page <= pages; page++) {
    const q = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!, app_key: process.env.ADZUNA_APP_KEY!,
      what, results_per_page: String(opts.perPage ?? 50), "content-type": "application/json",
    });
    if (opts.where && opts.where.toLowerCase() !== "uk") q.set("where", opts.where);
    const res = await fetch(`https://api.adzuna.com/v1/api/jobs/gb/search/${page}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new AdzunaError(`Adzuna ${res.status}`, res.status);
    const j = (await res.json()) as { results?: AdzunaResult[] };
    const rows = (j.results ?? []).map(mapAdzunaResult).filter((a) => a.title);
    out.push(...rows);
    if (rows.length < (opts.perPage ?? 50)) break;
  }
  return out;
}
