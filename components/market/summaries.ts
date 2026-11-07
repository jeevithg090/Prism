// Industry Radar: pure helpers for numbers in context and the one-sentence chart summaries (DESIGN.md §10).
import { skillName } from "@/lib/schemas/community";
import type { Role, RoleDemand, SkillId, SkillStatus, TrendLabel, TrendSeries } from "@/lib/types";

/** The roles the Market Agent covers (same as GET /api/roles). */
export const ROLES: Role[] = [
  { id: "ml-engineer", name: "ML engineer" },
  { id: "software-engineer", name: "Software engineer" },
  { id: "data-analyst", name: "Data analyst" },
];

export function subtitleFor(roleName: string): string {
  return `What ${roleInSentence(roleName)} roles ask for right now, and where it's heading`;
}

export type StatusBySkill = Record<SkillId, SkillStatus>;
/** skillId → the first roadmap week that focuses on it. */
export type RoadmapWeeks = Record<SkillId, number>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-10" → "Oct 2027"; short: "Oct 27". */
export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTHS[(m || 1) - 1];
  return short ? `${name} ${String(y).slice(2)}` : `${name} ${y}`;
}

/** Share of ads as a whole percent: 0.41 → "41%". */
export const pctAds = (share: number) => `${Math.round(share * 100)}%`;
/** Share of posts with one decimal below 10%: 0.045 → "4.5%", 0.172 → "17%". */
export function pctPosts(share: number): string {
  const v = share * 100;
  return v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}
/** 0.67 → "+67% a year", −0.21 → "−21% a year". */
export function growthText(g: number): string {
  const v = Math.round(g * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}% a year`;
}
export function fmtSalary(n: number): string {
  return `£${Math.round(n / 1000)}k`;
}
/** "ML engineer" stays; "Software engineer" → "software engineer" mid-sentence. */
export function roleInSentence(roleName: string): string {
  return /^[A-Z]{2}/.test(roleName) ? roleName : roleName.charAt(0).toLowerCase() + roleName.slice(1);
}

export type UserTag = "proven" | "degree" | "gap";
export function userTag(status?: SkillStatus): UserTag | undefined {
  if (!status) return undefined;
  return status === "proven" ? "proven" : status === "gap" ? "gap" : "degree";
}
const TAG_WORDS: Record<UserTag, string> = { proven: "you've proven it", degree: "your degree covers it", gap: "it's a gap for you" };
export function tagWords(status?: SkillStatus): string {
  const t = userTag(status);
  if (!t) return "not on your map yet";
  if (status === "degree-upcoming") return "your degree covers it later";
  return TAG_WORDS[t];
}

const TREND_WORD: Record<TrendLabel, string> = { rising: "rising", stable: "stable", declining: "cooling" };
export const trendWord = (t?: TrendLabel) => (t ? TREND_WORD[t] : undefined);

/** One sentence for the skill demand chart. */
export function demandSummary(demand: RoleDemand, statusBySkill: StatusBySkill): string {
  const role = roleInSentence(demand.roleName);
  if (!demand.skills.length) return `We haven't analysed any ${role} ads yet.`;
  const [top] = demand.skills;
  const topIsGap = statusBySkill[top.skillId] === "gap";
  const head = topIsGap
    ? `${skillName(top.skillId)} is the most asked-for skill: ${pctAds(top.share)} of ${demand.adsAnalysed} ${role} ads. It's your biggest gap, and no module covers it.`
    : `${skillName(top.skillId)} is the most asked-for skill: ${pctAds(top.share)} of ${demand.adsAnalysed} ${role} ads, and ${tagWords(statusBySkill[top.skillId])}.`;
  const gap = demand.skills.find((s) => statusBySkill[s.skillId] === "gap" && s.skillId !== top.skillId);
  if (!gap) return head;
  if (topIsGap) return `${head} Next is ${skillName(gap.skillId)}: ${pctAds(gap.share)} of ads.`;
  const trend = gap.trend === "rising" ? ", it's rising" : "";
  return `${head} Your biggest gap is ${skillName(gap.skillId)}: ${pctAds(gap.share)} of ads${trend}, and no module covers it.`;
}

/** One sentence per series for the trend chart. */
export function trendSummary(series: TrendSeries[]): string {
  if (!series.length) return "Pick a skill to see where hiring for it is heading.";
  return series
    .map((s) => {
      const now = s.history.at(-1);
      const end = s.projection.at(-1);
      const base = `${skillName(s.skillId)} is ${trendWord(s.label)} (${growthText(s.growthPerYear)})`;
      if (!now || !end) return `${base}.`;
      return `${base}: ${pctPosts(now.share)} of Hacker News job posts in ${monthLabel(now.month)}, projected ${pctPosts(end.share)} (${pctPosts(end.low)}–${pctPosts(end.high)}) by ${monthLabel(end.month)}.`;
    })
    .join(" ");
}

export type RisingItem = { skillId: SkillId; growthPerYear: number; share: number; week?: number; status?: SkillStatus };

/** Rising skills the role asks for, fastest first, with the roadmap week that covers each (if any). */
export function risingForRole(demand: RoleDemand, trends: TrendSeries[], statusBySkill: StatusBySkill, weeks: RoadmapWeeks | null): RisingItem[] {
  const share = new Map(demand.skills.map((s) => [s.skillId, s.share]));
  return trends
    .filter((t) => t.label === "rising" && share.has(t.skillId))
    .sort((a, b) => b.growthPerYear - a.growthPerYear)
    .map((t) => ({ skillId: t.skillId, growthPerYear: t.growthPerYear, share: share.get(t.skillId)!, week: weeks?.[t.skillId], status: statusBySkill[t.skillId] }));
}

/** Default chart picks: the fastest-rising skill the role asks for, plus your biggest gap that has trend data. */
export function defaultPicks(demand: RoleDemand, trends: TrendSeries[], statusBySkill: StatusBySkill): SkillId[] {
  const has = new Set(trends.map((t) => t.skillId));
  const rising = risingForRole(demand, trends, statusBySkill, null)[0]?.skillId;
  const gap = demand.skills.find((s) => has.has(s.skillId) && statusBySkill[s.skillId] === "gap" && s.skillId !== rising)?.skillId;
  const top = demand.skills.find((s) => has.has(s.skillId) && s.skillId !== rising)?.skillId;
  return [...new Set([rising, gap ?? top].filter((s): s is SkillId => !!s))];
}
