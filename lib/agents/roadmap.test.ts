import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMap, BridgeNode, Pod, Profile, Roadmap } from "@/lib/types";
import { memStore } from "@/lib/graph/testStore";

const h = vi.hoisted(() => ({
  store: null as unknown as ReturnType<typeof import("@/lib/graph/testStore").memStore>,
  llm: vi.fn(),
  events: [] as { agent: string; status: string; message: string }[],
}));
vi.mock("@/lib/store", () => ({ getStore: () => h.store }));
vi.mock("@/lib/llm", () => ({ llmJSON: h.llm, LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: (e: { agent: string; status: string; message: string }) => h.events.push(e), newRunId: () => "run_test" }));

import { applyPolish, buildRoadmap, generateRoadmap, hoursSplit, isFreeUrl, receiptFor, setTaskDone } from "./roadmap";
import { planRoadmap } from "@/lib/graph/plan";

const NOW = new Date("2026-11-07T12:00:00Z");
const AISHA_MAP = JSON.parse(fs.readFileSync("data/fixtures/bridgemap.aisha.ml-engineer.json", "utf8")) as BridgeMap;
const POD = JSON.parse(fs.readFileSync("data/fixtures/pod.aisha.json", "utf8")) as Pod;
const profile: Profile = JSON.parse(fs.readFileSync("data/fixtures/profile.aisha.json", "utf8"));

const node = (skillId: string, status: BridgeNode["status"], demand: number, extra: Partial<BridgeNode> = {}): BridgeNode => ({
  skillId, name: skillId[0].toUpperCase() + skillId.slice(1), category: "cloud-devops", status, demand, level: 0, evidenceIds: [], moduleCodes: [], ...extra,
});

beforeEach(() => { h.store = memStore(); h.llm.mockReset(); h.llm.mockRejectedValue(new Error("no_key")); h.events.length = 0; });

describe("deterministic planner", () => {
  it("skips a skill the degree covers before the target date, with the message, and never makes it a focus", () => {
    const { roadmap } = buildRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false });
    const stats = roadmap.skipped.find((s) => s.skillId === "statistics");
    expect(stats).toEqual({ skillId: "statistics", moduleCode: "COMP1xxx4", message: "Don't pay for a statistics course: your Year 1 · Semester 2 module (COMP1xxx4) covers it." });
    expect(roadmap.skipped.map((s) => s.skillId)).toContain("linear-algebra");
    expect(roadmap.weeks.map((w) => w.focusSkillId)).not.toContain("statistics");
  });

  it("starts week 1 with Docker and names the pod repo in the proof", () => {
    const { roadmap } = buildRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false });
    expect(roadmap.weeks).toHaveLength(12);
    expect(roadmap.weeks[0]).toMatchObject({ week: 1, startDate: "2026-11-09", focusSkillId: "docker", proof: "Merge a PR that adds a Dockerfile to your pod repo (VisionAid)" });
    expect(roadmap.weeks[0].tasks.some((t) => t.resourceUrl === "https://github.com/keystone-demo/pod-vision-demo/issues/1")).toBe(true);
    for (const w of roadmap.weeks) expect(w.proof).toContain("your pod repo (VisionAid)");
  });

  it("gives exam weeks (January) half the hours and every week's tasks add up to its hours", () => {
    const { roadmap } = buildRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false });
    const exam = roadmap.weeks.filter((w) => w.isExamWeek);
    expect(exam.map((w) => w.startDate)).toEqual(["2027-01-11", "2027-01-18"]);
    const hours = (w: Roadmap["weeks"][number]) => w.tasks.reduce((s, t) => s + t.hours, 0);
    for (const w of roadmap.weeks) {
      expect(hours(w)).toBe(w.isExamWeek ? 4 : 8);
      expect(w.tasks.length).toBeGreaterThanOrEqual(2);
      expect(w.tasks.length).toBeLessThanOrEqual(4);
    }
    expect(Math.max(...exam.map(hours))).toBeLessThan(Math.min(...roadmap.weeks.filter((w) => !w.isExamWeek).map(hours)));
  });

  it("puts a 2-hour primer in the week before the skipped module starts (26 Jan → week of 18 Jan)", () => {
    const { roadmap } = buildRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false });
    const primerWeeks = roadmap.weeks.filter((w) => w.tasks.some((t) => t.type === "primer"));
    expect(primerWeeks.map((w) => w.startDate)).toEqual(["2027-01-18"]);
    expect(primerWeeks[0].tasks.find((t) => t.type === "primer")?.hours).toBe(2);
  });

  it("splits hours by theory vs practice: 70% practice of 10 hours leaves 3 to learn", () => {
    expect(hoursSplit(10, 70)).toEqual({ learn: 3, build: 7 });
    expect(hoursSplit(8, 70)).toEqual({ learn: 2, build: 6 });
  });

  it("ranks by demand: Docker (41%) above Kubernetes (27%), and a skill the degree covers later drops", () => {
    const later = node("machine-learning", "degree-upcoming", 0.55, { category: "ml-ai", moduleCodes: ["COMP2xxx2"], upcomingLabel: "Year 2 · Semester 2" });
    const plan = planRoadmap({ nodes: [node("kubernetes", "gap", 0.27), node("docker", "gap", 0.41), later], edges: [], startedAt: "2026-09-21", targetDate: "2027-09-01", now: NOW });
    expect(plan.ranked.map((r) => r.node.skillId)).toEqual(["docker", "kubernetes", "machine-learning"]);
    expect(plan.ranked[2].coveredLater).toBe(true);
  });

  it("writes a receipt from the numbers: 41% of ads, not covered, none of your modules", () => {
    const plan = planRoadmap({ nodes: [node("docker", "gap", 0.41, { name: "Docker" })], edges: [], startedAt: "2026-09-21", targetDate: "2027-09-01", now: NOW });
    const r = receiptFor(plan.ranked[0], "ml-engineer");
    expect(r.demandPct).toBe(41);
    expect(r.coveredByDegree).toBe("no");
    expect(r.reason).toContain("41% of");
    expect(r.reason).toContain("none of your modules");
  });
});

