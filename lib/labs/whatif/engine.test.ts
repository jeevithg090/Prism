import { describe, expect, it } from "vitest";
import mapJson from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import roadmapJson from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import trendsJson from "@/data/fixtures/trends.json";
import type { BridgeMap, Roadmap, TrendSeries } from "@/lib/types";
import {
  ASSUMPTIONS, buildProposedRoadmap, diffRoadmaps, hoursInWeek, mulberry32, orderQueue, planQueue, quantile,
  blockFirst, movableWeeks, rescaleTasks, simulate, verdictFor, weeklyHours, type PlanSpec, type SimContext,
} from "./engine";

const map = mapJson as unknown as BridgeMap;
const roadmap = roadmapJson as unknown as Roadmap;
const trends = trendsJson as unknown as TrendSeries[];
const now = new Date(ASSUMPTIONS.demoNow);

const ctx = (over: Partial<SimContext> = {}): SimContext => {
  const base = { nodes: map.nodes, edges: map.edges, startedAt: "2026-09-21", targetDate: "2027-09-01", now, trends, roadmap };
  return {
    userId: "aisha", roleId: "ml-engineer", now, startedAt: base.startedAt, targetDate: base.targetDate,
    readinessNow: map.readinessNow, nodes: map.nodes, edges: map.edges, queue: planQueue(base), trends, ...over,
  };
};
const plan = (over: Partial<PlanSpec> = {}): PlanSpec => ({ id: "a", label: "Docker first", hoursPerWeek: 8, firstSkillId: "docker", jobHoursLost: 0, placement: false, ...over });

describe("what-if engine: helpers", () => {
  it("mulberry32 is seeded and deterministic", () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("quantile interpolates a sorted array", () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4);
  });
  it("orderQueue moves the first skill to the front only when it is queued", () => {
    expect(orderQueue(["docker", "pytorch", "sql"], "sql")).toEqual(["sql", "docker", "pytorch"]);
    expect(orderQueue(["docker", "pytorch"], "rust")).toEqual(["docker", "pytorch"]);
  });
  it("hoursInWeek applies the roadmap's exam rule, the job and the placement", () => {
    expect(hoursInWeek(plan(), { exam: false, placement: false })).toBe(8);
    expect(hoursInWeek(plan(), { exam: true, placement: false })).toBe(4);
    expect(hoursInWeek(plan({ jobHoursLost: 3 }), { exam: false, placement: false })).toBe(5);
    expect(hoursInWeek(plan({ jobHoursLost: 10 }), { exam: false, placement: false })).toBe(0);
    expect(hoursInWeek(plan({ placement: true }), { exam: false, placement: true })).toBe(ASSUMPTIONS.placement.learningHoursPerWeek);
  });
  it("planQueue follows the stored roadmap's focus skills, without proven or degree-done ones", () => {
    const q = planQueue({ nodes: map.nodes, edges: map.edges, startedAt: "2026-09-21", targetDate: "2027-09-01", now, trends, roadmap });
    expect(q.slice(0, 3)).toEqual(["docker", "pytorch", "sql"]);
    expect(q).not.toContain("python");
    const fromPlanner = planQueue({ nodes: map.nodes, edges: map.edges, startedAt: "2026-09-21", targetDate: "2027-09-01", now, trends, roadmap: null });
    expect(fromPlanner.length).toBeGreaterThan(0);
  });
});

