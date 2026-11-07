import { SectionCard, StatusBadge } from "@/components/keystone";
import type { RoleSkillDemand, SkillId, TrendSeries } from "@/lib/types";
import { roleOutlook } from "./outlook";

const SENTENCE = { rising: "Demand is growing", stable: "Demand is holding steady", declining: "Demand is cooling" };

export function RoleOutlookCard({ skills, trends, names }: {
  skills: RoleSkillDemand[]; trends: TrendSeries[]; names: Record<SkillId, string>;
}) {
  const { label, leaders } = roleOutlook(skills, trends);
  const led = leaders.map((id) => names[id] ?? id).join(" and ");
  return (
    <SectionCard title="Role outlook">
      <StatusBadge status={label} />
      <p className="mt-2">{SENTENCE[label]}{led ? `, led by ${led}.` : "."}</p>
    </SectionCard>
  );
}