describe("LLM wording pass", () => {
  it("keeps free URLs, drops paid ones on a free budget, and fixes hours on the last task", () => {
    const { roadmap } = buildRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false });
    const out = applyPolish(roadmap.weeks, { weeks: [{ week: 1, tasks: [
      { type: "learn", title: "Docker docs", resourceUrl: "https://docs.docker.com/get-started/", hours: 2 },
      { type: "learn", title: "A paid course", resourceUrl: "https://paid.example.com/course", hours: 2 },
      { type: "build", title: "Dockerise the API", hours: 9 },
    ] }] }, "free");
    const w1 = out[0];
    expect(w1.tasks[0]).toMatchObject({ resourceUrl: "https://docs.docker.com/get-started/", free: true });
    expect(w1.tasks[1].resourceUrl).toBeUndefined();
    expect(w1.tasks.reduce((s, t) => s + t.hours, 0)).toBe(8);
    expect(w1.tasks.map((t) => t.id)).toEqual(["t_1_1", "t_1_2", "t_1_3"]);
    expect(isFreeUrl("https://www.kaggle.com/learn/intro-to-sql")).toBe(true);
    expect(isFreeUrl("https://paid.example.com")).toBe(false);
  });

  it("falls back to 12 weeks of template tasks when the LLM throws, narrating with numbers", async () => {
    const rm = await generateRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, runId: "run_x" });
    expect(rm.weeks).toHaveLength(12);
    expect(h.llm).toHaveBeenCalledOnce();
    const messages = h.events.map((e) => e.message);
    expect(messages.some((m) => /ranked \d+ gaps/.test(m))).toBe(true);
    expect(messages).toContain("skipped 2 skills your degree covers");
    expect(messages.some((m) => m.startsWith("planned 12 weeks"))).toBe(true);
    expect(h.events.at(-1)).toMatchObject({ agent: "roadmap", status: "done" });
  });

  it("increments the version on every re-plan and keeps your ticks", async () => {
    const v1 = await generateRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false });
    v1.weeks[0].tasks[0].done = true;
    const v2 = await generateRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false, previous: v1 });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.weeks[0].tasks[0].done).toBe(true);
  });
});

describe("ticking tasks", () => {
  it("records a roadmap-milestone momentum event when the last task of a week is ticked", async () => {
    const rm = (await generateRoadmap({ profile, map: AISHA_MAP, pod: POD, now: NOW, polish: false }));
    const [first, ...rest] = rm.weeks[0].tasks;
    for (const t of rest) await setTaskDone("aisha", t.id, true);
    expect(await h.store.list("momentum_events", { userId: "aisha" })).toHaveLength(0);
    const res = await setTaskDone("aisha", first.id, true);
    expect(res).toMatchObject({ weekComplete: true, task: { id: first.id, done: true } });
    const events = await h.store.list<{ kind: string }>("momentum_events", { userId: "aisha" });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("roadmap-milestone");
  });
});
