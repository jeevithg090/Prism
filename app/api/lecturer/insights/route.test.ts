import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LecturerInsightsZ } from "@/lib/schemas/lecturer";

const { llmJSON, loadCohort, loadMap, loadProgramme, loadRoleDemand } = vi.hoisted(() => ({
  llmJSON: vi.fn(),
  loadCohort: vi.fn(),
  loadMap: vi.fn(),
  loadProgramme: vi.fn(),
  loadRoleDemand: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({ llmJSON, LLMError: class extends Error {} }));
vi.mock("@/lib/agents/cohort", () => ({ loadCohort, loadMap, loadProgramme, loadRoleDemand }));

import { GET } from "./route";

const ROLES = ["ml-engineer", "ml-engineer", "ml-engineer", "data-analyst", "software-engineer"];
const profiles = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `uid_${i}_zq`, name: `Student Name${i}Zq`, programmeId: "uom-bsc-cs", dna: { targetRoles: [ROLES[i % ROLES.length]] } }));
const skills = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`uid_${i}_zq`, { proven: i === 0 ? ["docker"] : [], gaps: i % 2 ? ["aws", "docker"] : ["sql"] }]));

/** P1's fixtures (programme + market) are present here, to exercise the primary path. */
const programme = {
  id: "uom-bsc-cs", university: "UoM", name: "BSc CS", url: "", extractedAt: "", source: "manual",
  modules: [
    { code: "COMP23311", title: "Software Engineering", year: 2, semester: "1", compulsory: true, topics: [], learningOutcomes: ["Work in teams", "Test code", "Deploy and evaluate software"], skills: [{ skillId: "testing", level: 2 }, { skillId: "git", level: 2 }] },
    { code: "COMP23111", title: "Database Systems", year: 2, semester: "1", compulsory: true, topics: [], learningOutcomes: ["Design a schema", "Query data"], skills: [{ skillId: "databases", level: 2 }] },
    { code: "COMP16321", title: "Programming 1", year: 1, semester: "1", compulsory: true, topics: [], learningOutcomes: ["Write Python programs"], skills: [{ skillId: "python", level: 2 }] },
  ],
};
const market = (shares: Record<string, number>) => ({ skills: Object.entries(shares).map(([skillId, share]) => ({ skillId, share })) });

let prevDemo: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  prevDemo = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;
  llmJSON.mockRejectedValue(new Error("no_key"));
  loadCohort.mockResolvedValue({ profiles: profiles(13), skills: skills(13) });
  loadMap.mockResolvedValue(undefined);
  loadProgramme.mockReturnValue(programme);
  loadRoleDemand.mockImplementation((roleId: string) =>
    roleId === "ml-engineer" ? market({ python: 0.62, docker: 0.41, aws: 0.33, sql: 0.35, git: 0.3, testing: 0.2, kubernetes: 0.04 })
      : roleId === "data-analyst" ? market({ sql: 0.7, python: 0.5 })
        : undefined,
  );
});
afterEach(() => {
  if (prevDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = prevDemo;
});

const call = (qs = "?programmeId=uom-bsc-cs") => GET(new Request(`http://localhost/api/lecturer/insights${qs}`));

describe("GET /api/lecturer/insights", () => {
  it("returns exactly the contract shape { gaps: {skillId, demandPct, studentsTargeting}[], labIdeas: string[] }", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Object.keys(json.data).sort()).toEqual(["gaps", "labIdeas"]);
    expect(LecturerInsightsZ.parse(json.data)).toEqual(json.data); // strict: no extra keys anywhere
    for (const g of json.data.gaps) expect(Object.keys(g).sort()).toEqual(["demandPct", "skillId", "studentsTargeting"]);
    // Covered by modules: python, testing, git. Demand is for the most-targeted role (ML engineer).
    expect(json.data.gaps.map((g: { skillId: string }) => g.skillId)).toEqual(["docker", "sql", "aws"]);
    expect(json.data.gaps[0]).toEqual({ skillId: "docker", demandPct: 41, studentsTargeting: 11 }); // 9 ML + 2 with the gap
    expect(json.data.labIdeas).toHaveLength(3);
    expect(json.data.labIdeas[0]).toContain("COMP23311 Software Engineering");
    expect(json.data.labIdeas[0]).toContain("learning outcome 3: 'Deploy and evaluate software'");
    expect(json.data.labIdeas[1]).toContain("COMP23111");
  });

  it("never includes user ids or names", async () => {
    const text = JSON.stringify(await (await call()).json());
    expect(text).not.toMatch(/uid_|zq/i);
    expect(text).not.toContain("Name");
  });

  it("hides everything below the anonymity threshold of 10 students", async () => {
    loadCohort.mockResolvedValue({ profiles: profiles(9), skills: skills(9) });
    const json = await (await call()).json();
    expect(json.data.gaps).toEqual([]);
    expect(json.data.labIdeas).toHaveLength(1);
    expect(json.data.labIdeas[0]).toMatch(/at least 10 students/);
  });

  it("falls back to Bridge Map demand and coverage when P1's fixtures are missing", async () => {
    loadProgramme.mockReturnValue(undefined);
    loadRoleDemand.mockReturnValue(undefined);
    loadMap.mockImplementation(async (id: string) => id === "uid_0_zq"
      ? { roleId: "ml-engineer", nodes: [
          { skillId: "python", status: "proven", demand: 0.62, moduleCodes: [] },
          { skillId: "testing", status: "degree-upcoming", demand: 0.15, moduleCodes: ["COMP2xxx3"] },
          { skillId: "docker", status: "gap", demand: 0.41, moduleCodes: [] },
        ] }
      : undefined);
    const json = await (await call()).json();
    expect(json.data.gaps).toEqual([{ skillId: "docker", demandPct: 41, studentsTargeting: 11 }]);
    expect(json.data.labIdeas[0]).toContain("COMP2xxx3");
  });

  it("is instant in DEMO_MODE (no LLM call)", async () => {
    process.env.DEMO_MODE = "true";
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data.gaps[0].skillId).toBe("docker");
    expect(llmJSON).not.toHaveBeenCalled();
  });

  it("returns 400 bad_request without a programmeId and 500 on failure", async () => {
    const bad = await call("");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("bad_request");
    loadCohort.mockRejectedValue(new Error("db down"));
    const err = await call();
    expect(err.status).toBe(500);
    expect(await err.json()).toEqual({ ok: false, error: { code: "internal", message: "Something went wrong on our side." } });
  });
});
