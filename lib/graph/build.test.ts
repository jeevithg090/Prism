import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMap, EvidenceItem, Profile, Programme, RoleDemand } from "@/lib/types";
import { memStore } from "./testStore";

const h = vi.hoisted(() => ({ store: null as unknown as ReturnType<typeof import("./testStore").memStore> }));
vi.mock("@/lib/store", () => ({ getStore: () => h.store }));

import { buildBridgeMap, loadGraph, mergeEvidence, NODE_CAP } from "./build";

const AISHA_MAP = JSON.parse(fs.readFileSync("data/fixtures/bridgemap.aisha.ml-engineer.json", "utf8")) as BridgeMap;
const profile: Profile = {
  id: "zoe", name: "Zoe Test", programmeId: "p", year: 1, startedAt: "2026-09-21", badges: [], interests: [], availability: [],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 70, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
};
const programme = (modules: Programme["modules"]): Programme => ({ id: "p", university: "UoM", name: "CS", url: "", modules, extractedAt: "", source: "manual" });
const mod = (code: string, year: 1 | 2, semester: "1" | "2", skills: [string, 0 | 1 | 2 | 3][]): Programme["modules"][number] => ({
  code, title: code, year, semester, compulsory: true, topics: [], learningOutcomes: [], skills: skills.map(([skillId, level]) => ({ skillId, level })),
});
const demand = (skills: [string, number][]): RoleDemand => ({
  roleId: "ml-engineer", roleName: "ML engineer", location: "uk", adsAnalysed: 214, skills: skills.map(([skillId, share]) => ({ skillId, share })),
  topCompanies: [], sampleAds: [], snapshotAt: "", source: "cache",
});
const ev = (skillId: string, level: 0 | 1 | 2 | 3, confidence: number, extra: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: `ev_${skillId}`, userId: "zoe", skillId, level, confidence, source: "github", url: "https://github.com/x", createdAt: "2026-11-01T00:00:00Z", ...extra,
});

beforeEach(() => { h.store = memStore(); delete process.env.DEMO_MODE; });

