import { beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import { describeLadder, LatestProofZ, PassportZ, ProofLadderZ } from "@/components/ladder/model";
import type { EvidenceItem, Profile } from "@/lib/types";

const h = vi.hoisted(() => ({ docs: new Map<string, { doc: unknown; userId?: string }>() }));

vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_ladder", subscribe: vi.fn() }));
vi.mock("@/lib/graph/build", () => ({
  loadGraph: async (u: string, r: string) => (u === "aisha" && r === "ml-engineer" ? structuredClone(mapFixture) : null),
}));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) =>
      [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId }); return doc; },
    remove: async (c: string, id: string) => { h.docs.delete(`${c}/${id}`); },
  }),
}));

import { recordMergedPR } from "./proof";
import { getLatestProof, getPassport, getProofLadder, PrivateError, setPassportVisibility, skillsMentioned } from "./ladder";

const dna = { targetRoles: ["ml-engineer"] } as Profile["dna"];
const profiles: Profile[] = [
  { id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, badges: ["new-to-uni", "international"], dna, isDemo: true } as Profile,
  { id: "priya", name: "Priya Shah", programmeId: "uom-bsc-cs", year: 3, badges: ["first-gen"], dna: { ...dna, targetRoles: ["software-engineer"] } } as Profile,
  { id: "mei", name: "Mei Lin", programmeId: "uom-bsc-cs", year: 2, badges: [], dna } as unknown as Profile,
];
const put = (c: string, id: string, doc: unknown, userId?: string) => h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId });
const ev = (e: Partial<EvidenceItem> & Pick<EvidenceItem, "id" | "skillId" | "source">): EvidenceItem =>
  ({ userId: "aisha", level: 1, confidence: 0.8, url: "https://example.com", createdAt: "2026-11-07T15:00:00.000Z", ...e });
const skill = async (userId: string, id: string) => (await getProofLadder(userId, id)).skills[0];
const strip = (s: { rungs: { status: string }[] }) => s.rungs.map((r) => (r.status === "done" ? "●" : "○")).join("");

beforeEach(() => {
  h.docs.clear();
  for (const p of profiles) put("profiles", p.id, p, p.id);
  put("pods", podFixture.id, podFixture, "aisha");
});

