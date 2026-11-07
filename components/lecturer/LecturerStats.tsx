"use client";
// The 3 headline numbers for the projector: cohort size, share targeting the top role, top uncovered gap.
import { StatCard } from "@/components/keystone";
import { skillName } from "@/lib/schemas/community";
import type { LecturerCohort, LecturerInsights } from "@/lib/schemas/lecturer";

export function LecturerStats({ cohort, insights }: { cohort: LecturerCohort; insights?: LecturerInsights }) {
  const topRole = cohort.roles.find((r) => r.roleId === "ml-engineer") ?? cohort.roles[0];
  const top = insights?.gaps[0];
  const demandRole = cohort.demandRole?.roleName ?? "target-role";
  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="lecturer-stats">
      <StatCard label="Students in this cohort" value={cohort.cohortSize} hint="Anonymous totals only, never individuals" />
      <StatCard
        label={topRole ? `Targeting ${topRole.roleName} roles` : "Targeting a role"}
        value={topRole ? `${topRole.pct}%` : "–"}
        hint={topRole ? `${topRole.students} of ${cohort.cohortSize} students' first-choice role` : "No target roles set yet"}
      />
      <StatCard
        label="Top gap no module covers"
        value={top ? skillName(top.skillId) : insights ? "None" : "…"}
        hint={top ? `${top.demandPct}% of ${demandRole} ads · ${top.studentsTargeting} students need it` : insights ? "Your modules cover every high-demand skill" : "Checking the syllabus"}
      />
    </div>
  );
}
