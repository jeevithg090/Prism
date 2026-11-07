// Plan Change Requests: the pure diff engine (refresh refit, hunks, checks, apply).
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { BridgeMap, Pod, Roadmap, RoleDemand, TrendSeries } from "@/lib/types";
import { CHURN_THRESHOLD, applyHunks, lockedWeeks, priorityOf, proposeHunks, readinessFor, riskOf, runChecks, signalsFrom, titleFor } from "./diff";
import { applyRefresh, isoWeek, weeklyScenario, type Scenario } from "./refresh";

const rd = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;
const trends = rd<TrendSeries[]>("data/fixtures/trends.json");
const market = rd<RoleDemand>("data/fixtures/market.ml-engineer.json");
const map = rd<BridgeMap>("data/fixtures/bridgemap.aisha.ml-engineer.json");
const roadmap = rd<Roadmap>("data/fixtures/roadmap.aisha.ml-engineer.json");
const pod = rd<Pod>("data/fixtures/pod.aisha.json");
const scenario = rd<Scenario>("data/fixtures/labs/changereq.refresh.json");
const NOW = new Date("2026-11-07T15:00:00Z");

const refreshed = applyRefresh(trends, market, scenario);
const before = signalsFrom(market, trends);
const after = signalsFrom(refreshed.market, refreshed.trends);
const propose = (r: Roadmap = roadmap, a = after) => proposeHunks({ roadmap: r, nodes: map.nodes, before, after: a, now: NOW });

describe("refresh", () => {
  it("appends one month and refits every series with the Trend Forecaster's OLS", () => {
    expect(refreshed.month).toBe("2026-11");
    expect(refreshed.seriesRefit).toBe(trends.length);
    const evalAfter = refreshed.trends.find((t) => t.skillId === "llm-evaluation")!;
    const evalBefore = trends.find((t) => t.skillId === "llm-evaluation")!;
    expect(evalAfter.history.at(-1)).toEqual({ month: "2026-11", share: Number((evalBefore.history.at(-1)!.share * 1.6).toFixed(4)) });
    expect(evalAfter.growthPerYear).toBeGreaterThan(evalBefore.growthPerYear);
    expect(evalAfter.projection).toHaveLength(12);
    expect(refreshed.trends.find((t) => t.skillId === "kubernetes")!.growthPerYear).toBeLessThan(trends.find((t) => t.skillId === "kubernetes")!.growthPerYear);
  });
  it("re-weights the ads and keeps them sorted", () => {
    const share = (id: string) => refreshed.market!.skills.find((s) => s.skillId === id)!.share;
    expect(share("llm-evaluation")).toBeCloseTo(0.18, 3);
    expect(share("kubernetes")).toBeCloseTo(0.13, 3);
    const shares = refreshed.market!.skills.map((s) => s.share);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });
  it("seeds the non-demo refresh by ISO week, so the same week always gives the same shocks", () => {
    expect(isoWeek(new Date("2026-11-09T00:00:00Z"))).toBe("2026-W46");
    expect(weeklyScenario(NOW, ["docker"])).toEqual(weeklyScenario(new Date("2026-11-08T23:00:00Z"), ["docker"]));
    const s = weeklyScenario(NOW, ["docker", "sql"]);
    expect(Math.abs(s.shocks.docker.trend)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(s.shocks.sql.market)).toBeLessThanOrEqual(0.03);
  });
});

describe("proposeHunks", () => {
  it("turns the demo refresh into two reorders for Aisha: LLM evaluation and vector databases move up", () => {
    const hunks = propose();
    expect(hunks.map((h) => [h.kind, h.week, h.outgoing.after.skillId, h.incoming.after.skillId, h.otherWeek])).toEqual([
      ["reorder", 7, "ci-cd", "llm-evaluation", 11],
      ["reorder", 8, "kubernetes", "vector-databases", 10],
    ]);
    expect(hunks[0].receipt).toContain("LLM evaluation is now in 18% of ML engineer ads (was 10%)");
    expect(hunks[0].weeksSooner).toBe(4);
    expect(titleFor(hunks)).toBe("Move LLM evaluation up to week 7 and 1 more change");
  });
  it("opens nothing when the market did not move (no churn without a cause)", () => {
    expect(propose(roadmap, before)).toEqual([]);
  });
  it("every hunk is caused by the refresh: it clears the threshold now and did not before", () => {
    const byId = new Map(map.nodes.map((n) => [n.skillId, n]));
    for (const h of propose()) {
      const inc = byId.get(h.incoming.after.skillId)!, out = byId.get(h.outgoing.after.skillId)!;
      expect(priorityOf(inc, after)).toBeGreaterThan(priorityOf(out, after) * (1 + CHURN_THRESHOLD));
      expect(priorityOf(inc, before)).toBeLessThanOrEqual(priorityOf(out, before) * (1 + CHURN_THRESHOLD));
    }
  });
  it("never touches a locked week (ticked or starting within 7 days)", () => {
    const ticked: Roadmap = { ...roadmap, weeks: roadmap.weeks.map((w) => (w.week === 7 ? { ...w, tasks: w.tasks.map((t, i) => (i === 0 ? { ...t, done: true } : t)) } : w)) };
    const locked = lockedWeeks(ticked, NOW);
    expect([...locked].sort((a, b) => a - b)).toEqual([1, 7]);
    const hunks = propose(ticked);
    for (const h of hunks) {
      expect(locked.has(h.week)).toBe(false);
      if (h.otherWeek) expect(locked.has(h.otherWeek)).toBe(false);
    }
    expect(hunks.some((h) => h.week === 7)).toBe(false);
  });
  it("swaps in an unplanned skill when it overtakes a planned week (TensorFlow out, LLM evaluation in)", () => {
    const tf: Roadmap = { ...roadmap, weeks: roadmap.weeks.map((w) => (w.focusSkillId === "llm-evaluation" ? { ...w, focusSkillId: "tensorflow" } : w)) };
    const hunks = propose(tf);
    const swap = hunks.find((h) => h.incoming.after.skillId === "llm-evaluation")!;
    expect(swap.kind).toBe("swap-in");
    expect(swap.otherWeek).toBeUndefined();
    expect(swap.receipt).toContain("leaves your 12 weeks");
  });
});