describe("getProofLadder", () => {
  it("starts Aisha from her Bridge Map: GitHub-proven and completed modules are rung 1, gaps are ○○○", async () => {
    const ladder = await getProofLadder("aisha");
    expect(ProofLadderZ.safeParse(ladder).success).toBe(true);
    const by = new Map(ladder.skills.map((s) => [s.skillId, s]));
    expect(by.get("python")).toMatchObject({ level: 1, status: "proven" });
    expect(by.get("python")!.rungs[0].evidence).toMatchObject({ source: "github", id: "ev_aisha_py1" });
    expect(by.get("data-structures")!.rungs[0].evidence).toMatchObject({ source: "degree", quote: "Completed COMP1xxx1 in your degree" });
    expect(by.get("docker")).toMatchObject({ level: 0, status: "gap", demand: 0.41 });
    expect(strip(by.get("docker")!)).toBe("○○○");
    expect(by.has("statistics")).toBe(false); // degree-upcoming isn't proof yet
    expect(by.has("code-review")).toBe(false);
    // highest level first, then by demand
    const levels = ladder.skills.map((s) => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });

  it("climbs Docker ○○○ → ●○○ → ●●○ → ●●● from three different agents' evidence", async () => {
    expect(strip(await skill("aisha", "docker"))).toBe("○○○");

    put("evidence", "ev_mc_aisha_docker", ev({ id: "ev_mc_aisha_docker", skillId: "docker", source: "micro-challenge", url: "/challenge?skill=docker", quote: "Passed the 20-minute Docker micro-challenge" }), "aisha");
    const tried = await skill("aisha", "docker");
    expect(strip(tried)).toBe("●○○");
    expect(tried.rungs[0]).toMatchObject({ label: "Tried it", evidence: { source: "micro-challenge" } });

    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8" });
    const built = await skill("aisha", "docker");
    expect(strip(built)).toBe("●●○");
    expect(built.level).toBe(2);
    expect(built.rungs[1].evidence).toMatchObject({ source: "keystone-pod", url: "https://github.com/keystone-demo/pod-vision-demo/pull/8" });
    expect(built.rungs[0].evidence?.source).toBe("micro-challenge");

    put("evidence", "ev_int_aisha_docker", ev({ id: "ev_int_aisha_docker", skillId: "docker", source: "keystone-interview", level: 3, quote: "Walked through the Dockerfile she merged" }), "aisha");
    const taught = await skill("aisha", "docker");
    expect(strip(taught)).toBe("●●●");
    expect(taught.rungs[2]).toMatchObject({ label: "Can teach it", evidence: { source: "keystone-interview" } });
    expect(describeLadder(taught)).toBe("Docker: all three rungs proven.");
  });

  it("gives the reviewer rung 3 (Can teach it) for the skill named in their code review", async () => {
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8" });
    const priya = await skill("priya", "docker");
    expect(priya.rungs[2]).toMatchObject({ status: "done", evidence: { source: "code-review", quote: "Reviewed Aisha's Docker PR" } });
    // Priya has no separate Built-it proof: it counts as done because a higher rung is proven, with no evidence of its own.
    expect(priya.rungs[1]).toMatchObject({ status: "done", impliedBy: 3 });
    expect(priya.rungs[1].evidence).toBeUndefined();
    expect(priya.level).toBe(3);
  });

  it("counts a stored proof even when its evidence lives elsewhere", async () => {
    put("proofs", "pod_demo01:2", {
      id: "pod_demo01:2", podId: "pod_demo01", issueIndex: 2, userId: "mei", skillId: "python", skillName: "Python", reviewerUserId: "aisha",
      evidenceIds: ["ev_x_mei", "ev_x_aisha_review"], readinessBefore: 0.2, readinessAfter: 0.25, badgesEarned: [], momentumPoints: 5, message: "Python proven",
    }, "mei");
    const aisha = await skill("aisha", "python");
    expect(aisha.rungs[2].evidence).toMatchObject({ source: "code-review", quote: "Reviewed Mei's Python PR" });
    const mei = await skill("mei", "python");
    expect(mei.rungs[1].evidence).toMatchObject({ source: "keystone-pod", quote: "Merged 'Write the Python image preprocessing module'" });
  });
});

describe("skillsMentioned", () => {
  it("finds skill names in review quotes without false positives", () => {
    expect(skillsMentioned("Reviewed Aisha's Docker PR")).toEqual(["docker"]);
    expect(skillsMentioned("Reviewed Tom's SQL PR")).toEqual(["sql"]);
    expect(skillsMentioned("Reviewed Mei's JavaScript PR")).toEqual(["javascript"]);
    expect(skillsMentioned("we use sql and git daily")).toEqual([]);
  });
});

describe("getLatestProof", () => {
  it("before any merge: Aisha's demo pod issue, flagged in-progress and demo", async () => {
    const latest = await getLatestProof("aisha");
    expect(LatestProofZ.safeParse(latest).success).toBe(true);
    expect(latest).toMatchObject({ status: "in-progress", isDemo: true, skillId: "docker", reviewerName: "Priya", prTitle: "Containerise the captioning API with Docker" });
    expect(latest!.dynamicVariables).toMatchObject({ latest_pr_status: "in progress", latest_pr_merged_on: "" });
  });

  it("after a merge: the merged PR with ElevenLabs-ready dynamic variables", async () => {
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8", mergedAt: "2026-11-03T10:00:00.000Z" });
    const latest = await getLatestProof("aisha");
    expect(latest).toMatchObject({ status: "merged", isDemo: false, mergedAt: "2026-11-03T10:00:00.000Z", ladderLevel: 2, repo: "pod-vision-demo", podName: podFixture.name });
    expect(latest!.dynamicVariables).toMatchObject({
      latest_pr_title: "Containerise the captioning API with Docker", latest_pr_skill: "Docker", latest_pr_reviewer: "Priya",
      latest_pr_status: "merged", latest_pr_merged_on: "Tuesday 3 November", ladder_level: "2 of 3: Built it",
      latest_pr_url: "https://github.com/keystone-demo/pod-vision-demo/pull/8",
    });
  });

  it("is null for someone with no proof and no demo issue", async () => {
    expect(await getLatestProof("nobody")).toBeNull();
  });
});

describe("Skill Passport", () => {
  it("is private by default: the owner sees it, others get PrivateError until they opt in", async () => {
    const own = await getPassport("aisha", "aisha");
    expect(PassportZ.safeParse(own).success).toBe(true);
    expect(own).toMatchObject({ isOwner: true, isPublic: false, name: "Aisha Rahman", programme: "BSc Computer Science, University of Manchester", roleName: "ML engineer", readinessNow: 0.38 });
    expect(own.skills.every((s) => s.level > 0)).toBe(true);
    await expect(getPassport("aisha", "tom")).rejects.toBeInstanceOf(PrivateError);
    await expect(setPassportVisibility("aisha", "tom", true)).rejects.toBeInstanceOf(PrivateError);

    await setPassportVisibility("aisha", "aisha", true);
    const visitor = await getPassport("aisha", "tom");
    expect(visitor).toMatchObject({ isOwner: false, isPublic: true });
  });
});
