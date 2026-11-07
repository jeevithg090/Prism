import { beforeEach, describe, expect, it, vi } from "vitest";

const { llmJSON, loadCohort, loadMap, loadProgramme, loadRoleDemand } = vi.hoisted(() => ({
  llmJSON: vi.fn(),
  loadCohort: vi.fn(),
  loadMap: vi.fn(),
  loadProgramme: vi.fn(),
  loadRoleDemand: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({ llmJSON, LLMError: class extends Error {} }));
vi.mock("@/lib/agents/cohort", () => ({ loadCohort, loadMap, loadProgramme, loadRoleDemand }));

import {
  THRESHOLD_MESSAGE, buildLecturerInsights, computeCohortRoles, computeLecturerGaps, templateLabIdeas,
  type CohortStudent, type Coverage, type DemandByRole,
} from "./lecturer";

const demand: DemandByRole = {
  "ml-engineer": { python: 0.6, docker: 0.41, pytorch: 0.38, sql: 0.35, mlops: 0.28, "llm-apps": 0.26, kubernetes: 0.18, tiny: 0.05, git: 0.3 },
};
const coverage: Coverage = {
  covered: new Set(["python", "testing", "databases", "machine-learning"]),
  unknown: new Set(["git"]),
  modules: [
    { code: "COMP2xxx3", skills: ["testing"], learningOutcomes: [] },
    { code: "COMP2xxx1", skills: ["databases"], learningOutcomes: [] },
    { code: "COMP2xxx2", skills: ["machine-learning"], learningOutcomes: [] },
  ],
  source: "map",
};
/** 10 students: 6 target ML, 4 target software engineering (no demand data for that role). */
function students(): CohortStudent[] {
  return [
    ...Array.from({ length: 6 }, () => ({ primaryRole: "ml-engineer", gaps: [] as string[] })),
    { primaryRole: "software-engineer", gaps: ["docker", "kubernetes"] },
    { primaryRole: "software-engineer", gaps: ["kubernetes"] },
    { primaryRole: "software-engineer", gaps: ["sql"] },
    { primaryRole: null, gaps: [] },
  ];
}

describe("computeLecturerGaps", () => {
  it("lists high-demand skills no module covers, ranked by demand × students, top 6", () => {
    const gaps = computeLecturerGaps({ students: students(), demand, coverage });
    // python is covered, git's coverage is unknown, "tiny" is under 10% of ads
    expect(gaps.map((g) => g.skillId)).toEqual(["docker", "sql", "pytorch", "mlops", "llm-apps", "kubernetes"]);
    expect(gaps[0]).toEqual({ skillId: "docker", demandPct: 41, studentsTargeting: 7 }); // 6 ML + 1 SE gap
    expect(gaps.find((g) => g.skillId === "kubernetes")).toEqual({ skillId: "kubernetes", demandPct: 18, studentsTargeting: 8 });
    expect(gaps.find((g) => g.skillId === "sql")?.studentsTargeting).toBe(7);
    for (const g of gaps) expect(Object.keys(g).sort()).toEqual(["demandPct", "skillId", "studentsTargeting"]);
  });

  it("returns nothing under 10 students or without coverage data", () => {
    expect(computeLecturerGaps({ students: students().slice(0, 9), demand, coverage })).toEqual([]);
    expect(computeLecturerGaps({ students: students(), demand, coverage: { ...coverage, source: "none" } })).toEqual([]);
  });
});

describe("computeCohortRoles", () => {
  it("gives the anonymous role split and the role demand refers to", () => {
    const r = computeCohortRoles("uom-bsc-cs", students(), demand);
    expect(r).toEqual({
      programmeId: "uom-bsc-cs", cohortSize: 10, suppressed: false,
      demandRole: { roleId: "ml-engineer", roleName: "ML engineer" },
      roles: [
        { roleId: "ml-engineer", roleName: "ML engineer", students: 6, pct: 60 },
        { roleId: "software-engineer", roleName: "Software engineer", students: 3, pct: 30 },
      ],
    });
    expect(computeCohortRoles("uom-bsc-cs", students().slice(0, 4), demand)).toMatchObject({ suppressed: true, roles: [], demandRole: null });
  });
});

describe("templateLabIdeas", () => {
  it("links each idea to an existing module that teaches a related skill", () => {
    const gaps = computeLecturerGaps({ students: students(), demand, coverage });
    const ideas = templateLabIdeas(gaps, coverage.modules);
    expect(ideas).toHaveLength(3);
    expect(ideas[0]).toMatch(/^Add a containerised deployment step to the COMP2xxx3 coursework: .*Docker image/);
    expect(ideas[0]).toContain("already teaches about testing");
    expect(ideas[1]).toContain("COMP2xxx1"); // SQL → the databases module
    expect(ideas[2]).toContain("COMP2xxx2"); // PyTorch → the machine-learning module
  });

  it("quotes a learning outcome when the syllabus gives them", () => {
    const modules = [{ code: "COMP23311", title: "Software Engineering", skills: ["testing"], learningOutcomes: ["Work in a team", "Plan a project", "Deploy and evaluate software."] }];
    const [idea] = templateLabIdeas([{ skillId: "docker", demandPct: 41, studentsTargeting: 8 }], modules);
    expect(idea).toBe(
      "Add a containerised deployment step to the COMP23311 Software Engineering coursework: students ship their solution as a Docker image a marker can run with one command (supports learning outcome 3: 'Deploy and evaluate software').",
    );
  });
});

describe("buildLecturerInsights", () => {
  const profiles = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: `stu_ml_${i}`, programmeId: "uom-bsc-cs", dna: { targetRoles: ["ml-engineer"] } })),
    { id: "stu_se_0", programmeId: "uom-bsc-cs", dna: { targetRoles: ["software-engineer"] } },
  ];
  const map = {
    userId: "stu_ml_0", roleId: "ml-engineer", edges: [], readinessNow: 0.38, readinessProjected: 0.8, generatedAt: "",
    nodes: [
      { skillId: "python", status: "proven", demand: 0.62, moduleCodes: [] },
      { skillId: "testing", status: "degree-upcoming", demand: 0.15, moduleCodes: ["COMP2xxx3"] },
      { skillId: "docker", status: "gap", demand: 0.41, moduleCodes: [] },
    ],
  };
  beforeEach(() => {
    vi.clearAllMocks();
    loadCohort.mockResolvedValue({ profiles, skills: { stu_se_0: { proven: [], gaps: ["docker"] } } });
    loadMap.mockImplementation(async (id: string, role: string) => (id === "stu_ml_0" && role === "ml-engineer" ? map : undefined));
    loadProgramme.mockReturnValue(undefined);
    loadRoleDemand.mockReturnValue(undefined);
  });

  it("falls back to deterministic lab ideas when the LLM throws", async () => {
    llmJSON.mockRejectedValue(new Error("no_key"));
    const r = await buildLecturerInsights("uom-bsc-cs");
    expect(llmJSON).toHaveBeenCalledOnce();
    expect(r.gaps).toEqual([{ skillId: "docker", demandPct: 41, studentsTargeting: 10 }]);
    expect(r.labIdeas).toHaveLength(1);
    expect(r.labIdeas[0]).toContain("COMP2xxx3");
  });

  it("uses the LLM's ideas when it answers, and skips it in demo mode", async () => {
    llmJSON.mockResolvedValue({ labIdeas: ["Add a Docker build to COMP2xxx3 (supports outcome 2).", "Idea two for a module.", "Idea three for a module.", "A fourth idea, dropped."] });
    expect((await buildLecturerInsights("uom-bsc-cs")).labIdeas).toEqual(["Add a Docker build to COMP2xxx3 (supports outcome 2).", "Idea two for a module.", "Idea three for a module."]);
    llmJSON.mockClear();
    await buildLecturerInsights("uom-bsc-cs", { demo: true });
    expect(llmJSON).not.toHaveBeenCalled();
  });

  it("shows only the threshold note under 10 students", async () => {
    loadCohort.mockResolvedValue({ profiles: profiles.slice(0, 5), skills: {} });
    expect(await buildLecturerInsights("uom-bsc-cs")).toEqual({ gaps: [], labIdeas: [THRESHOLD_MESSAGE] });
    expect(llmJSON).not.toHaveBeenCalled();
  });
});
