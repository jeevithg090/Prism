// "Use demo data" fallback for the Lecturer Insights page: the routes' actual output on the seeded
// uom-bsc-cs cohort (12 seeded students + Aisha), so the view still works if an API is down mid-demo.
import type { LecturerCohort, LecturerInsights } from "@/lib/schemas/lecturer";
import type { PodInsights } from "@/lib/schemas/studio";

export const DEMO_COHORT: LecturerCohort = {
  programmeId: "uom-bsc-cs",
  cohortSize: 13,
  suppressed: false,
  demandRole: { roleId: "ml-engineer", roleName: "ML engineer" },
  roles: [
    { roleId: "ml-engineer", roleName: "ML engineer", students: 6, pct: 46 },
    { roleId: "software-engineer", roleName: "Software engineer", students: 4, pct: 31 },
    { roleId: "data-analyst", roleName: "Data analyst", students: 3, pct: 23 },
  ],
};

export const DEMO_INSIGHTS: LecturerInsights = {
  gaps: [
    { skillId: "docker", demandPct: 41, studentsTargeting: 8 },
    { skillId: "aws", demandPct: 33, studentsTargeting: 9 },
    { skillId: "sql", demandPct: 35, studentsTargeting: 8 },
    { skillId: "pytorch", demandPct: 38, studentsTargeting: 6 },
    { skillId: "mlops", demandPct: 28, studentsTargeting: 6 },
    { skillId: "llm-apps", demandPct: 26, studentsTargeting: 6 },
  ],
  labIdeas: [
    "Add a containerised deployment step to the COMP2xxx3 coursework: students ship their solution as a Docker image a marker can run with one command (builds on what COMP2xxx3 already teaches about testing).",
    "Add a cloud deployment lab to COMP3xxx2: students deploy their service to a free-tier cloud account and explain the cost and security trade-offs (builds on what COMP3xxx2 already teaches about system design).",
    "Add a hands-on SQL lab to COMP2xxx1: students write joins, aggregates and window functions against a real open dataset, checked by automated tests (builds on what COMP2xxx1 already teaches about databases).",
  ],
};

export const DEMO_POD_INSIGHTS: PodInsights = {
  programmeId: "uom-bsc-cs",
  cohortSize: 13,
  podsCount: 1,
  suppressed: false,
  peerTeachable: [
    { skillId: "aws", teachers: 1, learners: 5 },
    { skillId: "docker", teachers: 1, learners: 5 },
    { skillId: "sql", teachers: 2, learners: 4 },
    { skillId: "pytorch", teachers: 1, learners: 4 },
    { skillId: "react", teachers: 2, learners: 3 },
    { skillId: "machine-learning", teachers: 1, learners: 3 },
    { skillId: "python", teachers: 7, learners: 2 },
    { skillId: "typescript", teachers: 2, learners: 2 },
  ],
  unteachableGaps: [
    { skillId: "kubernetes", studentsWithGap: 3 },
    { skillId: "mlops", studentsWithGap: 3 },
    { skillId: "system-design", studentsWithGap: 2 },
    { skillId: "communication", studentsWithGap: 1 },
    { skillId: "llm-apps", studentsWithGap: 1 },
    { skillId: "llm-evaluation", studentsWithGap: 1 },
    { skillId: "teamwork", studentsWithGap: 1 },
    { skillId: "vector-databases", studentsWithGap: 1 },
  ],
};

export const PROGRAMME_LABELS: Record<string, string> = {
  "uom-bsc-cs": "BSc Computer Science, University of Manchester",
};
