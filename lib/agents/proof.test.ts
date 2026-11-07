import { beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import { ProofResultZ } from "@/lib/schemas/studio";
import type { BridgeMap, EvidenceItem, Pod, Profile } from "@/lib/types";

const h = vi.hoisted(() => ({
  docs: new Map<string, { doc: unknown; userId?: string }>(),
  upsert: vi.fn(),
  emit: vi.fn(),
  loadGraph: vi.fn(),
}));

vi.mock("@/lib/agents/events", () => ({ emit: h.emit, newRunId: () => "run_proof", subscribe: vi.fn() }));
vi.mock("@/lib/graph/build", () => ({ loadGraph: h.loadGraph }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) =>
      [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.upsert(c, id, doc, userId); h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId }); return doc; },
    remove: async (c: string, id: string) => { h.docs.delete(`${c}/${id}`); },
  }),
}));

import { NotFoundError, proofFromPullRequestEvent, readinessFormula, recordMergedPR, referencedIssueNumber, resetPodProofs } from "./proof";

const dna = { targetRoles: ["ml-engineer"] } as Profile["dna"];
const profiles: Profile[] = [
  { id: "aisha", name: "Aisha Rahman", badges: ["new-to-uni", "international"], dna } as Profile,
  { id: "priya", name: "Priya Shah", badges: ["first-gen"], githubLogin: "priya-demo", dna } as Profile,
  { id: "tom", name: "Tom Okafor", badges: ["first-gen"], githubLogin: "tom-okafor-demo", dna } as Profile,
  { id: "mei", name: "Mei Lin", badges: ["new-to-uni", "international"], githubLogin: "mei-lin-demo", dna } as Profile,
];
const pod = podFixture as Pod;
const upserts = (c: string) => h.upsert.mock.calls.filter((x) => x[0] === c);
const doc = <T,>(c: string, id: string) => h.docs.get(`${c}/${id}`)?.doc as T | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  h.docs.clear();
  for (const p of profiles) h.docs.set(`profiles/${p.id}`, { doc: structuredClone(p), userId: p.id });
  h.docs.set(`pods/${pod.id}`, { doc: structuredClone(pod), userId: "aisha" });
  h.loadGraph.mockImplementation(async (userId: string, roleId: string) =>
    userId === "aisha" && roleId === "ml-engineer" ? structuredClone(mapFixture as BridgeMap) : null);
});

