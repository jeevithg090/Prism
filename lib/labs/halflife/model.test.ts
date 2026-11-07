import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { logit, sigmoid } from "@/lib/agents/trends";
import type { Module, Programme, TrendPoint, TrendSeries } from "@/lib/types";
import {
  article, buildEdges, cohortDemand, computeHalfLife, draftNote, driftFor, fitSkill, inSentence, moduleHalfLifeYears,
  moduleIndex, pickOutcome, shareAt, skillHalfLifeYears, taughtSkills, type HalfLifeConfig, type SkillFit,
} from "./model";

const read = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
const CFG = read<HalfLifeConfig>("data/fixtures/labs/halflife.json");
const PROGRAMME = read<Programme>("data/fixtures/programme.uom-bsc-cs.json");
const TRENDS = read<TrendSeries[]>("data/fixtures/trends.json");

/** A noiseless logit-linear series: logit(p_t) = logit(p0) + b·t, 24 months ending 2026-10. */
function series(skillId: string, p0: number, slopePerMonth: number, months = 24): Pick<TrendSeries, "skillId" | "history"> {
  const history: TrendPoint[] = Array.from({ length: months }, (_, i) => {
    const m = 2026 * 12 + 9 - (months - 1) + i; // the last point is 2026-10
    return { month: `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`, share: Number(sigmoid(logit(p0) + slopePerMonth * i).toFixed(8)) };
  });
  return { skillId, history };
}

const mod = (code: string, year: 1 | 2 | 3, skills: [string, 1 | 2 | 3][], los: string[] = [], topics: string[] = []): Module => ({
  code, title: `Module ${code}`, year, semester: "1", compulsory: true, topics, learningOutcomes: los,
  skills: skills.map(([skillId, level]) => ({ skillId, level })),
});

describe("fitSkill + half-life maths", () => {
  it("recovers the logit slope and gives the analytic half-life for a falling skill", () => {
    const b = -0.02; // per month
    const f = fitSkill(series("java", 0.08, b))!;
    expect(f.slope).toBeCloseTo(b, 6);
    expect(f.label).toBe("declining");
    expect(f.growthPerYear).toBeCloseTo(Math.exp(12 * b) - 1, 6);
    const expected = (logit(f.shareNow / 2) - f.y0) / b / 12;
    expect(skillHalfLifeYears(f)).toBeCloseTo(Math.round(expected * 10) / 10, 6);
    expect(shareAt(f, 0)).toBeCloseTo(f.shareNow, 9);
  });

  it("has no half-life for a rising or flat skill, and refuses series that are too short", () => {
    expect(skillHalfLifeYears(fitSkill(series("docker", 0.1, 0.015))!)).toBeNull();
    expect(skillHalfLifeYears(fitSkill(series("sql", 0.1, 0))!)).toBeNull();
    expect(fitSkill({ skillId: "x", history: [{ month: "2026-01", share: 0.1 }] })).toBeNull();
  });

  it("combines skills by level: a growing skill slows the module's decay", () => {
    const falling = fitSkill(series("java", 0.1, -0.03))!;
    const rising = fitSkill(series("typescript", 0.1, 0.01))!;
    const alone = moduleHalfLifeYears([{ fit: falling, w: 2 }])!;
    const mixed = moduleHalfLifeYears([{ fit: falling, w: 2 }, { fit: rising, w: 1 }]);
    expect(alone).toBeGreaterThan(0);
    expect(mixed === null || mixed > alone).toBe(true);
    expect(moduleIndex([{ fit: falling, w: 2 }], 0)).toBeCloseTo(1, 9);
    expect(moduleHalfLifeYears([])).toBeNull();
  });
});

