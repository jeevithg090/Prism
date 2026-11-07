import { describe, expect, it, vi } from "vitest";
import { matchSkills } from "@/lib/agents/skillmap";
import { stripHtml } from "@/lib/connectors/hn";
import type { TrendPoint } from "@/lib/types";
import { forecast } from "./trends";

vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));

const month = (i: number) => new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 7);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const series = (share: (t: number) => number): TrendPoint[] =>
  Array.from({ length: 36 }, (_, t) => ({ month: month(t), share: share(t) }));

describe("forecast", () => {
  it("calls a flat series stable", () => {
    const f = forecast(series(() => 0.1));
    expect(Math.abs(f.growthPerYear)).toBeLessThan(0.01);
    expect(f.label).toBe("stable");
  });

  it("recovers the growth of a rising series", () => {
    const f = forecast(series((t) => sigmoid(-3 + 0.05 * t)));
    expect(f.growthPerYear).toBeCloseTo(Math.exp(0.6) - 1, 2);
    expect(f.label).toBe("rising");
  });

  it("projects 12 months with a valid band", () => {
    const f = forecast(series((t) => 0.2 + 0.01 * Math.sin(t) + 0.002 * t));
    expect(f.projection).toHaveLength(12);
    for (const p of f.projection) {
      expect(p.low).toBeLessThanOrEqual(p.share);
      expect(p.share).toBeLessThanOrEqual(p.high);
      expect(p.low).toBeGreaterThanOrEqual(0);
      expect(p.high).toBeLessThanOrEqual(1);
    }
  });

  it("continues month labels from the last history point", () => {
    const f = forecast(series(() => 0.1));
    expect(f.projection[0].month).toBe(month(36));
  });

  it("calls a falling series declining", () => {
    expect(forecast(series((t) => sigmoid(-1 - 0.05 * t))).label).toBe("declining");
  });
});

it("strips HN comment HTML so skills still match", () => {
  const text = stripHtml("<p>We use <i>Rust</i> &amp; Go</p>");
  expect(text).toBe("We use Rust & Go");
  expect(matchSkills(text).map((s) => s.skillId)).toEqual(expect.arrayContaining(["rust", "go"]));
});
