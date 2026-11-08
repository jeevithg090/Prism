// The P1 fixtures parse, agree with each other and with Aisha's Bridge Map, and the trends match the forecaster.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_test" }));
import { forecast } from "@/lib/agents/trends";
import type { BridgeMap, RoleDemand, TrendSeries } from "@/lib/types";
import { ProgrammeZ, RoleDemandZ, SkillZ, TrendSeriesZ } from "./data";
import { getSkills } from "@/lib/agents/skillmap";

const read = <T,>(rel: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
const ROLES = ["ml-engineer", "software-engineer", "data-analyst"];
const ids = new Set(getSkills().map((s) => s.id));

describe("P1 fixtures", () => {
  it("skills (with merged aliases) parse", () => {
    for (const s of getSkills()) SkillZ.parse(s);
  });

  it("programme parses", () => {
    ProgrammeZ.parse(read("data/fixtures/programme.uom-bsc-cs.json"));
  });

  it.each(ROLES)("market.%s parses, is sorted by share, uses taxonomy ids and has 5 companies + 5 ads", (roleId) => {
    const d = RoleDemandZ.parse(read<RoleDemand>(`data/fixtures/market.${roleId}.json`));
    expect(d.roleId).toBe(roleId);
    expect(d.source).toBe("cache");
    expect(d.skills.map((s) => s.share)).toEqual([...d.skills.map((s) => s.share)].sort((a, b) => b - a));
    for (const s of d.skills) expect(ids.has(s.skillId)).toBe(true);
    expect(d.topCompanies).toHaveLength(5);
    expect(d.sampleAds).toHaveLength(5);
    expect(d.salary!.p25).toBeLessThan(d.salary!.median);
    expect(d.salary!.median).toBeLessThan(d.salary!.p75);
  });

  it("ML engineer demand equals the demand on Aisha's Bridge Map", () => {
    const d = read<RoleDemand>("data/fixtures/market.ml-engineer.json");
    expect(d.adsAnalysed).toBe(214);
    expect(d.salary!.median).toBe(52000);
    expect(d.skills.slice(0, 6).map((s) => [s.skillId, s.share])).toEqual([["python", 0.62], ["machine-learning", 0.55], ["docker", 0.41], ["pytorch", 0.38], ["sql", 0.35], ["pandas", 0.34]]);
    const map = read<BridgeMap>("data/fixtures/bridgemap.aisha.ml-engineer.json");
    const share = new Map(d.skills.map((s) => [s.skillId, s.share]));
    for (const n of map.nodes) expect(share.get(n.skillId), n.skillId).toBe(n.demand);
    for (const n of map.nodes.filter((x) => x.trend)) expect(d.skills.find((s) => s.skillId === n.skillId)?.trend, n.skillId).toBe(n.trend);
  });

  it("trends: ≥ 12 skills × 36 months + 12 projected, recomputable by forecast(), with the demo labels", () => {
    const all = read<TrendSeries[]>("data/fixtures/trends.json");
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const s of all) {
      TrendSeriesZ.parse(s);
      expect(ids.has(s.skillId)).toBe(true);
      expect(s.history).toHaveLength(36);
      expect(s.history[0].month).toBe("2023-11");
      expect(s.history[35].month).toBe("2026-10");
      expect(s.projection).toHaveLength(12);
      expect(forecast(s.history)).toEqual({ projection: s.projection, growthPerYear: s.growthPerYear, label: s.label });
    }
    const label = Object.fromEntries(all.map((s) => [s.skillId, s.label]));
    expect(label).toMatchObject({ "llm-evaluation": "rising", "llm-apps": "rising", docker: "rising", tensorflow: "declining", python: "stable" });
    const g = Object.fromEntries(all.map((s) => [s.skillId, s.growthPerYear]));
    expect(g["llm-evaluation"]).toBeGreaterThan(0.5);
    expect(g["llm-evaluation"]).toBe(Math.max(...Object.values(g)));
  });
});