describe("taughtSkills", () => {
  it("adds skills found in topics and outcomes, but not soft skills from ordinary prose", () => {
    const t = taughtSkills(mod("C1", 3, [["system-design", 2]], ["Design a service"], ["Communication and remote procedure calls", "Packaging services with Docker"]));
    expect(t.map((x) => x.skillId).sort()).toEqual(["docker", "system-design"]);
    expect(t.find((x) => x.skillId === "docker")?.source).toBe("topics");
  });
});

describe("drift", () => {
  const fits = new Map<string, SkillFit>([
    ["docker", fitSkill(series("docker", 0.12, 0.015))!],
    ["pytorch", fitSkill(series("pytorch", 0.05, 0.015))!],
    ["kubernetes", fitSkill(series("kubernetes", 0.08, 0.002))!], // stable: never drift
  ]);
  const edges = buildEdges([{ from: "linux", to: "docker", kind: "prereq" }], { pytorch: ["python", "numpy"], kubernetes: ["docker"] }, { ...CFG, pairs: [] });
  const coverage = new Map([["Y1", new Set(["linux", "python"])], ["Y2", new Set(["numpy", "machine-learning"])]]);
  const years = new Map([["Y1", 1], ["Y2", 2]]);
  const demand = new Map([["docker", 0.4], ["pytorch", 0.3]]);

  it("a prerequisite edge counts only when the programme covers every prerequisite by that module's year", () => {
    const y1 = driftFor("Y1", coverage.get("Y1")!, { edges, fits, cohortDemand: demand, coverage, years });
    expect(y1.map((d) => d.skillId)).toEqual(["docker"]); // pytorch needs numpy, taught only in year 2
    expect(y1[0].via).toMatchObject({ skillId: "linux", kind: "prereq" });
    expect(y1[0].points).toBeCloseTo(Math.round(1000 * 0.4 * fits.get("docker")!.growthPerYear) / 10, 6);
    const y2 = driftFor("Y2", coverage.get("Y2")!, { edges, fits, cohortDemand: demand, coverage, years });
    expect(y2.map((d) => d.skillId)).toEqual(["pytorch"]);
  });

  it("a skill another module already teaches is shown but scores 0", () => {
    const cov = new Map([...coverage, ["Y3", new Set(["docker"])]]);
    const y1 = driftFor("Y1", cov.get("Y1")!, { edges, fits, cohortDemand: demand, coverage: cov, years: new Map([...years, ["Y3", 3]]) });
    expect(y1[0]).toMatchObject({ skillId: "docker", coveredBy: ["Y3"], points: 0 });
  });

  it("curated pairs connect skills with no prerequisite path, with their reason", () => {
    const e = buildEdges([], {}, CFG);
    const out = driftFor("DL", new Set(["deep-learning"]), { edges: e, fits: new Map([["llm-apps", fitSkill(series("llm-apps", 0.1, 0.03))!]]), cohortDemand: new Map(), coverage: new Map([["DL", new Set(["deep-learning"])]]), years: new Map([["DL", 3]]) });
    expect(out[0]).toMatchObject({ skillId: "llm-apps", via: { kind: "co-occurs", skillId: "deep-learning" } });
    expect(out[0].via.why).toMatch(/transformer/);
  });
});