describe("buildBridgeMap", () => {
  it("proof beats the degree: level-2 evidence at 0.7 confidence is proven even if a module teaches it later", () => {
    const m = buildBridgeMap({ profile, programme: programme([mod("M1", 1, "2", [["python", 2]])]), roleDemand: demand([["python", 0.6]]), evidence: [ev("python", 2, 0.7)], trends: [], now: new Date("2026-11-07") });
    expect(m.nodes.find((n) => n.skillId === "python")?.status).toBe("proven");
  });
  it("weak evidence (confidence 0.5) with no module is still a gap", () => {
    const m = buildBridgeMap({ profile, programme: programme([]), roleDemand: demand([["docker", 0.41]]), evidence: [ev("docker", 2, 0.5)], trends: [], now: new Date("2026-11-07") });
    expect(m.nodes[0]).toMatchObject({ skillId: "docker", status: "gap", level: 2 });
  });
  it("uses UoM term dates: Year 1 Semester 1 is upcoming on 7 Nov 2026 and done on 1 Feb 2027", () => {
    const inputs = { profile, programme: programme([mod("COMP1", 1, "1", [["algorithms", 2]])]), roleDemand: demand([["algorithms", 0.2]]), evidence: [], trends: [] };
    const before = buildBridgeMap({ ...inputs, now: new Date("2026-11-07") }).nodes[0];
    expect(before).toMatchObject({ status: "degree-upcoming", upcomingLabel: "Year 1 · Semester 1" });
    expect(buildBridgeMap({ ...inputs, now: new Date("2027-02-01") }).nodes[0]).toMatchObject({ status: "degree-done", level: 2 });
  });
  it("keeps every role skill, caps nodes at 80 and only draws edges between nodes that exist", () => {
    const skills: [string, number][] = Array.from({ length: 30 }, (_, i) => [`role-${i}`, 0.5 - i * 0.01]);
    const modules = [mod("BIG", 1, "1", Array.from({ length: 70 }, (_, i) => [`mod-${i}`, 1] as [string, 1]))];
    const m = buildBridgeMap({ profile, programme: programme(modules), roleDemand: demand(skills), evidence: [], trends: [], now: new Date("2026-11-07") });
    expect(m.nodes.length).toBeLessThanOrEqual(NODE_CAP);
    const ids = new Set(m.nodes.map((n) => n.skillId));
    for (const e of m.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
    const withK8s = buildBridgeMap({ profile, programme: programme([]), roleDemand: demand([["docker", 0.41], ["kubernetes", 0.18], ["aws", 0.3]]), evidence: [], trends: [], now: new Date("2026-11-07") });
    expect(withK8s.edges).toContainEqual({ from: "docker", to: "kubernetes", kind: "prereq" });
  });
  it("computes readiness with the contract formula", () => {
    const m = buildBridgeMap({ profile, programme: programme([]), roleDemand: demand([["python", 0.5], ["docker", 0.5]]), evidence: [ev("python", 2, 0.8)], trends: [], now: new Date("2026-11-07") });
    expect(m.readinessNow).toBe(0.5);
    expect(m.readinessProjected).toBe(1);
  });
});

describe("mergeEvidence", () => {
  it("never demotes a node and adds links and levels", () => {
    const out = mergeEvidence(AISHA_MAP, [{ ...ev("javascript", 1, 0.4), id: "ev_js", userId: "aisha" }]);
    const js = out.nodes.find((n) => n.skillId === "javascript")!;
    expect(js.status).toBe("proven");
    expect(js.evidenceIds).toContain("ev_js");
    expect(out.readinessNow).toBe(AISHA_MAP.readinessNow);
  });
});

describe("loadGraph", () => {
  // DEMO_MODE pins Aisha's base map to the curated fixture (programme/market fixtures may also exist after merge).
  beforeEach(() => { process.env.DEMO_MODE = "true"; });
  const podEvidence: EvidenceItem = {
    id: "ev_pod_pod_demo01_0_aisha", userId: "aisha", skillId: "docker", level: 2, confidence: 0.9, source: "keystone-pod",
    url: "https://github.com/keystone-demo/pod-vision-demo/pull/8", quote: "Merged 'Containerise the captioning API with Docker'", createdAt: "2026-11-07T15:00:00Z",
  };

  it("prefers the store map over the fixture", async () => {
    const stored: BridgeMap = { ...AISHA_MAP, readinessNow: 0.5, generatedAt: "stored" };
    await h.store.upsert("maps", "aisha:ml-engineer", stored as BridgeMap & { id?: string }, "aisha");
    const m = await loadGraph("aisha", "ml-engineer");
    expect(m?.generatedAt).toBe("stored");
    expect(m?.readinessNow).toBe(0.5);
  });

  it("merges a recorded keystone-pod Docker proof: Docker turns proven and readiness goes up", async () => {
    await h.store.upsert("maps", "aisha:ml-engineer", AISHA_MAP as BridgeMap & { id?: string }, "aisha");
    await h.store.upsert("evidence", podEvidence.id, podEvidence, "aisha");
    await h.store.upsert("proofs", "pod_demo01:0", { id: "pod_demo01:0", evidenceIds: [podEvidence.id] }, "aisha");
    const m = await loadGraph("aisha", "ml-engineer");
    const docker = m!.nodes.find((n) => n.skillId === "docker")!;
    expect(docker.status).toBe("proven");
    expect(docker.evidenceIds).toContain(podEvidence.id);
    expect(m!.readinessNow).toBeGreaterThan(AISHA_MAP.readinessNow);
    // python's fixture evidence (evidence.aisha.json) is merged too
    expect(m!.nodes.find((n) => n.skillId === "html-css")!.evidenceIds).toContain("ev_aisha_html1");
  });

  it("leaves a pod proof that's still being recorded to the proof loop (so its before → after delta survives)", async () => {
    await h.store.upsert("evidence", podEvidence.id, podEvidence, "aisha");
    const m = await loadGraph("aisha", "ml-engineer");
    expect(m!.nodes.find((n) => n.skillId === "docker")!.status).toBe("gap");
    expect(m!.readinessNow).toBe(0.38);
  });

  it("merges a micro-challenge proof straight away", async () => {
    await h.store.upsert("evidence", "ev_ch_sql", { ...ev("sql", 2, 0.8), id: "ev_ch_sql", userId: "aisha", source: "micro-challenge" as const }, "aisha");
    const m = await loadGraph("aisha", "ml-engineer");
    expect(m!.nodes.find((n) => n.skillId === "sql")!.status).toBe("proven");
    expect(m!.readinessNow).toBeGreaterThan(0.38);
  });

  it("derives a seeded student's map from their seed skills", async () => {
    const m = await loadGraph("priya", "ml-engineer");
    expect(m).not.toBeNull();
    const status = (id: string) => m!.nodes.find((n) => n.skillId === id)?.status;
    expect(status("docker")).toBe("proven");
    expect(status("pytorch")).toBe("proven");
    expect(status("sql")).toBe("gap");
    expect(status("html-css")).toBe("gap");
    expect(m!.readinessNow).toBeGreaterThan(0);
  });

  it("returns null for a user with no map", async () => {
    expect(await loadGraph("nobody", "ml-engineer")).toBeNull();
  });
});