describe("recordMergedPR", () => {
  it("writes evidence for the learner AND the reviewer (teaching is assessed too)", async () => {
    const out = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8" });
    expect(ProofResultZ.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ userId: "aisha", reviewerUserId: "priya", skillId: "docker", skillName: "Docker", momentumPoints: 5, runId: "run_proof" });
    const evs = upserts("evidence");
    expect(evs).toHaveLength(2);
    const [learnerEv, reviewerEv] = evs.map((c) => c[2] as EvidenceItem);
    expect(learnerEv).toMatchObject({
      userId: "aisha", skillId: "docker", level: 2, confidence: 0.9, source: "keystone-pod",
      url: "https://github.com/keystone-demo/pod-vision-demo/pull/8",
      quote: "Merged 'Containerise the captioning API with Docker' in pod-vision-demo, reviewed by Priya",
    });
    expect(evs[0][3]).toBe("aisha");
    expect(reviewerEv).toMatchObject({ userId: "priya", skillId: "code-review", level: 2, confidence: 0.8, source: "keystone-pod", quote: "Reviewed Aisha's Docker PR" });
    expect(evs[1][3]).toBe("priya");
    expect(out.evidenceIds).toEqual([learnerEv.id, reviewerEv.id]);
  });

  it("uses the issue URL when no PR URL is given", async () => {
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    expect((upserts("evidence")[0][2] as EvidenceItem).url).toBe("https://github.com/keystone-demo/pod-vision-demo/issues/1");
  });

  it("flips the Bridge Map node to proven and moves readiness up by the formula delta", async () => {
    const before = readinessFormula((mapFixture as BridgeMap).nodes);
    const out = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    expect(out.readinessBefore).toBe(0.38);
    expect(out.readinessAfter).toBeGreaterThan(out.readinessBefore);
    const saved = doc<BridgeMap>("maps", "aisha:ml-engineer")!;
    const docker = saved.nodes.find((n) => n.skillId === "docker")!;
    expect(docker.status).toBe("proven");
    expect(docker.level).toBeGreaterThanOrEqual(2);
    expect(docker.evidenceIds).toContain(out.evidenceIds[0]);
    const delta = readinessFormula(saved.nodes) - before;
    expect(out.readinessAfter).toBe(Math.round((0.38 + delta) * 100) / 100);
    expect(saved.readinessNow).toBe(out.readinessAfter);
    expect(upserts("maps")[0][3]).toBe("aisha");
    expect(out.message).toBe(`Docker is now proven on Aisha's Bridge Map · readiness 38% → ${Math.round(out.readinessAfter * 100)}%`);
  });

  it("starts from the stored map on the next merge (readiness keeps climbing)", async () => {
    const first = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    const second = await recordMergedPR({ podId: "pod_demo01", issueIndex: 4 }); // Aisha's PyTorch issue
    expect(second.readinessBefore).toBe(first.readinessAfter);
    expect(second.readinessAfter).toBeGreaterThan(second.readinessBefore);
  });

  it("awards 🛠️ shipped only for the learner's first merged pod PR", async () => {
    const first = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    expect(first.badgesEarned).toEqual(["shipped"]);
    expect(doc<Profile>("profiles", "aisha")!.badges).toContain("shipped");
    const second = await recordMergedPR({ podId: "pod_demo01", issueIndex: 4 });
    expect(second.badgesEarned).toEqual([]);
    const progress = doc<{ merged: { issueIndex: number; userId: string; skillId: string }[] }>("pod_progress", "pod_demo01")!;
    expect(progress.merged.map((m) => [m.issueIndex, m.userId, m.skillId])).toEqual([[0, "aisha", "docker"], [4, "aisha", "pytorch"]]);
  });

  it("is idempotent per (podId, issueIndex): same result, nothing new written", async () => {
    const first = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    const writes = h.upsert.mock.calls.length;
    const second = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://example.com/other" });
    expect(second).toEqual(first);
    expect(h.upsert.mock.calls.length).toBe(writes);
    // concurrent double-click also writes once
    h.upsert.mockClear();
    const [a, b] = await Promise.all([recordMergedPR({ podId: "pod_demo01", issueIndex: 1 }), recordMergedPR({ podId: "pod_demo01", issueIndex: 1 })]);
    expect(a).toEqual(b);
    expect(upserts("pod_progress")).toHaveLength(1);
  });

  it("gives the reviewer helped-newcomer only when the learner is 🌱 new-to-uni", async () => {
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 }); // Aisha 🌱, reviewed by Priya
    const m1 = upserts("momentum_events").map((c) => c[2] as { userId: string; kind: string; label?: string });
    expect(m1).toEqual([
      expect.objectContaining({ userId: "aisha", kind: "pr-merged", label: "Merged PR in pod-vision-demo" }),
      expect.objectContaining({ userId: "priya", kind: "helped-newcomer", label: "Reviewed Aisha's first Docker PR" }),
    ]);
    h.upsert.mockClear();
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 1 }); // Priya (not 🌱), reviewed by Tom
    const m2 = upserts("momentum_events").map((c) => c[2] as { userId: string; kind: string });
    expect(m2).toEqual([expect.objectContaining({ userId: "priya", kind: "pr-merged" })]);
  });

  it("students with no map: readiness 0 → 0 and no map write", async () => {
    const out = await recordMergedPR({ podId: "pod_demo01", issueIndex: 3 }); // Tom's PyTorch issue
    expect(out.readinessBefore).toBe(0);
    expect(out.readinessAfter).toBe(0);
    expect(upserts("maps")).toHaveLength(0);
    expect(out.message).toBe("PyTorch is now proven for Tom · reviewed by Priya");
  });

  it("emits the Tech Lead → Evidence → Roadmap handoff chain with real names and numbers", async () => {
    const out = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0, runId: "run_ui" });
    expect(out.runId).toBe("run_ui");
    const chain = h.emit.mock.calls.map((c) => [c[0].agent, c[0].message]);
    const after = `${Math.round(out.readinessAfter * 100)}%`;
    expect(chain).toEqual([
      ["techlead", "PR merged: 'Containerise the captioning API with Docker' (reviewed by Priya)"],
      ["evidence", "Docker proven for Aisha · source: Keystone pod"],
      ["evidence", "Code review proven for Priya"],
      ["roadmap", `Aisha's readiness 38% → ${after} · re-planning week 2`],
      ["orchestrator", out.message],
    ]);
    expect(h.emit.mock.calls.every((c) => c[0].runId === "run_ui")).toBe(true);
    expect(h.emit.mock.calls.at(-1)![0].status).toBe("done");
  });

  it("marks the roadmap week done when the merged skill is its focus", async () => {
    const week = (n: number, s: string) => ({ week: n, focusSkillId: s, proof: "p", tasks: [{ id: `t${n}`, done: false }] });
    h.docs.set("roadmaps/aisha", { doc: { userId: "aisha", weeks: [week(1, "docker"), week(2, "pytorch")] }, userId: "aisha" });
    await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    const rm = doc<{ weeks: { tasks: { done: boolean }[] }[] }>("roadmaps", "aisha")!;
    expect(rm.weeks[0].tasks.every((t) => t.done)).toBe(true);
    expect(rm.weeks[1].tasks.every((t) => t.done)).toBe(false);
  });

  it("throws NotFoundError for an unknown pod or an issue index out of range", async () => {
    await expect(recordMergedPR({ podId: "pod_nope", issueIndex: 0 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordMergedPR({ podId: "pod_demo01", issueIndex: 99 })).rejects.toBeInstanceOf(NotFoundError);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("proofFromPullRequestEvent", () => {
  const event = (pr: Record<string, unknown>, repo = "https://github.com/keystone-demo/pod-vision-demo", action = "closed") => ({
    action,
    pull_request: { number: 9, title: "Dockerise", body: "", html_url: `${repo}/pull/9`, merged: true, merged_at: "2026-11-07T15:30:00Z", user: { login: "someone" }, ...pr },
    repository: { name: repo.split("/").pop(), full_name: repo.replace("https://github.com/", ""), html_url: repo, owner: { login: "keystone-demo" } },
  });

  it("parses 'Closes #n' before any other #n", () => {
    expect(referencedIssueNumber("Refs #7\n\nCloses #3")).toBe(3);
    expect(referencedIssueNumber("Add Dockerfile (#2)")).toBe(2);
    expect(referencedIssueNumber("No refs here")).toBeNull();
  });

  it("maps 'Closes #1' to issue index 0 and records proof", async () => {
    const out = await proofFromPullRequestEvent(event({ body: "Adds the Dockerfile.\n\nCloses #1" }));
    expect(out).toMatchObject({ podId: "pod_demo01", issueIndex: 0, userId: "aisha", skillId: "docker" });
    expect((upserts("evidence")[0][2] as EvidenceItem).url).toBe("https://github.com/keystone-demo/pod-vision-demo/pull/9");
    expect((upserts("momentum_events")[0][2] as { ts: string }).ts).toBe("2026-11-07T15:30:00Z");
  });

  it("falls back to the PR author's GitHub login → their first unmerged issue", async () => {
    const out = await proofFromPullRequestEvent(event({ title: "SQL schema", user: { login: "Priya-Demo" } }));
    expect(out).toMatchObject({ issueIndex: 1, userId: "priya", skillId: "sql" });
    const next = await proofFromPullRequestEvent(event({ number: 10, title: "AWS deploy", user: { login: "priya-demo" } }));
    expect(next).toMatchObject({ issueIndex: 6, skillId: "aws" });
  });

  it("returns null for unmerged PRs, unknown repos and unmatched PRs", async () => {
    expect(await proofFromPullRequestEvent(event({ merged: false }))).toBeNull();
    expect(await proofFromPullRequestEvent(event({}, "https://github.com/keystone-demo/pod-vision-demo", "opened"))).toBeNull();
    expect(await proofFromPullRequestEvent(event({ body: "Closes #1" }, "https://github.com/someone/else"))).toBeNull();
    expect(await proofFromPullRequestEvent(event({ title: "misc" }))).toBeNull();
    expect(await proofFromPullRequestEvent({ zen: "hi" })).toBeNull();
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("resetPodProofs (presenter reset for the demo pod)", () => {
  it("undoes a merge so the same issue can be merged again with the same readiness jump", async () => {
    const first = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    expect(doc("pod_progress", "pod_demo01")).toBeTruthy();
    const out = await resetPodProofs("pod_demo01");
    expect(out).toEqual({ podId: "pod_demo01", cleared: 1 });
    expect(doc("pod_progress", "pod_demo01")).toBeUndefined();
    expect(doc("proofs", "pod_demo01:0")).toBeUndefined();
    expect(doc("maps", "aisha:ml-engineer")).toBeUndefined();
    expect([...h.docs.keys()].some((k) => k.startsWith("evidence/ev_pod_pod_demo01_0"))).toBe(false);
    const again = await recordMergedPR({ podId: "pod_demo01", issueIndex: 0 });
    expect(again.readinessBefore).toBe(first.readinessBefore);
    expect(again.readinessAfter).toBe(first.readinessAfter);
  });

  it("is a no-op on a clean pod and a NotFoundError for an unknown pod", async () => {
    expect(await resetPodProofs("pod_demo01")).toEqual({ podId: "pod_demo01", cleared: 0 });
    await expect(resetPodProofs("pod_nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
