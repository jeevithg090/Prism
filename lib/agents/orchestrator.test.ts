import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { z } from "zod";
import path from "node:path";
import type { AgentEvent, BridgeMap, Profile, Programme, RoleDemand, Roadmap, TrendSeries } from "@/lib/types";

const h = vi.hoisted(() => ({
  events: [] as Omit<AgentEvent, "ts">[],
  profiles: new Map<string, unknown>(),
  upserts: [] as [string, string][],
  loadGraph: vi.fn(),
}));
vi.mock("@/lib/agents/events", () => ({
  emit: (e: Omit<AgentEvent, "ts">) => { h.events.push(e); },
  newRunId: () => "run_new",
}));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => (c === "profiles" ? h.profiles.get(id) ?? null : null),
    list: async () => [],
    upsert: async (c: string, id: string, doc: unknown) => { h.upserts.push([c, id]); return doc; },
    remove: async () => {},
  }),
}));
vi.mock("@/lib/graph/build", () => ({ loadGraph: h.loadGraph }));

import { REPLAY_DELAYS_MS, ProfileNotFoundError, replayDemo, runLive, runOnboarding, type AgentLoader } from "@/lib/agents/orchestrator";

const aisha = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/profile.aisha.json"), "utf8")) as Profile;
const map = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/bridgemap.aisha.ml-engineer.json"), "utf8")) as BridgeMap;
const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/agent-events.sample.json"), "utf8")) as AgentEvent[];

const programme: Programme = { id: "uom-bsc-cs", university: "University of Manchester", name: "BSc Computer Science", url: "https://www.manchester.ac.uk", modules: [], extractedAt: "2026-11-07", source: "cache" };
const demand: RoleDemand = { roleId: "ml-engineer", roleName: "ML engineer", location: "UK", adsAnalysed: 214, skills: [{ skillId: "docker", share: 0.41 }], topCompanies: [], sampleAds: [], snapshotAt: "2026-11-07", source: "cache" };
const trends: TrendSeries[] = [];
const roadmap = { userId: "aisha", roleId: "ml-engineer", version: 1, readinessNow: 0.38, readinessProjected: 0.84, weeks: [], skipped: [], generatedAt: "2026-11-07" } as Roadmap;

const mod = (name: string, f: (...a: unknown[]) => Promise<unknown>): AgentLoader => async () => ({ [name]: f });
const allLoaders = (over: Partial<Record<string, AgentLoader>> = {}) => ({
  syllabus: mod("extractProgramme", async () => programme),
  market: mod("getRoleDemand", async () => demand),
  evidence: mod("syncEvidence", async () => []),
  trends: mod("getTrends", async () => trends),
  roadmap: mod("generateRoadmap", async () => roadmap),
  ...over,
});
const noFixtures = () => null;

beforeEach(() => {
  h.events = [];
  h.upserts = [];
  h.profiles = new Map([["aisha", aisha]]);
  h.loadGraph.mockReset().mockResolvedValue(map);
  delete process.env.DEMO_MODE;
  delete process.env.DEMO_REPLAY;
});

describe("runLive", () => {
  it("emits orchestrator started first and done last with readiness, and stores map + roadmap", async () => {
    await runLive("run_1", aisha, { loaders: allLoaders(), fixtures: noFixtures });
    expect(h.events[0]).toMatchObject({ runId: "run_1", agent: "orchestrator", status: "started" });
    const last = h.events.at(-1)!;
    expect(last).toMatchObject({ agent: "orchestrator", status: "done", message: "Bridge ready · 38% → 84%" });
    expect(last.data).toMatchObject({ readinessNow: 0.38, readinessProjected: 0.84 });
    expect(h.events.find((e) => e.agent === "skillmap" && e.status === "done")?.message).toMatch(/^32 skills mapped: 4 proven, 15 covered by your degree, 13 gaps$/);
    expect(h.upserts).toEqual([["maps", "aisha:ml-engineer"], ["roadmaps", "aisha"]]);
  });

  it("reports a failing agent, uses its fixture and still finishes", async () => {
    const fixtures = (f: string) => (f === "market.ml-engineer.json" ? demand : null);
    const generate = vi.fn(async () => roadmap);
    await runLive("run_2", aisha, { fixtures, loaders: allLoaders({ market: mod("getRoleDemand", async () => { throw new Error("adzuna down"); }), roadmap: mod("generateRoadmap", generate) }) });
    expect(h.events).toContainEqual(expect.objectContaining({ agent: "market", status: "error", message: "Couldn't finish, so used cached data · 214 ML engineer ads analysed" }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ roleDemand: demand, runId: "run_2" }));
    expect(h.events.at(-1)).toMatchObject({ agent: "orchestrator", status: "done" });
  });

  it("calls the 4 data agents in parallel", async () => {
    const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
    const d = { syllabus: deferred<Programme>(), market: deferred<RoleDemand>(), evidence: deferred<never[]>(), trends: deferred<TrendSeries[]>() };
    const calls = { syllabus: vi.fn(() => d.syllabus.promise), market: vi.fn(() => d.market.promise), evidence: vi.fn(() => d.evidence.promise), trends: vi.fn(() => d.trends.promise) };
    const run = runLive("run_3", aisha, {
      fixtures: noFixtures,
      loaders: allLoaders({ syllabus: mod("extractProgramme", calls.syllabus), market: mod("getRoleDemand", calls.market), evidence: mod("syncEvidence", calls.evidence), trends: mod("getTrends", calls.trends) }),
    });
    await vi.waitFor(() => Object.values(calls).forEach((c) => expect(c).toHaveBeenCalledTimes(1)));
    expect(h.events.some((e) => e.agent === "skillmap")).toBe(false);
    d.syllabus.resolve(programme); d.market.resolve(demand); d.evidence.resolve([]); d.trends.resolve(trends);
    await run;
    expect(h.events.at(-1)).toMatchObject({ agent: "orchestrator", status: "done" });
  });

  it("times out a slow agent and falls back to cached data when a module isn't there yet", async () => {
    const fixtures = (f: string) => (f === "trends.json" ? [{ label: "rising" }, { label: "stable" }] : null);
    await runLive("run_4", aisha, {
      fixtures,
      timeouts: { evidence: 20 },
      loaders: allLoaders({ evidence: mod("syncEvidence", () => new Promise(() => {})), trends: async () => null }),
    });
    expect(h.events).toContainEqual(expect.objectContaining({ agent: "evidence", status: "error", message: expect.stringMatching(/^No answer within 0s; no cached data, skipped$/) }));
    expect(h.events).toContainEqual(expect.objectContaining({ agent: "trends", status: "done", message: "Used cached data · 2 skills forecast, 1 rising" }));
    expect(h.events.at(-1)).toMatchObject({ agent: "orchestrator", status: "done" });
  });

  it("ends with an orchestrator error when no Bridge Map can be built", async () => {
    h.loadGraph.mockResolvedValue(null);
    await runLive("run_5", aisha, { loaders: allLoaders(), fixtures: noFixtures });
    expect(h.events.at(-1)).toMatchObject({ agent: "orchestrator", status: "error" });
  });
});

