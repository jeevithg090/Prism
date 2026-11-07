import "server-only";
import type { JobAd } from "@/lib/connectors/adzuna";

interface ReedResult {
  jobTitle: string; employerName?: string; jobDescription?: string; jobUrl: string;
  minimumSalary?: number | null; maximumSalary?: number | null; date?: string;
}

export async function searchReed(query: string): Promise<JobAd[]> {
  const key = process.env.REED_API_KEY;
  if (!key) throw new Error("Reed key is not set");
  const params = new URLSearchParams({ keywords: query, resultsToTake: "100" });
  const res = await fetch(`https://www.reed.co.uk/api/1.0/search?${params}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Reed responded ${res.status}`);
  const { results } = (await res.json()) as { results: ReedResult[] };
  return results.map((r) => ({
    title: r.jobTitle, company: r.employerName ?? "Unknown", description: r.jobDescription ?? "", url: r.jobUrl,
    salaryMin: r.minimumSalary ?? undefined, salaryMax: r.maximumSalary ?? undefined, created: r.date,
  }));
}
