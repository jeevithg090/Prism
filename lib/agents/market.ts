import "server-only";
// Market Agent (P1): UK job ads (Adzuna, Reed fallback) → share of ads per skill, salary bands, top hirers.
// Live when ADZUNA_APP_ID/KEY (or REED_API_KEY) exist; otherwise, or if the live call fails, the cached snapshot.
import fs from "node:fs";
import path from "node:path";
import { emit } from "@/lib/agents/events";
import { matchSkills } from "@/lib/agents/skillmap";
import { trendLabels } from "@/lib/agents/trends";
import { withCache } from "@/lib/cache";
import { hasAdzunaKey, searchAdzuna, type JobAd } from "@/lib/connectors/adzuna";
import { hasReedKey, searchReed } from "@/lib/connectors/reed";
import type { Role, RoleDemand, RoleSkillDemand, SkillId } from "@/lib/types";

export const ROLES = [
  { id: "ml-engineer", name: "ML engineer", query: "machine learning engineer" },
  { id: "software-engineer", name: "Software engineer", query: "graduate software engineer" },
  { id: "data-analyst", name: "Data analyst", query: "data analyst" },
] as const;

export class UnknownRoleError extends Error {}

export function getRoles(): Role[] {
  return ROLES.map(({ id, name }) => ({ id, name }));
}
export function isRole(roleId: string): boolean {
  return ROLES.some((r) => r.id === roleId);
}

// ---------- pure helpers ----------

