import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(async () => { throw new Error("offline"); }) }));
import { generateRoadmap } from "@/lib/agents/roadmap";
import profileFixture from "@/data/fixtures/profile.aisha.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import programmeFixture from "@/data/fixtures/programme.uom-bsc-cs.json";
import marketFixture from "@/data/fixtures/market.ml-engineer.json";
import trendsFixture from "@/data/fixtures/trends.json";
import type { BridgeMap, Profile, Programme, RoleDemand, TrendSeries } from "@/lib/types";

describe("generateRoadmap", () => {
  it("creates twelve weeks of balanced template tasks when the LLM is unavailable", async () => {
    const roadmap = await generateRoadmap({
      profile: profileFixture as Profile, map: mapFixture as BridgeMap,
      programme: programmeFixture as Programme, roleDemand: marketFixture as RoleDemand,
      trends: trendsFixture as TrendSeries[], now: new Date("2026-11-07T12:00:00Z"),
    });
    expect(roadmap.weeks).toHaveLength(12);
    expect(roadmap.weeks.every((week) => week.tasks.reduce((sum, task) => sum + task.hours, 0) === (week.isExamWeek ? 4 : 8))).toBe(true);
    expect(roadmap.weeks.some((week) => week.isExamWeek)).toBe(true);
    expect(roadmap.weeks.every((week) => week.tasks.length >= 2)).toBe(true);
  });
});
