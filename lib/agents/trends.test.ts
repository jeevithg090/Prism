import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_test" }));

import { addMonths, forecast, labelFor, logit, olsFit, sigmoid, toSeries } from "./trends";
import { monthlyShares, stripHtml } from "@/lib/connectors/hn";
import { matchSkills } from "./skillmap";
import type { TrendPoint } from "@/lib/types";

/** n monthly points from 2024-11 whose logit follows a + b·i exactly. */
const series = (n: number, a: number, b: number): TrendPoint[] =>
  Array.from({ length: n }, (_, i) => ({ month: addMonths("2024-11", i), share: sigmoid(a + b * i) }));

describe("olsFit", () => {
  it("recovers slope and intercept of an exact line with zero residual error", () => {
    const xs = [0, 1, 2, 3, 4];
    const fit = olsFit(xs, xs.map((x) => 3 + 2 * x));
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(3, 10);
    expect(fit.residualSE).toBeCloseTo(0, 10);
    expect(fit.sxx).toBe(10);
  });

  it("matches a hand-computed fit on noisy data", () => {
    // y = 1, 3, 2, 5, 4 → b = 0.8, a = 1.4, SSE = 3.6, s = √(3.6 / 3)
    const fit = olsFit([0, 1, 2, 3, 4], [1, 3, 2, 5, 4]);
    expect(fit.slope).toBeCloseTo(0.8, 10);
    expect(fit.intercept).toBeCloseTo(1.4, 10);
    expect(fit.residualSE).toBeCloseTo(Math.sqrt(1.2), 10);
  });
});

describe("forecast", () => {
  it("a constant share of 0.1 gives growth ≈ 0 and the label stable", () => {
    const f = forecast(Array.from({ length: 36 }, (_, i) => ({ month: addMonths("2023-11", i), share: 0.1 })));
    expect(Math.abs(f.growthPerYear)).toBeLessThan(0.01);
    expect(f.label).toBe("stable");
    expect(f.projection.every((p) => Math.abs(p.share - 0.1) < 1e-3)).toBe(true);
  });

  it("logit rising 0.05 a month gives growth e^0.6 − 1 ≈ 0.82 and the label rising", () => {
    const f = forecast(series(36, logit(0.02), 0.05));
    expect(f.growthPerYear).toBeCloseTo(Math.exp(0.6) - 1, 2);
    expect(f.label).toBe("rising");
  });

  it("a declining series gives declining", () => {
    const f = forecast(series(30, logit(0.08), -0.03));
    expect(f.growthPerYear).toBeCloseTo(Math.exp(-0.36) - 1, 2);
    expect(f.label).toBe("declining");
  });

  it("only fits the last 24 months", () => {
    const flatThenRising = [...series(12, logit(0.05), 0), ...series(24, logit(0.05), 0.04)].map((p, i) => ({ ...p, month: addMonths("2023-11", i) }));
    expect(forecast(flatThenRising).growthPerYear).toBeCloseTo(Math.exp(0.48) - 1, 2);
  });

  it("projects 12 months, continuing the month labels, with low ≤ share ≤ high inside [0, 1] and a widening band", () => {
    const noisy = series(36, logit(0.1), 0.01).map((p, i) => ({ ...p, share: p.share * (1 + (i % 3 === 0 ? 0.06 : -0.03)) }));
    const f = forecast(noisy);
    expect(f.projection).toHaveLength(12);
    expect(f.projection[0].month).toBe(addMonths(noisy.at(-1)!.month, 1));
    expect(f.projection[11].month).toBe(addMonths(noisy.at(-1)!.month, 12));
    for (const p of f.projection) {
      expect(p.low).toBeGreaterThanOrEqual(0);
      expect(p.high).toBeLessThanOrEqual(1);
      expect(p.low).toBeLessThanOrEqual(p.share);
      expect(p.share).toBeLessThanOrEqual(p.high);
    }
    const width = (i: number) => f.projection[i].high - f.projection[i].low;
    expect(width(11)).toBeGreaterThan(width(0));
  });

  it("uses thresholds of ±15% a year", () => {
    expect(labelFor(0.16)).toBe("rising");
    expect(labelFor(0.15)).toBe("stable");
    expect(labelFor(-0.14)).toBe("stable");
    expect(labelFor(-0.16)).toBe("declining");
  });

  it("handles empty and unsorted histories", () => {
    expect(forecast([])).toEqual({ projection: [], growthPerYear: 0, label: "stable" });
    const s = toSeries("docker", [{ month: "2026-02", share: 0.1 }, { month: "2026-01", share: 0.1 }, { month: "2026-03", share: 0.1 }]);
    expect(s.history.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(s.projection[0].month).toBe("2026-04");
    expect(s.source).toBe("hn-whoishiring");
  });

  it("addMonths rolls over the year", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
});

describe("HN connector", () => {
  it("strips HTML and decodes entities, and the result maps to rust and go", () => {
    const text = stripHtml("<p>We use <i>Rust</i> &amp; Go</p>");
    expect(text).toBe("We use Rust & Go");
    expect(stripHtml("Docker&#x2F;Kubernetes<p>Remote &quot;UK&quot;")).toBe('Docker/Kubernetes Remote "UK"');
  });

  it("monthlyShares counts each post once per skill, per month in order", () => {
    const out = monthlyShares(
      [
        { month: "2026-10", comments: ["Docker and docker compose", "Python only", "We use Docker"] },
        { month: "2026-09", comments: ["Python, Docker", "Java"] },
      ],
      ["docker", "python"],
      (t) => matchSkills(t).keys(),
    );
    expect(out.docker).toEqual([{ month: "2026-09", share: 0.5 }, { month: "2026-10", share: 0.6667 }]);
    expect(out.python.map((p) => p.share)).toEqual([0.5, 0.3333]);
  });
});