describe("demo replay", () => {
  it("the sample fixture is a valid AgentEvent[] that starts and ends with the orchestrator", () => {
    const AgentEventZ = z.object({
      runId: z.string().min(1),
      agent: z.enum(["orchestrator", "syllabus", "skillmap", "market", "trends", "evidence", "roadmap", "matchmaker", "architect", "techlead", "trajectories", "guides", "voice", "n8n"]),
      status: z.enum(["started", "progress", "done", "error"]),
      message: z.string().min(1),
      ts: z.iso.datetime(),
      data: z.record(z.string(), z.unknown()).optional(),
    });
    expect(z.array(AgentEventZ).parse(sample)).toHaveLength(22);
    expect(sample[0]).toMatchObject({ agent: "orchestrator", status: "started" });
    expect(sample.at(-1)).toMatchObject({ agent: "orchestrator", status: "done", message: "Bridge ready · 38% → 84%" });
    expect(sample.every((e) => /\d/.test(e.message) || e.status === "started")).toBe(true);
  });

  it("re-emits every sample event in order under the new runId, with 150–600ms gaps", async () => {
    const sleeps: number[] = [];
    await replayDemo("run_new", aisha, { sleep: async (ms) => { sleeps.push(ms); } });
    expect(sample.length).toBeGreaterThanOrEqual(20);
    expect(h.events.map((e) => [e.agent, e.status, e.message])).toEqual(sample.map((e) => [e.agent, e.status, e.message]));
    expect(h.events.every((e) => e.runId === "run_new")).toBe(true);
    expect(sleeps).toHaveLength(sample.length);
    expect(sleeps.every((ms) => ms >= 150 && ms <= 600)).toBe(true);
    expect(REPLAY_DELAYS_MS.length).toBe(sample.length);
    expect(h.events.at(-1)).toMatchObject({ agent: "orchestrator", status: "done", message: "Bridge ready · 38% → 84%", data: { readinessNow: 0.38, readinessProjected: 0.84 } });
    const all = h.events.map((e) => e.message).join(" | ");
    for (const s of ["Crawled 32 pages", "41 course units", "214 ML engineer ads analysed", "Docker in 41%", "87 skills mapped", "+38%/yr", "6 repos, 23 commits", "12 weeks planned", "Skipped Statistics: your Semester 2 module covers it", "3 students fill your gaps"]) expect(all).toContain(s);
  });

  it("uses the student's own first name, and seeds Aisha's demo map for a new student", async () => {
    const sam = { ...aisha, id: "sam", name: "Sam Okafor" };
    await replayDemo("run_new", sam, { sleep: async () => {} });
    expect(h.events[0].message).toMatch(/^Building Sam's bridge/);
    expect(h.events.some((e) => /Aisha/.test(e.message))).toBe(false);
    expect(h.upserts).toContainEqual(["maps", "sam:ml-engineer"]);
  });

  it("runOnboarding picks demo mode from DEMO_MODE, returns the runId at once and runs in the background", async () => {
    process.env.DEMO_MODE = "true";
    let work: (() => Promise<void>) | undefined;
    const res = await runOnboarding("aisha", { schedule: (w) => { work = w; } });
    expect(res).toEqual({ runId: "run_new", mode: "demo" });
    expect(h.events).toHaveLength(0);
    expect(work).toBeTypeOf("function");
  });

  it("runOnboarding throws ProfileNotFoundError for an unknown user", async () => {
    await expect(runOnboarding("nobody", { schedule: () => {} })).rejects.toBeInstanceOf(ProfileNotFoundError);
  });
});
