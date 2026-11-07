"use client";
// The 3 headline numbers for the projector: cohort size, share targeting the top role, top uncovered gap.
// Set as figures that compare (patterns.md): one row on the paper, split by hairlines, no tiles.
import { skillName } from "@/lib/schemas/community";
import type { LecturerCohort, LecturerInsights } from "@/lib/schemas/lecturer";
import { cn } from "@/lib/utils";

function Figure({ label, value, hint, mono = true }: { label: string; value: React.ReactNode; hint: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col border-t py-5 first:border-t-0 first:pt-0 md:border-t-0 md:border-l md:py-0 md:pl-6 md:first:border-l-0 md:first:pl-0">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-4xl leading-none font-semibold text-foreground md:text-5xl", mono ? "font-mono tabular-nums" : "font-sans")}>{value}</p>
      <p className="mt-3 text-sm text-pretty text-muted-foreground">{hint}</p>
    </div>
  );
}

export function LecturerStats({ cohort, insights }: { cohort: LecturerCohort; insights?: LecturerInsights }) {
  const topRole = cohort.roles.find((r) => r.roleId === "ml-engineer") ?? cohort.roles[0];
  const top = insights?.gaps[0];
  const demandRole = cohort.demandRole?.roleName ?? "target-role";
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 md:gap-6" data-testid="lecturer-stats">
      <Figure label="Students in this cohort" value={cohort.cohortSize} hint="Anonymous totals only, never individuals" />
      <Figure
        label={topRole ? `Targeting ${topRole.roleName} roles` : "Targeting a role"}
        value={topRole ? `${topRole.pct}%` : "None yet"}
        mono={Boolean(topRole)}
        hint={topRole ? `${topRole.students} of ${cohort.cohortSize} students' first-choice role` : "No target roles set yet"}
      />
      <Figure
        label="Top gap no module covers"
        value={top ? skillName(top.skillId) : insights ? "None" : "Checking"}
        mono={false}
        hint={top ? `${top.demandPct}% of ${demandRole} ads, ${top.studentsTargeting} students need it` : insights ? "Your modules cover every high-demand skill" : "Checking the syllabus"}
      />
    </div>
  );
}