describe("what-if engine: simulate (Aisha, demo data)", () => {
  const result = simulate(ctx(), [plan(), plan({ id: "b", label: "PyTorch first", firstSkillId: "pytorch" })]);
  const [a, b] = result.plans;

  it("starts from the Bridge Map's stored readiness and runs to the target date", () => {
    expect(result.readinessNow).toBe(0.38);
    expect(result.startDate).toBe("2026-11-09");
    expect(result.weeks).toBeGreaterThan(40);
    expect(result.runs).toBe(ASSUMPTIONS.runs);
    expect(result.plans).toHaveLength(2);
  });

  it("bands are ordered and readiness rises with the plan", () => {
    for (const p of result.plans) {
      for (const s of p.series) {
        expect(s.p10).toBeLessThanOrEqual(s.p50);
        expect(s.p50).toBeLessThanOrEqual(s.p90);
      }
      expect(p.final.p50).toBeGreaterThan(result.readinessNow + 0.2);
    }
    expect(result.baseline.at(-1)!.p50).toBeLessThan(a.final.p50);
  });

  it("PyTorch first is slowed by its missing prerequisite (the planner's 0.6 rule), Docker first is not", () => {
    expect(b.milestones[0]).toMatchObject({ skillId: "pytorch", slowStart: true });
    expect(a.milestones[0]).toMatchObject({ skillId: "docker", slowStart: false });
    expect(b.notes.join(" ")).toMatch(/PyTorch starts before Deep learning/);
    expect(result.comparison!.firstProofGapWeeks).toBeGreaterThan(0);
    expect(new Date(a.firstProofDate!).getTime()).toBeLessThan(new Date(b.firstProofDate!).getTime());
  });

  it("is deterministic: the same inputs give the same futures", () => {
    const again = simulate(ctx(), [plan(), plan({ id: "b", label: "PyTorch first", firstSkillId: "pytorch" })]);
    expect(again.plans[0].series).toEqual(a.series);
    expect(again.comparison).toEqual(result.comparison);
  });

  it("finds the hours you actually need, and fewer hours finish later", () => {
    expect(a.hoursNeeded).not.toBeNull();
    expect(a.hoursNeeded!).toBeGreaterThanOrEqual(1);
    const slow = simulate(ctx(), [plan({ hoursPerWeek: 3 })]).plans[0];
    expect(slow.allDoneShare).toBeLessThanOrEqual(a.allDoneShare);
    expect(slow.final.p50).toBeLessThanOrEqual(a.final.p50);
  });

  it("a part-time job that eats every study hour leaves only the degree and demand moving", () => {
    const job = simulate(ctx(), [plan({ jobHoursLost: 8 })]);
    expect(job.plans[0].milestones.every((m) => m.date === null)).toBe(true);
    expect(job.plans[0].final.p50).toBeCloseTo(job.baseline.at(-1)!.p50, 2);
  });

  it("a summer placement proves communication and teamwork", () => {
    const withP = simulate(ctx(), [plan({ placement: true, hoursPerWeek: 2 })]).plans[0];
    const without = simulate(ctx(), [plan({ hoursPerWeek: 2 })]).plans[0];
    expect(withP.final.p50).toBeGreaterThan(without.final.p50);
    expect(withP.notes.join(" ")).toMatch(/placement runs/i);
  });

  it("the central fallback is a single future", () => {
    const c = simulate(ctx(), [plan()], { central: true, hours: false });
    expect(c.runs).toBe(1);
    expect(c.plans[0].series.every((s) => s.p10 === s.p50 && s.p50 === s.p90)).toBe(true);
    expect(c.plans[0].hoursNeeded).toBeNull();
  });

  it("an empty queue (everything proven) needs no hours", () => {
    const r = simulate(ctx({ queue: [] }), [plan({ firstSkillId: null })]);
    expect(r.plans[0].allDoneShare).toBe(1);
    expect(r.plans[0].hoursNeeded).toBe(0);
  });
});

describe("what-if engine: verdict", () => {
  const p = (id: "a" | "b", label: string, p50: number, allDoneDate: string | null = null) => ({ id, label, allDoneDate, final: { p10: p50, p50, p90: p50 } }) as never;
  it("names the winner with the paired share when the end differs", () => {
    expect(verdictFor(p("a", "Docker first", 0.84), p("b", "PyTorch first", 0.7), { aFinalWins: 0.9, bFinalWins: 0.1, aLeads: 0.9, bLeads: 0.1, firstProofGapWeeks: 2 }, "1 Sep 2027"))
      .toBe("Docker first ends ahead on 1 Sep 2027: 84% ready against 70%, and it comes out on top in 9 of 10 futures.");
  });
  it("leads with when the proofs land when both end level, then talks about the year", () => {
    const c = { aFinalWins: 0, bFinalWins: 0, aLeads: 0.7, bLeads: 0.1, firstProofGapWeeks: 2 };
    expect(verdictFor(p("a", "Docker first", 0.84), p("b", "PyTorch first", 0.84), c, "1 Sep 2027"))
      .toBe("Docker first lands your first proof 2 weeks sooner. Both reach 84% by 1 Sep 2027, and Docker first is ahead for more of the year in 7 of 10 futures.");
    expect(verdictFor(p("a", "8 hours", 0.84, "2027-06-13"), p("b", "12 hours", 0.84, "2027-03-28"), { ...c, aLeads: 0, bLeads: 1, firstProofGapWeeks: -1 }, "1 Sep 2027"))
      .toBe("12 hours lands your first proof 1 week sooner, and it finishes every roadmap proof 11 weeks sooner. Both reach 84% by 1 Sep 2027, and 12 hours is ahead for more of the year in 10 of 10 futures.");
    expect(verdictFor(p("a", "A", 0.84), p("b", "B", 0.84), { ...c, aLeads: 0, bLeads: 0, firstProofGapWeeks: 0 }, "1 Sep 2027"))
      .toBe("Both plans reach 84% by 1 Sep 2027 and stay level all the way.");
  });
});

