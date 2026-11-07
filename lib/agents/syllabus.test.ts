import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { emit, fcSearch } = vi.hoisted(() => ({ emit: vi.fn(), fcSearch: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit, newRunId: () => "run_test" }));
vi.mock("@/lib/connectors/firecrawl", () => ({ fcSearch }));

import { dedupeUnits, extractProgramme, getProgramme, normaliseSemester, parseUnitsFromText, yearFromCode } from "./syllabus";
import { ProgrammeZ } from "@/lib/schemas/data";

const COURSE_TEXT = `
COMP23111 Database Systems (20 credits)
Semester 1
Topics
- The relational model and SQL queries
- Transactions and concurrency
Learning outcomes
- Design a normalised database schema

COMP24112 Machine Learning
Semester 2
- Supervised learning with scikit-learn
- Build models in Python with pandas
`;

let prev: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  prev = process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (prev === undefined) delete process.env.FIRECRAWL_API_KEY; else process.env.FIRECRAWL_API_KEY = prev;
});

describe("normalisation", () => {
  it("semester strings and years from codes", () => {
    expect(normaliseSemester("Semester 2")).toBe("2");
    expect(normaliseSemester("Full year")).toBe("full-year");
    expect(normaliseSemester("Semesters 1 and 2")).toBe("full-year");
    expect(normaliseSemester(undefined)).toBe("1");
    expect(yearFromCode("COMP23111")).toBe(2);
    expect(yearFromCode("COMP1xxx4")).toBe(1);
    expect(yearFromCode("nonsense")).toBeUndefined();
  });

  it("dedupes units by code, then title", () => {
    expect(dedupeUnits([{ code: "COMP23111", title: "Databases" }, { code: "COMP23111", title: "Database Systems" }, { title: "Ethics" }, { title: "ethics" }])).toHaveLength(2);
  });

  it("parses units, topics and outcomes from pasted text", () => {
    const units = parseUnitsFromText(COURSE_TEXT);
    expect(units.map((u) => u.code)).toEqual(["COMP23111", "COMP24112"]);
    expect(units[0]).toMatchObject({ title: "Database Systems", credits: 20, semester: "Semester 1" });
    expect(units[0].topics).toEqual(["The relational model and SQL queries", "Transactions and concurrency"]);
    expect(units[0].learning_outcomes).toEqual(["Design a normalised database schema"]);
  });
});

describe("extractProgramme", () => {
  it("text mode never calls Firecrawl and maps skills per module", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const p = await extractProgramme({ text: COURSE_TEXT, programmeId: "uom-bsc-cs", runId: "run_s" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fcSearch).not.toHaveBeenCalled();
    expect(ProgrammeZ.parse(p)).toBeTruthy();
    expect(p.source).toBe("manual");
    expect(p.modules.map((m) => [m.code, m.year, m.semester])).toEqual([["COMP23111", 2, "1"], ["COMP24112", 2, "2"]]);
    expect(p.modules[0].skills.map((s) => s.skillId)).toEqual(expect.arrayContaining(["sql", "databases"]));
    expect(p.modules[1].skills.find((s) => s.skillId === "python")?.level).toBe(3);
    expect(p.modules[1].industryNote).toBeTruthy();
    const steps = emit.mock.calls.map(([e]) => `${e.status}:${String(e.message).split(":")[1]?.trim().split(" ")[0]}`);
    expect(steps).toEqual(["started:reading", "progress:extracted", "progress:mapped", "done:2"]);
  });

  it("without a Firecrawl key, a URL returns the saved syllabus", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const p = await extractProgramme({ url: "https://www.manchester.ac.uk/cs", programmeId: "uom-bsc-cs" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(p.source).toBe("cache");
    expect(p.modules.length).toBeGreaterThanOrEqual(12);
  });

  it("with a key, scrapes the page and searches for more unit pages when it finds fewer than 3 units", async () => {
    process.env.FIRECRAWL_API_KEY = "fc";
    fcSearch.mockResolvedValue([{ url: "https://uni.ac.uk/unit-1", title: "u1" }, { url: "https://uni.ac.uk/unit-2", title: "u2" }]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const { url } = JSON.parse(String(init?.body));
      const md = url.endsWith("unit-1") ? "COMP11120 Mathematical Techniques\n- Linear algebra and statistics" : url.endsWith("unit-2") ? "COMP16321 Programming 1\n- Write Python programs" : "# BSc Computer Science\nA great course.";
      return Response.json({ success: true, data: { markdown: md } });
    });
    const p = await extractProgramme({ url: "https://uni.ac.uk/bsc-cs", programmeId: "test-prog" });
    expect(fcSearch).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(p.source).toBe("firecrawl");
    expect(p.modules.map((m) => m.code)).toEqual(["COMP11120", "COMP16321"]);
    expect(p.modules[0].skills.map((s) => s.skillId)).toEqual(expect.arrayContaining(["linear-algebra", "statistics"]));
  });

  it("in DEMO_MODE returns the fixture without any network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const p = await extractProgramme({ url: "https://example.com", programmeId: "uom-bsc-cs", demo: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(p.id).toBe("uom-bsc-cs");
  });
});

describe("the UoM fixture", () => {
  const p = getProgramme("uom-bsc-cs")!;
  const all = p.modules.flatMap((m) => m.skills.map((s) => s.skillId));

  it("has ≥ 12 modules across years 1–3 and parses", () => {
    expect(ProgrammeZ.parse(p)).toBeTruthy();
    expect(p.modules.length).toBeGreaterThanOrEqual(12);
    expect(new Set(p.modules.map((m) => m.year))).toEqual(new Set([1, 2, 3]));
    expect(p.modules.every((m) => m.industryNote && m.learningOutcomes.length)).toBe(true);
  });

  it("puts statistics + linear algebra in Y1S2, databases in Y2, ML in Y2S2", () => {
    const where = (id: string) => p.modules.filter((m) => m.skills.some((s) => s.skillId === id)).map((m) => `${m.year}:${m.semester}`);
    expect(where("statistics")).toEqual(["1:2"]);
    expect(where("linear-algebra")).toEqual(["1:2"]);
    expect(where("databases")).toEqual(["2:1"]);
    expect(where("machine-learning")).toContain("2:2");
  });

  it("covers none of the demo gaps (Docker, AWS, MLOps, LLM apps…)", () => {
    for (const gap of ["docker", "aws", "mlops", "llm-apps", "llm-evaluation", "kubernetes", "ci-cd", "vector-databases", "pytorch", "sql"]) expect(all).not.toContain(gap);
  });
});
