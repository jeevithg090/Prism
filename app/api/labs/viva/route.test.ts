import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async () => { throw new Error("no_key"); }),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));
vi.mock("@/lib/graph/build", () => ({ loadGraph: vi.fn(async () => null) }));
vi.mock("octokit", () => ({ Octokit: class { request = vi.fn(async () => { throw new Error("no network in tests"); }); } }));

import { GET, POST as start } from "./route";
import { POST as grade } from "./grade/route";
import { POST as review } from "./review/route";
import { tool } from "@/lib/agents/tools/extra/viva";
import { feature } from "@/lib/features/items/viva";
import { getProofLadder } from "@/lib/agents/ladder";
import { testStore } from "@/tests/seededStore";
import type { VivaOverview, VivaSession } from "@/lib/labs/viva/model";

const json = (body: unknown, cookie?: string) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const call = async <T,>(fn: (r: Request) => Promise<Response>, body: unknown, cookie?: string) => {
  const res = await fn(new Request("http://localhost/api/labs/viva", json(body, cookie)));
  return { status: res.status, body: (await res.json()) as { ok: boolean; data: T; error?: { code: string; message: string } } };
};
const overview = async (userId: string, sessionId?: string) => {
  const q = new URLSearchParams({ userId, ...(sessionId ? { sessionId } : {}) });
  const res = await GET(new Request(`http://localhost/api/labs/viva?${q}`));
  return (await res.json()).data as VivaOverview;
};
const answersFrom = (s: VivaSession, set: "honest" | "gamed") => s.questions.map((q, k) => ({ questionId: q.id, text: s.demo![set][k], mode: "text" as const }));

beforeAll(() => { process.env.DEMO_MODE = "true"; });
afterAll(() => { delete process.env.DEMO_MODE; });
beforeEach(() => testStore().reset());

