// Shortest Path to Opportunity: solver tests on Aisha's real demo data (Bridge Map, roadmap, programme, market).
import { describe, expect, it } from "vitest";
import mapJson from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import roadmapJson from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import programmeJson from "@/data/fixtures/programme.uom-bsc-cs.json";
import profileJson from "@/data/fixtures/profile.aisha.json";
import oppJson from "@/data/fixtures/labs/pathway.opportunities.json";
import effortJson from "@/data/fixtures/labs/pathway.effort.json";
import mlMarket from "@/data/fixtures/market.ml-engineer.json";
import { CURATED_PREREQS } from "@/lib/graph/build";
import { skillMeta } from "@/lib/graph/data";
import type { BridgeMap, Profile, Programme, Roadmap, RoleDemand } from "@/lib/types";
import { createSolver, headlineFor, isClosed, keystoneSkill, rankPaths, MAX_COMBOS } from "./solver";
import { EffortFileZ, OpportunityFileZ, type Opportunity } from "./types";

const NOW = new Date("2026-11-07T09:00:00Z");
const opps = OpportunityFileZ.parse(oppJson).opportunities;
const effort = EffortFileZ.parse(effortJson);
const byId = (id: string) => opps.find((o) => o.id === id)!;

function solver(over: { map?: BridgeMap; roadmap?: Roadmap | null; hoursPerWeek?: number; now?: Date } = {}) {
  const profile = profileJson as unknown as Profile;
  return createSolver({
    map: over.map ?? (mapJson as unknown as BridgeMap),
    profile: { ...profile, dna: { ...profile.dna, hoursPerWeek: over.hoursPerWeek ?? profile.dna.hoursPerWeek } },
    programme: programmeJson as unknown as Programme,
    roadmap: over.roadmap === undefined ? (roadmapJson as unknown as Roadmap) : over.roadmap,
    effort, meta: skillMeta, curated: CURATED_PREREQS,
    market: (roleId) => (roleId === "ml-engineer" ? (mlMarket as unknown as RoleDemand) : null),
    now: over.now ?? NOW,
  });
}

describe("fixtures", () => {
  it("validate and are labelled demo", () => {
    expect(OpportunityFileZ.parse(oppJson).label).toBe("demo");
    expect(opps.length).toBeGreaterThanOrEqual(6);
    expect(opps.every((o) => o.source === "demo")).toBe(true);
  });
});

