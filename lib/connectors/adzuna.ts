import "server-only";

export interface JobAd {
  title: string; company: string; description: string; url: string;
  salaryMin?: number; salaryMax?: number; created?: string;
}

interface AdzunaResult {
  title: string; company?: { display_name?: string }; description?: string; redirect_url: string;
  salary_min?: number; salary_max?: number; created?: string;
}

export async function searchAdzuna(query: string, location?: string, pages = 2): Promise<JobAd[]> {
  const { ADZUNA_APP_ID: id, ADZUNA_APP_KEY: key } = process.env;
  if (!id || !key) throw new Error("Adzuna keys are not set");
  const ads: JobAd[] = [];
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      app_id: id, app_key: key, what: query, results_per_page: "50", "content-type": "application/json",
    });
    if (location && location.toLowerCase() !== "uk") params.set("where", location);
    const res = await fetch(`https://api.adzuna.com/v1/api/jobs/gb/search/${page}?${params}`);
    if (!res.ok) throw new Error(`Adzuna responded ${res.status}`);
    const { results } = (await res.json()) as { results: AdzunaResult[] };
    for (const r of results) {
      ads.push({
        title: r.title, company: r.company?.display_name ?? "Unknown", description: r.description ?? "",
        url: r.redirect_url, salaryMin: r.salary_min, salaryMax: r.salary_max, created: r.created,
      });
    }
  }
  return ads;
}
