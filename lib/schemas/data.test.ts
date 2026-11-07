import { describe, expect, it } from "vitest";
import skills from "@/data/skills.json";
import programme from "@/data/fixtures/programme.uom-bsc-cs.json";
import ml from "@/data/fixtures/market.ml-engineer.json";
import swe from "@/data/fixtures/market.software-engineer.json";
import analyst from "@/data/fixtures/market.data-analyst.json";
import trends from "@/data/fixtures/trends.json";
import { ProgrammeZ, RoleDemandZ, SkillZ, TrendSeriesZ } from "./data";

const CORE =
  "python java javascript typescript c cpp sql html-css react nodejs rest-apis git linux docker kubernetes aws cloud-computing ci-cd testing data-structures algorithms databases postgresql system-design security-basics statistics linear-algebra machine-learning deep-learning pytorch tensorflow scikit-learn pandas numpy data-visualisation llm-apps llm-evaluation vector-databases mlops code-review communication teamwork agile".split(" ");
const DEMO_GAPS = ["docker", "kubernetes", "aws", "ci-cd", "llm-evaluation", "vector-databases", "mlops"];
const ids = new Set(skills.map((s) => s.id));

describe("skills.json", () => {
  it("has at least 120 valid skills including every core id", () => {
    expect(skills.length).toBeGreaterThanOrEqual(120);
    skills.forEach((s) => SkillZ.parse(s));
    expect(CORE.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("has unique kebab-case ids", () => {
    expect(ids.size).toBe(skills.length);
    skills.forEach((s) => expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it("only references prereqs that exist, with no cycles", () => {
    const prereqs = new Map(skills.map((s) => [s.id, s.prereqs]));
    skills.forEach((s) => s.prereqs.forEach((p) => expect(ids.has(p)).toBe(true)));
    const done = new Set<string>();
    const visit = (id: string, trail: string[]) => {
      expect(trail).not.toContain(id);
      if (done.has(id)) return;
      prereqs.get(id)!.forEach((p) => visit(p, [...trail, id]));
      done.add(id);
    };
    skills.forEach((s) => visit(s.id, []));
  });

  it("has lowercase aliases that each point at one skill", () => {
    const seen = new Map<string, string>();
    for (const s of skills) {
      for (const a of s.aliases) {
        expect(a).toBe(a.toLowerCase());
        expect(seen.get(a) ?? s.id).toBe(s.id);
        seen.set(a, s.id);
      }
    }
  });
});

describe("fixtures", () => {
  it("programme parses and covers years 1-3 with at least 12 modules", () => {
    const p = ProgrammeZ.parse(programme);
    expect(p.modules.length).toBeGreaterThanOrEqual(12);
    expect(new Set(p.modules.map((m) => m.year))).toEqual(new Set([1, 2, 3]));
    expect(new Set(p.modules.map((m) => m.code)).size).toBe(p.modules.length);
  });

  it("programme uses known skills and leaves the demo gaps uncovered", () => {
    const used = ProgrammeZ.parse(programme).modules.flatMap((m) => m.skills.map((s) => s.skillId));
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
    expect(used.filter((id) => DEMO_GAPS.includes(id))).toEqual([]);
  });

  it.each([["ml", ml], ["swe", swe], ["analyst", analyst]])("market %s parses, is sorted and uses known skills", (_, f) => {
    const r = RoleDemandZ.parse(f);
    const shares = r.skills.map((s) => s.share);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    expect(r.skills.filter((s) => !ids.has(s.skillId))).toEqual([]);
    expect(r.topCompanies).toHaveLength(5);
    expect(r.sampleAds).toHaveLength(5);
  });

  it("ml-engineer has the demand figures the demo story quotes", () => {
    const share = Object.fromEntries(RoleDemandZ.parse(ml).skills.map((s) => [s.skillId, s.share]));
    expect(share).toMatchObject({
      python: 0.86, "machine-learning": 0.78, pytorch: 0.52, sql: 0.48, docker: 0.41, aws: 0.38,
      mlops: 0.33, "llm-apps": 0.31, kubernetes: 0.27, "llm-evaluation": 0.19,
      "vector-databases": 0.17, git: 0.45, statistics: 0.4, communication: 0.36,
    });
  });

  it("trends have 36 + 12 consecutive months, valid bands and matching labels", () => {
    expect(trends.length).toBeGreaterThanOrEqual(12);
    for (const raw of trends) {
      const t = TrendSeriesZ.parse(raw);
      expect(ids.has(t.skillId)).toBe(true);
      expect(t.history).toHaveLength(36);
      expect(t.projection).toHaveLength(12);
      expect(t.history[0].month).toBe("2023-11");
      expect(t.history[35].month).toBe("2026-10");
      expect(t.projection[0].month).toBe("2026-11");
      t.projection.forEach((p) => {
        expect(p.low).toBeLessThanOrEqual(p.share);
        expect(p.share).toBeLessThanOrEqual(p.high);
      });
      const label = t.growthPerYear > 0.15 ? "rising" : t.growthPerYear < -0.15 ? "declining" : "stable";
      expect(t.label).toBe(label);
    }
  });
});