describe("what-if engine: the proposed roadmap", () => {
  it("moves the first skill to week 1, keeps slot dates and exam flags, rescales hours and bumps the version", () => {
    const next = buildProposedRoadmap(roadmap, plan({ firstSkillId: "pytorch", hoursPerWeek: 10 }), now);
    expect(next.version).toBe(roadmap.version + 1);
    expect(next.weeks[0]).toMatchObject({ week: 1, focusSkillId: "pytorch", startDate: roadmap.weeks[0].startDate });
    expect(next.weeks[1].focusSkillId).toBe("docker");
    next.weeks.forEach((w, i) => {
      expect(w.isExamWeek).toBe(roadmap.weeks[i].isExamWeek);
      expect(w.tasks.reduce((s, t) => s + t.hours, 0)).toBe(w.isExamWeek ? 5 : 10);
      w.tasks.forEach((t, k) => expect(t.id).toBe(`t_${w.week}_${k + 1}`));
    });
    const diff = diffRoadmaps(roadmap, next);
    expect(diff.firstFocus).toEqual({ before: "docker", after: "pytorch" });
    expect(diff.hoursBefore).toBe(8);
    expect(diff.hoursAfter).toBe(10);
    expect(diff.weekChanges.map((c) => c.week)).toEqual([1, 2]);
  });
  it("moves every week of the chosen skill as a block, keeping the rest in order", () => {
    const twice: Roadmap = { ...roadmap, weeks: roadmap.weeks.map((w) => (w.week === 7 ? { ...w, focusSkillId: "pytorch" } : w)) };
    const next = buildProposedRoadmap(twice, plan({ firstSkillId: "pytorch" }), now);
    expect(next.weeks.slice(0, 4).map((w) => w.focusSkillId)).toEqual(["pytorch", "pytorch", "docker", "sql"]);
    expect(next.weeks.map((w) => w.startDate)).toEqual(twice.weeks.map((w) => w.startDate));
    expect(blockFirst(["a", "b", "a", "c"], "a", (x) => x)).toEqual(["a", "a", "b", "c"]);
  });
  it("never moves a week that has already ended", () => {
    const later = new Date("2026-11-20T09:00:00.000Z"); // week 1 (from 9 Nov) is over; week 2 is under way
    expect(movableWeeks(roadmap, later)[0].week).toBe(2);
    const next = buildProposedRoadmap(roadmap, plan({ firstSkillId: "sql" }), later);
    expect(next.weeks.slice(0, 3).map((w) => w.focusSkillId)).toEqual(["docker", "sql", "pytorch"]);
    expect(weeklyHours(roadmap)).toBe(8);
  });
  it("a job takes its hours out of every week", () => {
    const next = buildProposedRoadmap(roadmap, plan({ jobHoursLost: 3 }), now);
    expect(next.weeks.find((w) => !w.isExamWeek)!.tasks.reduce((s, t) => s + t.hours, 0)).toBe(5);
  });
  it("rescaleTasks keeps whole hours and the exact total", () => {
    const out = rescaleTasks([{ hours: 2 }, { hours: 3 }, { hours: 3 }], 5);
    expect(out.reduce((s, t) => s + t.hours, 0)).toBe(5);
    expect(out.every((t) => Number.isInteger(t.hours) && t.hours > 0)).toBe(true);
    expect(rescaleTasks([{ hours: 4 }, { hours: 4 }], 1)).toEqual([{ hours: 1 }]);
  });
});