describe("checks and apply", () => {
  const hunks = propose();
  const readiness = readinessFor(roadmap, map.nodes, after, hunks);
  const next = applyHunks({ roadmap, hunks, nodes: map.nodes, pod, theoryPractice: 70, changeRequestNumber: 1, now: NOW, readinessAfter: readiness.after });

  it("writes version 2 with the swapped weeks, the same hours, fresh receipts and untouched other weeks", () => {
    expect(next.version).toBe(2);
    const focus = next.weeks.map((w) => w.focusSkillId);
    expect(focus[6]).toBe("llm-evaluation");
    expect(focus[10]).toBe("ci-cd");
    expect(focus[7]).toBe("vector-databases");
    expect(focus[9]).toBe("kubernetes");
    for (const w of next.weeks) {
      const old = roadmap.weeks.find((o) => o.week === w.week)!;
      expect(w.tasks.reduce((s, t) => s + t.hours, 0)).toBe(old.tasks.reduce((s, t) => s + t.hours, 0));
      expect(w.startDate).toBe(old.startDate);
      expect(w.tasks.every((t) => t.id.startsWith(`t_${w.week}_`))).toBe(true);
    }
    expect(next.weeks[0]).toEqual(roadmap.weeks[0]);
    expect(next.weeks[6].receipt.reason).toContain("Change request #1 moved it to week 7");
    expect(next.weeks[6].receipt.demandPct).toBe(18);
  });
  it("passes every check for the demo request (low risk)", () => {
    const checks = runChecks({ roadmap, next, hunks, nodes: map.nodes, edges: map.edges, pod, locked: lockedWeeks(roadmap, NOW), after, readiness });
    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ["hours", "pass"], ["locked", "pass"], ["prereqs", "pass"], ["pod", "pass"], ["readiness", "pass"], ["confidence", "pass"],
    ]);
    expect(checks[0].detail).toBe("88 hours across 12 weeks (was 88).");
    expect(riskOf(checks)).toBe("low");
    expect(readiness).toEqual({ before: 0.84, after: 0.84 });
  });
  it("flags a moved pod issue and an out-of-order prerequisite", () => {
    const k8sFirst: Roadmap = { ...roadmap, weeks: roadmap.weeks.map((w) => (w.week === 2 ? { ...w, focusSkillId: "kubernetes" } : w.week === 8 ? { ...w, focusSkillId: "pytorch" } : w)) };
    const fakeHunk = { ...hunks[0], week: 2, otherWeek: 8, incoming: { before: hunks[1].outgoing.before, after: hunks[1].outgoing.after } };
    const docker3: Roadmap = { ...k8sFirst, weeks: k8sFirst.weeks.map((w) => (w.week === 1 ? { ...w, focusSkillId: "sql" } : w.week === 3 ? { ...w, focusSkillId: "docker" } : w)) };
    const checks = runChecks({ roadmap: k8sFirst, next: docker3, hunks: [fakeHunk], nodes: map.nodes, edges: map.edges, pod, locked: new Set(), after, readiness: { before: 0.84, after: 0.8 } });
    const by = new Map(checks.map((c) => [c.id, c]));
    expect(by.get("prereqs")!.status).toBe("warn");
    expect(by.get("prereqs")!.detail).toContain("Docker (week 3) comes after Kubernetes (week 2)");
    expect(by.get("readiness")!.status).toBe("fail");
    expect(riskOf(checks)).toBe("high");
  });
});
