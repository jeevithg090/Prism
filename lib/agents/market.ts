import { z } from "zod";
import { emit } from "@/lib/agents/events";
import { matchSkills, getSkills } from "@/lib/agents/skillmap";
import { getTrends } from "@/lib/agents/trends";
import { readCached, withCache } from "@/lib/cache";
import { mapLimit } from "@/lib/concurrency";
import { searchAdzuna, type JobAd } from "@/lib/connectors/adzuna";
import { fcScrapeMarkdown } from "@/lib/connectors/firecrawl";
import { searchReed } from "@/lib/connectors/reed";
import { llmJSON } from "@/lib/llm";
import type { Role, RoleDemand, SkillId } from "@/lib/types";

const ROLES = [
  { id: "ml-engineer", name: "ML engineer", query: "machine learning engineer" },
  { id: "software-engineer", name: "Software engineer", query: "graduate software engineer" },
  { id: "data-analyst", name: "Data analyst", query: "data analyst" },
];

const FULL_TEXT_ADS = 15;
const MAX_CHARS = 3000;
const TOP_SKILLS = 40;

export function getRoles(): Role[] {
  return ROLES.map(({ id, name }) => ({ id, name }));
}

export function isKnownRole(roleId: string): boolean {
  return ROLES.some((r) => r.id === roleId);
}

export function dedupeAds(ads: JobAd[]): JobAd[] {
  const seen = new Set<string>();
  return ads.filter((a) => {
    const key = `${a.title}|${a.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function percentile(sorted: number[], p: number): number {
  const at = (sorted.length - 1) * p;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

export function salaryStats(ads: JobAd[]): RoleDemand["salary"] {
  const mids = ads
    .filter((a) => a.salaryMin != null && a.salaryMax != null)
    .map((a) => ((a.salaryMin as number) + (a.salaryMax as number)) / 2)
    .sort((a, b) => a - b);
  if (mids.length < 5) return undefined;
  const q = (p: number) => Math.round(percentile(mids, p));
  return { p25: q(0.25), median: q(0.5), p75: q(0.75), currency: "GBP" };
}

export function shareOfAds(skillsPerAd: Set<SkillId>[]): { skillId: SkillId; share: number }[] {
  const counts = new Map<SkillId, number>();
  for (const skills of skillsPerAd) {
    for (const id of skills) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .map(([skillId, n]) => ({ skillId, share: Math.round((n / skillsPerAd.length) * 100) / 100 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, TOP_SKILLS);
}

function topCompanies(ads: JobAd[]): RoleDemand["topCompanies"] {
  const counts = new Map<string, number>();
  for (const a of ads) counts.set(a.company, (counts.get(a.company) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
}

async function fetchAds(query: string, location: string): Promise<{ ads: JobAd[]; source: "adzuna" | "reed" }> {
  try {
    return { ads: await searchAdzuna(query, location), source: "adzuna" };
  } catch {
    return { ads: await searchReed(query), source: "reed" };
  }
}

async function addLlmSkills(texts: string[], perAd: Set<SkillId>[], runId?: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  const ids = getSkills().map((s) => s.id);
  const known = new Set(ids);
  const { ads } = await llmJSON({
    agent: "market",
    runId,
    system: "You map job ads onto a FIXED skill list. Only use ids from the list. Never invent ids.",
    user: `SKILL IDS: ${ids.join(", ")}\n\nADS:\n${JSON.stringify(texts.map((text, index) => ({ index, text })))}`,
    schema: z.object({ ads: z.array(z.object({ index: z.number(), skillIds: z.array(z.string()) })) }),
    schemaName: "skills per ad",
  });
  for (const ad of ads) {
    for (const id of ad.skillIds) if (known.has(id)) perAd[ad.index]?.add(id);
  }
}

async function liveDemand(role: (typeof ROLES)[number], location: string, runId: string): Promise<RoleDemand> {
  emit({ runId, agent: "market", status: "started", message: `Market Agent: searching ${role.name} ads` });
  const fetched = await fetchAds(role.query, location);
  const ads = dedupeAds(fetched.ads);
  emit({ runId, agent: "market", status: "progress", message: `found ${ads.length} ads` });

  const fullTexts = await mapLimit(ads.slice(0, FULL_TEXT_ADS), 5, (ad) =>
    fcScrapeMarkdown(ad.url).then((md) => md.slice(0, MAX_CHARS)).catch(() => ad.description));
  const texts = ads.map((a, i) => `${a.title}\n${fullTexts[i] ?? a.description}`);
  const perAd = texts.map((t) => new Set(matchSkills(t).map((s) => s.skillId)));
  await addLlmSkills(texts.slice(0, FULL_TEXT_ADS), perAd, runId).catch(() => {});

  const skills = shareOfAds(perAd);
  const top = skills[0];
  emit({
    runId, agent: "market", status: "progress",
    message: `analysed ${ads.length} ads${top ? ` · top skill ${top.skillId} ${Math.round(top.share * 100)}%` : ""}`,
  });
  const result: RoleDemand = {
    roleId: role.id, roleName: role.name, location, adsAnalysed: ads.length, skills,
    salary: salaryStats(ads), topCompanies: topCompanies(ads),
    sampleAds: ads.filter((a) => a.url).slice(0, 5).map(({ title, company, url }) => ({ title, company, url })),
    snapshotAt: new Date().toISOString(), source: fetched.source,
  };
  emit({ runId, agent: "market", status: "done", message: `${role.name} demand ready` });
  return result;
}

async function withTrendLabels(demand: RoleDemand): Promise<RoleDemand> {
  const labels = new Map((await getTrends()).map((t) => [t.skillId, t.label]));
  return {
    ...demand,
    skills: demand.skills.map(({ skillId, share }) => {
      const trend = labels.get(skillId);
      return trend ? { skillId, share, trend } : { skillId, share };
    }),
  };
}

export async function getRoleDemand(
  roleId: string,
  opts: { location?: string; runId?: string; refresh?: boolean } = {},
): Promise<RoleDemand> {
  const role = ROLES.find((r) => r.id === roleId);
  if (!role) throw new Error(`Unknown role: ${roleId}`);
  const key = `market-${roleId}-uk`;
  const fixture = `market.${roleId}.json`;
  const location = opts.location ?? "UK";
  const runId = opts.runId ?? crypto.randomUUID();

  const hasKeys = (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) || process.env.REED_API_KEY;
  if (!hasKeys) {
    const stored = await readCached<RoleDemand>(key, fixture);
    if (stored) return withTrendLabels(stored);
  }
  const demand = await withCache(key, () => liveDemand(role, location, runId), {
    ttlSec: 86400, fixture, refresh: opts.refresh,
  });
  return withTrendLabels(demand);
}