describe("Viva Check routes", () => {
  it("GET validates and lists the student's own pod PRs", async () => {
    expect((await GET(new Request("http://localhost/api/labs/viva"))).status).toBe(400);
    const o = await overview("aisha");
    expect(o.demo).toBe(true);
    expect(o.sources.map((s) => [s.podId, s.issueIndex, s.skillId])).toEqual([["pod_demo01", 0, "docker"], ["pod_demo01", 4, "pytorch"]]);
    expect(o.sources[0]).toMatchObject({ prNumber: 1, reviewerName: "Priya", merged: false });
    expect(o.session).toBeNull();
    const cookieDenied = await GET(new Request("http://localhost/api/labs/viva?userId=aisha", { headers: { cookie: "ks_uid=tom" } }));
    expect(cookieDenied.status).toBe(403);
  });

  it("POST starts a viva from the PR diff: three anchored questions, no rubric in the response", async () => {
    expect((await call(start, "nope")).status).toBe(400);
    const r = await call<VivaSession>(start, { userId: "aisha" });
    expect(r.status).toBe(201);
    const s = r.body.data;
    expect(s.source).toMatchObject({ kind: "pod-issue", issueIndex: 0, prTitle: "Add a Dockerfile for the captioning API" });
    expect(s.questions.map((q) => q.kind)).toEqual(["order", "tradeoff", "break"]);
    expect(s.reviewHints).toBe(2);
    for (const q of s.questions) for (const i of q.anchor) expect(s.diff[i].kind).toBe("add");
    expect(JSON.stringify(s)).not.toMatch(/probeIds|nudge|"re":/);
    expect(s.demo?.honest).toHaveLength(3);
  });

  it("refuses a viva on someone else's issue, an unknown pod, or someone else's session", async () => {
    expect((await call(start, { userId: "aisha", source: { kind: "pod-issue", podId: "pod_demo01", issueIndex: 1 } })).status).toBe(403);
    expect((await call(start, { userId: "aisha", source: { kind: "pod-issue", podId: "nope", issueIndex: 0 } })).status).toBe(404);
    expect((await call(start, { userId: "aisha" }, "ks_uid=priya")).status).toBe(403);
    const s = (await call<VivaSession>(start, { userId: "aisha" })).body.data;
    const other = await call(grade, { userId: "tom", sessionId: s.id, answers: [{ questionId: "q1", text: "Because the cache layer is invalidated." }] });
    expect(other.status).toBe(403);
  });

  it("an honest viva passes, writes keystone-interview evidence and lights Proof Ladder rung 3", async () => {
    const before = await getProofLadder("aisha", "docker");
    expect(before.skills[0].rungs[2].status).toBe("open");
    const s = (await call<VivaSession>(start, { userId: "aisha" })).body.data;
    expect((await call(grade, { userId: "aisha", sessionId: s.id, answers: [{ questionId: "q1", text: "   " }] })).status).toBe(400);
    const r = await call<VivaSession>(grade, { userId: "aisha", sessionId: s.id, answers: answersFrom(s, "honest") });
    expect(r.status).toBe(200);
    const res = r.body.data.result!;
    expect(res).toMatchObject({ score: 8, maxScore: 9, passMark: 6, passed: true, reviewerFlagged: false, gradedBy: "rules", ladderAfter: 3 });
    expect(res.perQuestion.map((g) => g.verdict)).toEqual(["explained", "partial", "explained"]);
    expect(res.perQuestion[1].feedback).toMatch(/\?$/);
    expect(r.body.data.status).toBe("passed");

    const ev = await testStore().get<{ source: string; skillId: string; level: number; quote: string }>("evidence", res.evidenceId!);
    expect(ev).toMatchObject({ source: "keystone-interview", skillId: "docker", level: 1 });
    expect(ev!.quote).toMatch(/Viva Check on PR #1/);
    const after = await getProofLadder("aisha", "docker");
    expect(after.skills[0].rungs[2]).toMatchObject({ status: "done", evidence: { source: "keystone-interview" } });
    expect(await testStore().get("momentum_events", `viva-${s.id}`)).toMatchObject({ kind: "mock-interview", userId: "aisha" });

    const again = await call(grade, { userId: "aisha", sessionId: s.id, answers: answersFrom(s, "honest") });
    expect(again.status).toBe(409);
  });

  it("a gamed viva is flagged for the reviewer, who alone can clear it after asking in person", async () => {
    const s = (await call<VivaSession>(start, { userId: "aisha" })).body.data;
    const r = await call<VivaSession>(grade, { userId: "aisha", sessionId: s.id, answers: answersFrom(s, "gamed") });
    const res = r.body.data.result!;
    expect(res.passed).toBe(false);
    expect(res.reviewerFlagged).toBe(true);
    expect(res.perQuestion.flatMap((g) => g.flags)).toEqual(expect.arrayContaining(["keyword-list", "repeats-question", "injection"]));
    expect(res.evidenceId).toBeUndefined();
    expect(r.body.data.status).toBe("re-viva");
    expect(r.body.data.integrity.join(" ")).toMatch(/addressed to the grader/);

    const queue = (await overview("priya")).reviewQueue;
    expect(queue.map((q) => q.id)).toEqual([s.id]);
    expect(queue[0].weakTopics.length).toBeGreaterThan(0);
    const reviewerView = await overview("priya", s.id);
    expect(reviewerView.session?.answers).toHaveLength(3);
    expect(reviewerView.session?.demo).toBeUndefined();
    expect((await overview("tom", s.id)).session).toBeNull();

    expect((await call(review, { reviewerId: "aisha", sessionId: s.id, decision: "cleared" })).status).toBe(403);
    const kept = await call<VivaSession>(review, { reviewerId: "priya", sessionId: s.id, decision: "keep", note: "Let's talk Thursday" });
    expect(kept.body.data).toMatchObject({ status: "re-viva", reviewerNote: "Let's talk Thursday" });
    const cleared = await call<VivaSession>(review, { reviewerId: "priya", sessionId: s.id, decision: "cleared" });
    expect(cleared.body.data).toMatchObject({ status: "cleared", integrity: [] });
    expect(await testStore().get("evidence", `ev_viva_${s.id}_live`)).toMatchObject({ source: "keystone-interview", userId: "aisha" });
    expect((await overview("priya")).reviewQueue).toEqual([]);
  });

  it("works on any pasted diff and never asks about lines that are not in it", async () => {
    const diff = "diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1,0 +1,5 @@\n+TIMEOUT = 30\n+def fetch(url):\n+    if not url:\n+        raise ValueError(\"url is required\")\n+    return get(url, timeout=TIMEOUT)";
    const r = await call<VivaSession>(start, { userId: "tom", source: { kind: "custom", title: "Add fetch helper", diff } });
    expect(r.status).toBe(201);
    expect(r.body.data.source.skillId).toBe("python");
    expect(r.body.data.questions.length).toBeGreaterThan(0);
    for (const q of r.body.data.questions) for (const i of q.anchor) expect(r.body.data.diff[i].kind).toBe("add");
    const none = await call(start, { userId: "tom", source: { kind: "custom", title: "Docs", diff: "diff --git a/x.md b/x.md\n--- a/x.md\n+++ b/x.md\n@@ -1,0 +1,1 @@\n+hello" } });
    expect(none.status).toBe(422);
  });

  it("the start_viva tool and the Labs card are registered with honest metadata", async () => {
    expect(tool).toMatchObject({ name: "start_viva", effect: "write", requiresApproval: false, agent: "voice" });
    expect(tool.description.length).toBeGreaterThanOrEqual(60);
    expect(tool.description.length).toBeLessThanOrEqual(400);
    expect(tool.description).toMatch(/\breturns?\b/i);
    const out = await tool.run(tool.input.parse({}), { userId: "aisha", runId: "run_tool" });
    const summary = tool.summarize(out);
    expect(summary).toMatch(/^Viva ready on PR #1/);
    expect(summary.length).toBeLessThanOrEqual(400);
    await expect(tool.run(tool.input.parse({ podId: "pod_demo01" }), { userId: "aisha", runId: "run_tool" })).rejects.toThrow(/both podId and issueIndex/);
    expect(feature).toMatchObject({ key: "viva", href: "/labs/viva", pillar: "assessment" });
  });
});