/** One ad per title + company (case-insensitive): agencies repost the same job many times. */
export function dedupeAds(ads: JobAd[]): JobAd[] {
  const seen = new Set<string>();
  return ads.filter((a) => {
    const k = `${a.title.toLowerCase().trim()}|${a.company.toLowerCase().trim()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** share[skill] = ads mentioning it / ads analysed, sorted desc, top `limit`, rounded to 2 dp. */
export function computeShares(adSkills: Iterable<SkillId>[], limit = 40): RoleSkillDemand[] {
  const total = adSkills.length;
  if (!total) return [];
  const counts = new Map<SkillId, number>();
  for (const skills of adSkills) for (const s of new Set(skills)) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([skillId, n]) => ({ skillId, share: Number((n / total).toFixed(2)) }))
    .sort((a, b) => b.share - a.share || a.skillId.localeCompare(b.skillId))
    .slice(0, limit);
}

/** Linear-interpolated percentile of an ascending array (p in 0..1). */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** p25 / median / p75 of salary midpoints; undefined with fewer than 5 salaries. */
export function salaryStats(ads: Pick<JobAd, "salaryMin" | "salaryMax">[]): RoleDemand["salary"] {
  const mids = ads
    .map((a) => (a.salaryMin && a.salaryMax ? (a.salaryMin + a.salaryMax) / 2 : a.salaryMin ?? a.salaryMax))
    .filter((v): v is number => typeof v === "number" && v >= 10_000 && v <= 400_000)
    .sort((a, b) => a - b);
  if (mids.length < 5) return undefined;
  const r = (v: number) => Math.round(v / 500) * 500;
  return { p25: r(percentile(mids, 0.25)), median: r(percentile(mids, 0.5)), p75: r(percentile(mids, 0.75)), currency: "GBP" };
}

export function topCompaniesOf(ads: JobAd[], n = 5): RoleDemand["topCompanies"] {
  const counts = new Map<string, number>();
  for (const a of ads) if (a.company && a.company !== "Unknown employer") counts.set(a.company, (counts.get(a.company) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));
}

/** Turn a batch of ads into RoleDemand (deterministic skill matching; trend labels joined by skill id). */
export function analyseAds(
  role: { id: string; name: string },
  ads: JobAd[],
  opts: { location: string; source: RoleDemand["source"]; trends?: Map<SkillId, RoleDemand["skills"][number]["trend"]>; now?: Date },
): RoleDemand {
  const unique = dedupeAds(ads);
  const perAd = unique.map((a) => [...matchSkills(`${a.title}. ${a.description}`).keys()]);
  const skills = computeShares(perAd).map((s) => {
    const trend = opts.trends?.get(s.skillId);
    return trend ? { ...s, trend } : s;
  });
  return {
    roleId: role.id, roleName: role.name, location: opts.location, adsAnalysed: unique.length, skills,
    salary: salaryStats(unique), topCompanies: topCompaniesOf(unique),
    sampleAds: unique.filter((a) => a.url).slice(0, 5).map((a) => ({ title: a.title, company: a.company, url: a.url })),
    snapshotAt: (opts.now ?? new Date()).toISOString(), source: opts.source,
  };
}

// ---------- data ----------

export function readMarketFixture(roleId: string): RoleDemand | null {
  for (const rel of [`data/cache/market-${roleId}-uk.json`, `data/fixtures/market.${roleId}.json`]) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as RoleDemand;
      if (d && Array.isArray(d.skills)) return d;
    } catch { /* next */ }
  }
  return null;
}

/** Fetch live ads: Adzuna first, Reed if Adzuna fails or has no key. */
export async function fetchAds(query: string, location: string): Promise<{ ads: JobAd[]; source: "adzuna" | "reed" }> {
  if (hasAdzunaKey()) {
    try {
      return { ads: await searchAdzuna(query, { where: location, pages: 2 }), source: "adzuna" };
    } catch (e) {
      if (!hasReedKey()) throw e;
    }
  }
  return { ads: await searchReed(query, { location, take: 100 }), source: "reed" };
}

const memo = new Map<string, { at: number; v: RoleDemand }>();
const TTL_MS = 24 * 60 * 60 * 1000;

const pctOf = (share: number) => `${Math.round(share * 100)}%`;

export async function getRoleDemand(
  roleId: string,
  opts: { location?: string; runId?: string; refresh?: boolean; demo?: boolean } = {},
): Promise<RoleDemand> {
  const role = ROLES.find((r) => r.id === roleId);
  if (!role) throw new UnknownRoleError(roleId);
  const location = opts.location ?? "UK";
  const { runId } = opts;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "market", status, message, data });
  };
  say("started", `Market Agent: reading ${location} job ads for ${role.name} roles`);

  const cached = (): RoleDemand => {
    const f = readMarketFixture(roleId);
    if (!f) throw new Error(`no cached snapshot for ${roleId}`);
    return f;
  };
  const live = !opts.demo && (hasAdzunaKey() || hasReedKey());

  const run = async (): Promise<RoleDemand> => {
    if (!live) return cached();
    const key = `${roleId}|${location.toLowerCase()}`;
    const hit = memo.get(key);
    if (hit && !opts.refresh && Date.now() - hit.at < TTL_MS) return hit.v;
    try {
      const { ads, source } = await fetchAds(role.query, location);
      say("progress", `Market Agent: found ${ads.length} ads on ${source === "adzuna" ? "Adzuna" : "Reed"}`, { ads: ads.length, source });
      if (!ads.length) throw new Error("no ads");
      const v = analyseAds(role, ads, { location, source, trends: await trendLabels() });
      memo.set(key, { at: Date.now(), v });
      return v;
    } catch {
      say("progress", "Market Agent: the job board didn't answer, so you're seeing the cached snapshot");
      return cached();
    }
  };

  const demand = opts.demo ? cached() : await withCache(`market-${roleId}-uk`, run, { ttlSec: 86400, fixture: `market.${roleId}.json` });
  const top = demand.skills[0];
  say(
    "done",
    `Market Agent: ${demand.adsAnalysed} ${role.name} ads analysed${top ? ` · top skill ${top.skillId} ${pctOf(top.share)}` : ""}${demand.source === "cache" ? " (cached snapshot)" : ""}`,
    { adsAnalysed: demand.adsAnalysed, skills: demand.skills.length, source: demand.source },
  );
  return demand;
}