describe("notes", () => {
  it("links a rebalance note to the outcome that names the cooling skill, with a rising successor", () => {
    const fits = new Map([["java", fitSkill(series("java", 0.05, -0.02))!], ["typescript", fitSkill(series("typescript", 0.15, 0.015))!]]);
    const m = mod("OOP1", 1, [["java", 2]], ["Design small object-oriented programs", "Write readable Java code that uses the standard collections"]);
    const note = draftNote({
      module: m, drift: [], parts: { decay: 40, drift: 0 }, halfLifeYears: 2.9, fits, cfg: CFG,
      taught: [{ skillId: "java", name: "Java", level: 2, source: "syllabus", tracked: true, growthPerYear: fits.get("java")!.growthPerYear, shareNow: 0.05 }],
    })!;
    expect(note.kind).toBe("rebalance");
    expect(note.learningOutcomeIndex).toBe(1);
    expect(note.skillIds).toEqual(["java", "typescript"]);
    expect(note.text).toMatch(/Revise learning outcome 2/);
    expect(note.text).toMatch(/TypeScript is rising/);
    expect(note.text).toMatch(/half-life 2\.9 years/);
  });

  it("picks outcomes by skill mention first, then keywords", () => {
    expect(pickOutcome(["Explain things", "Work confidently at a Linux command line"], { mention: "linux" })).toBe(1);
    expect(pickOutcome(["Explain things", "Deploy a service"], { keywords: ["deploy"] })).toBe(1);
    expect(pickOutcome([], {})).toBe(0);
  });

  it("writes plain English", () => {
    expect(article("LLM apps")).toBe("an");
    expect(article("MLOps")).toBe("an");
    expect(article("Docker")).toBe("a");
    expect(inSentence("deep-learning")).toBe("deep learning");
    expect(inSentence("linux")).toBe("Linux");
    expect(inSentence("llm-apps")).toBe("LLM apps");
  });
});

describe("computeHalfLife on the real fixtures", () => {
  const out = computeHalfLife({
    programme: PROGRAMME, trends: TRENDS, cfg: CFG, horizonYears: 3,
    edges: buildEdges([{ from: "linux", to: "docker", kind: "prereq" }], { pytorch: ["python", "numpy"], docker: ["linux"] }, CFG),
    cohortDemand: cohortDemand([{ roleId: "a", weight: 1 }], { a: { docker: 0.41, "llm-apps": 0.26, mlops: 0.28, pytorch: 0.38 } }),
  });

  it("ranks the Java module first with a ~3 year half-life, and every module has an urgency in 0..100", () => {
    const [top] = out.modules;
    expect(top.code).toBe("COMP1xxx2");
    expect(top.status).toBe("decaying");
    expect(top.halfLifeYears).toBeGreaterThan(2.5);
    expect(top.halfLifeYears).toBeLessThan(3.5);
    expect(top.refreshNote?.text).toContain("learning outcome 2");
    for (const m of out.modules) {
      expect(m.urgency).toBeGreaterThanOrEqual(0);
      expect(m.urgency).toBeLessThanOrEqual(100);
    }
    expect(out.lastDataMonth).toBe("2026-10");
    expect(out.horizonMonth).toBe("2029-10");
  });

  it("flags LLM apps as drift next to the deep learning modules, and asks colleagues to agree an owner", () => {
    const nlp = out.modules.find((m) => m.code === "COMP3xxx3")!;
    expect(nlp.drift[0].skillId).toBe("llm-apps");
    expect(nlp.refreshNote?.text).toMatch(/^Add an LLM apps exercise to COMP3xxx3/);
    expect(nlp.refreshNote?.text).toMatch(/also sits next to COMP3xxx1/);
  });

  it("is deterministic and sorted by urgency", () => {
    const again = computeHalfLife({
      programme: PROGRAMME, trends: TRENDS, cfg: CFG, horizonYears: 3,
      edges: buildEdges([{ from: "linux", to: "docker", kind: "prereq" }], { pytorch: ["python", "numpy"], docker: ["linux"] }, CFG),
      cohortDemand: cohortDemand([{ roleId: "a", weight: 1 }], { a: { docker: 0.41, "llm-apps": 0.26, mlops: 0.28, pytorch: 0.38 } }),
    });
    expect(again).toEqual(out);
    const u = out.modules.map((m) => m.urgency);
    expect([...u].sort((a, b) => b - a)).toEqual(u);
  });

  it("weights demand by the cohort's role mix", () => {
    const d = cohortDemand([{ roleId: "a", weight: 3 }, { roleId: "b", weight: 1 }, { roleId: "missing", weight: 5 }], { a: { x: 0.4 }, b: { x: 0 } });
    expect(d.get("x")).toBeCloseTo(0.3, 9);
  });
});
