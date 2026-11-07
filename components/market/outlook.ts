import type { RoleSkillDemand, SkillId, TrendLabel, TrendSeries } from "@/lib/types";

const THRESHOLD = 0.1;
const TOP = 10;

export function roleOutlook(skills: RoleSkillDemand[], trends: TrendSeries[]): { label: TrendLabel; leaders: SkillId[] } {
  const growth = new Map(trends.map((t) => [t.skillId, t.growthPerYear]));
  const top = skills.filter((s) => growth.has(s.skillId)).slice(0, TOP);
  const weight = top.reduce((sum, s) => sum + s.share, 0);
  const mean = weight ? top.reduce((sum, s) => sum + s.share * (growth.get(s.skillId) ?? 0), 0) / weight : 0;
  const label: TrendLabel = mean > THRESHOLD ? "rising" : mean < -THRESHOLD ? "declining" : "stable";
  const leaders = [...top]
    .sort((a, b) => (growth.get(b.skillId) ?? 0) - (growth.get(a.skillId) ?? 0))
    .slice(0, 2)
    .map((s) => s.skillId);
  return { label, leaders };
}