describe("createSolver: the shortest path", () => {
  it("picks TensorFlow over PyTorch for Quayline: PyTorch needs deep learning and machine learning first", () => {
    const p = solver().solve(byId("opp-quayline-ml-intern"));
    const learn = p.steps.filter((s) => s.mode === "learn").map((s) => s.skillId);
    expect(learn).toEqual(["docker", "tensorflow"]); // keeps the roadmap's order (Docker is week 1) where it can
    expect(p.state).toBe("within-reach");
    expect(p.skillsToLearn).toBe(2);
    // Docker uses the roadmap's own 8 hours (week 1); TensorFlow is not in the roadmap, so the labelled estimate.
    const docker = p.steps.find((s) => s.skillId === "docker")!;
    expect(docker).toMatchObject({ hoursSource: "roadmap", roadmapWeek: 1, hours: 8, demandPct: 41 });
    expect(p.steps.find((s) => s.skillId === "tensorflow")).toMatchObject({ hoursSource: "estimate", hours: 14 });
    expect(p.studyHours).toBe(22);
    expect(p.studyWeeks).toBe(3);
    const alt = p.alternatives.find((a) => a.instead === "pytorch")!;
    expect(alt.extraSkills).toEqual(expect.arrayContaining(["Machine learning", "Deep learning"]));
    expect(alt.extraHours).toBeGreaterThan(0);
    expect(p.combosSearched).toBe(2);
    expect(p.headline).toMatch(/^You're 2 skills and 3 weeks from applying to ML Engineering Summer Intern at Quayline Health\./);
  });

  it("waits for the Semester 2 maths module instead of paying for statistics, then schedules ML after it", () => {
    const p = solver().solve(byId("opp-pennine-placement"));
    const degree = p.steps.filter((s) => s.mode === "degree");
    expect(degree.map((s) => s.skillId).sort()).toEqual(["linear-algebra", "statistics"]);
    expect(degree[0]).toMatchObject({ moduleCode: "COMP1xxx4", readyBy: "2027-06-12" });
    const ml = p.steps.find((s) => s.skillId === "machine-learning")!;
    expect(ml.mode).toBe("learn");
    expect(ml.startsOn! >= "2027-06-14").toBe(true);
    expect(p.state).toBe("within-reach");
    expect(p.steps.filter((s) => s.mode === "learn").map((s) => s.skillId)).toEqual(["machine-learning", "deep-learning", "pytorch"]);
    expect(p.headline).toContain("Your degree covers");
  });

  it("is honest when the deadline comes first (next round)", () => {
    const p = solver().solve(byId("opp-heronsgate-research"));
    expect(p.state).toBe("next-round");
    expect(p.slackDays).toBeLessThan(0);
    expect(headlineFor(p)).toMatch(/Aim for next year's round/);
  });

  it("says apply now when every group is already met (degree-done counts)", () => {
    const p = solver().solve(byId("opp-fernhill-sprint"));
    expect(p.state).toBe("apply-now");
    expect(p.skillsToLearn).toBe(0);
    expect(p.readyBy).toBe("2026-11-07");
    expect(p.fitNow).toBeGreaterThanOrEqual(80);
  });

  it("shares prerequisites across groups and keeps the schedule in prerequisite order", () => {
    const p = solver().solve(byId("opp-brightmoor-analyst"));
    const learn = p.steps.filter((s) => s.mode === "learn").map((s) => s.skillId);
    expect(learn.indexOf("databases")).toBeLessThan(learn.indexOf("sql"));
    expect(learn.indexOf("numpy")).toBeLessThan(learn.indexOf("pandas"));
    expect(learn.indexOf("pandas")).toBeLessThan(learn.indexOf("data-visualisation"));
    expect(new Set(learn).size).toBe(learn.length);
    expect(p.fitReady).toBeGreaterThan(p.fitNow);
  });

  it("re-plans when the Bridge Map changes: proving Docker removes it from the path", () => {
    const base = mapJson as unknown as BridgeMap;
    const map = { ...base, nodes: base.nodes.map((n) => (n.skillId === "docker" ? { ...n, status: "proven" as const, level: 2 as const } : n)) };
    const p = solver({ map }).solve(byId("opp-quayline-ml-intern"));
    expect(p.steps.find((s) => s.skillId === "docker")?.mode).toBe("have");
    expect(p.skillsToLearn).toBe(1);
  });

  it("uses the roadmap's remaining hours: ticked tasks shrink the path", () => {
    const rm = roadmapJson as unknown as Roadmap;
    const ticked = { ...rm, weeks: rm.weeks.map((w) => (w.focusSkillId === "docker" ? { ...w, tasks: w.tasks.map((t, k) => (k === 0 ? { ...t, done: true } : t)) } : w)) };
    const before = solver().solve(byId("opp-quayline-ml-intern")).studyHours;
    const after = solver({ roadmap: ticked }).solve(byId("opp-quayline-ml-intern")).studyHours;
    expect(after).toBeLessThan(before);
  });

  it("more hours a week means fewer weeks", () => {
    const slow = solver({ hoursPerWeek: 4 }).solve(byId("opp-brightmoor-analyst"));
    const fast = solver({ hoursPerWeek: 16 }).solve(byId("opp-brightmoor-analyst"));
    expect(fast.studyWeeks).toBeLessThan(slow.studyWeeks);
    expect(fast.studyHours).toBe(slow.studyHours);
  });

  it("survives a prerequisite cycle and caps the combination search", () => {
    const base = mapJson as unknown as BridgeMap;
    const map = { ...base, edges: [...base.edges, { from: "pytorch", to: "deep-learning", kind: "prereq" as const }] };
    const wide: Opportunity = {
      ...byId("opp-quayline-ml-intern"), id: "opp-wide",
      requires: Array.from({ length: 5 }, () => ["kubernetes", "aws", "mlops", "vector-databases"]),
    };
    const s = solver({ map });
    expect(() => s.solve(byId("opp-pennine-placement"))).not.toThrow();
    expect(s.solve(wide).combosSearched).toBeLessThanOrEqual(MAX_COMBOS);
  });

  it("is deterministic", () => {
    const a = opps.map((o) => solver().solve(o));
    const b = opps.map((o) => solver().solve(o));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("ranking, keystone skill, closed listings", () => {
  it("ranks apply-now first and next-round last, and finds a skill on several paths", () => {
    const s = solver();
    const ranked = rankPaths(opps.map((o) => s.solve(o)));
    expect(ranked[0].state).toBe("apply-now");
    expect(ranked[ranked.length - 1].state).toBe("next-round");
    const ks = keystoneSkill(ranked);
    expect(ks?.count).toBeGreaterThanOrEqual(2);
    expect(ks?.of).toBe(ranked.length);
  });
  it("treats a listing as closed only after its deadline day", () => {
    expect(isClosed(byId("opp-heronsgate-research"), new Date("2026-11-18T12:00:00Z"))).toBe(false);
    expect(isClosed(byId("opp-heronsgate-research"), new Date("2026-11-19T00:00:01Z"))).toBe(true);
  });
});
