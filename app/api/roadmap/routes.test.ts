// Route tests for /api/graph, /api/evidence and /api/roadmap (contract §6 envelope, zod 400s, 404s, DEMO_MODE).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memStore } from "@/lib/graph/testStore";

const h = vi.hoisted(() => ({
  store: null as unknown as ReturnType<typeof import("@/lib/graph/testStore").memStore>,
  events: [] as { runId: string; agent: string; status: string; message: string }[],
}));
vi.mock("@/lib/store", () => ({ getStore: () => h.store }));
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn().mockRejectedValue(new Error("no_key")), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: (e: (typeof h.events)[number]) => h.events.push(e), newRunId: () => "run_server" }));

import { GET as getGraph } from "@/app/api/graph/[userId]/route";
import { GET as getEvidence } from "@/app/api/evidence/[userId]/route";
import { POST as syncEvidence } from "@/app/api/evidence/sync/route";
import { POST as generate } from "@/app/api/roadmap/generate/route";
import { GET as getRoadmap } from "@/app/api/roadmap/[userId]/route";
import { PATCH as patchTask } from "@/app/api/roadmap/[userId]/tasks/[taskId]/route";

const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { h.store = memStore(); h.events.length = 0; });
afterEach(() => { delete process.env.DEMO_MODE; vi.restoreAllMocks(); });

describe("GET /api/graph/[userId]", () => {
  it("returns Aisha's map with readiness 0.38 → 0.84 and her role from her profile", async () => {
    process.env.DEMO_MODE = "true";
    const res = await getGraph(new Request("http://x/api/graph/aisha"), params({ userId: "aisha" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ userId: "aisha", roleId: "ml-engineer", readinessNow: 0.38, readinessProjected: 0.84 });
  });
  it("404s for a user with no map and 400s for a bad id", async () => {
    const missing = await getGraph(new Request("http://x/api/graph/nobody"), params({ userId: "nobody" }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).ok).toBe(false);
    const bad = await getGraph(new Request("http://x/api/graph/..%2Fetc"), params({ userId: "../etc" }));
    expect(bad.status).toBe(400);
  });
});

describe("evidence routes", () => {
  it("GET lists fixture and store evidence, newest first", async () => {
    await h.store.upsert("evidence", "ev_pod_x", { id: "ev_pod_x", userId: "aisha", skillId: "docker", level: 2, confidence: 0.9, source: "keystone-pod", url: "https://github.com/x/pull/1", createdAt: "2026-11-07T15:00:00Z" }, "aisha");
    const res = await getEvidence(new Request("http://x"), params({ userId: "aisha" }));
    const body = await res.json();
    expect(body.data[0].id).toBe("ev_pod_x");
    expect(body.data.map((e: { skillId: string }) => e.skillId)).toEqual(expect.arrayContaining(["python", "git", "html-css", "javascript"]));
  });
  it("POST sync validates, and in DEMO_MODE returns the fixture without calling GitHub", async () => {
    expect((await syncEvidence(new Request("http://x", json({})))).status).toBe(400);
    process.env.DEMO_MODE = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await syncEvidence(new Request("http://x", json({ userId: "aisha" })));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toMatchObject({ agent: "evidence", status: "done" });
  });
  it("POST sync live: GitHub languages become conservative evidence", async () => {
    await h.store.upsert("profiles", "zed", { id: "zed", name: "Zed", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges: [], interests: [], availability: [], dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" } }, "zed");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/users/zed-gh/repos")) return Response.json([{ name: "cv", html_url: "https://github.com/zed-gh/cv", fork: false, pushed_at: "2026-11-01", languages_url: "https://api.github.com/repos/zed-gh/cv/languages" }]);
      return Response.json({ Python: 80_000, HTML: 2_000 });
    });
    const res = await syncEvidence(new Request("http://x", json({ userId: "zed", githubLogin: "zed-gh" })));
    const items = (await res.json()).data as { skillId: string; level: number; confidence: number }[];
    expect(items.find((e) => e.skillId === "python")).toMatchObject({ level: 2, confidence: 0.5 });
    expect(items.find((e) => e.skillId === "html-css")).toMatchObject({ level: 1 });
  });
  it("POST sync live: a LeetCode handle alone runs the LeetCode connector", async () => {
    await h.store.upsert("profiles", "lee", { id: "lee", name: "Lee", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges: [], interests: [], availability: [], dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" } }, "lee");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: {
      matchedUser: { username: "lee-lc", profile: { ranking: 1000 }, submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 200 }, { difficulty: "Easy", count: 80 }, { difficulty: "Medium", count: 100 }, { difficulty: "Hard", count: 20 }] }, problemsSolvedBeatsStats: [] },
      recentAcSubmissionList: [],
    } }));
    const res = await syncEvidence(new Request("http://x", json({ userId: "lee", leetcodeUser: "lee-lc" })));
    expect(res.status).toBe(200);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("leetcode.com/graphql");
    const items = (await res.json()).data as { skillId: string; source: string; level: number }[];
    expect(items.filter((e) => e.source === "leetcode").map((e) => e.skillId).sort()).toEqual(["algorithms", "data-structures"]);
    expect(items.find((e) => e.skillId === "algorithms")).toMatchObject({ level: 2 });
  });
  it("POST sync live: GitHub and LeetCode together return both sources' evidence", async () => {
    await h.store.upsert("profiles", "duo", { id: "duo", name: "Duo", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges: [], interests: [], availability: [], dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" } }, "duo");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("leetcode.com")) return Response.json({ data: { matchedUser: { username: "duo", profile: {}, submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 30 }] }, problemsSolvedBeatsStats: [] }, recentAcSubmissionList: [] } });
      if (u.includes("/users/duo-gh/repos")) return Response.json([{ name: "cv", html_url: "https://github.com/duo-gh/cv", fork: false, pushed_at: "2026-11-01", languages_url: "https://api.github.com/repos/duo-gh/cv/languages" }]);
      return Response.json({ Python: 80_000 });
    });
    const res = await syncEvidence(new Request("http://x", json({ userId: "duo", githubLogin: "duo-gh", leetcodeUser: "duo" })));
    const items = (await res.json()).data as { source: string }[];
    expect(new Set(items.map((e) => e.source))).toEqual(new Set(["github", "leetcode"]));
  });
});

describe("roadmap routes", () => {
  it("GET returns Aisha's roadmap and 404s for nobody", async () => {
    const ok = await getRoadmap(new Request("http://x"), params({ userId: "aisha" }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.weeks[0].focusSkillId).toBe("docker");
    const missing = await getRoadmap(new Request("http://x"), params({ userId: "nobody" }));
    expect(missing.status).toBe(404);
    expect((await missing.json()).ok).toBe(false);
  });
  it("POST generate validates, re-plans with a run id and narrates orchestrator → roadmap → orchestrator done", async () => {
    expect((await generate(new Request("http://x", json({ roleId: "ml-engineer" })))).status).toBe(400);
    expect((await generate(new Request("http://x", json({ userId: "nobody" })))).status).toBe(404);
    process.env.DEMO_MODE = "true";
    const res = await generate(new Request("http://x", json({ userId: "aisha", runId: "run_client1" })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ runId: "run_client1", version: 2, readinessNow: 0.38 });
    expect(body.data.weeks).toHaveLength(12);
    expect(h.events[0]).toMatchObject({ runId: "run_client1", agent: "orchestrator", status: "started" });
    expect(h.events.some((e) => e.agent === "roadmap" && e.message === "skipped 2 skills your degree covers")).toBe(true);
    expect(h.events.at(-1)).toMatchObject({ agent: "orchestrator", status: "done" });
  });
  it("PATCH ticks a task (400 on a bad body, 404 on an unknown task)", async () => {
    const bad = await patchTask(new Request("http://x", json({ done: "yes" }, "PATCH")), params({ userId: "aisha", taskId: "t_1_1" }));
    expect(bad.status).toBe(400);
    const missing = await patchTask(new Request("http://x", json({ done: true }, "PATCH")), params({ userId: "aisha", taskId: "t_99_1" }));
    expect(missing.status).toBe(404);
    const res = await patchTask(new Request("http://x", json({ done: true }, "PATCH")), params({ userId: "aisha", taskId: "t_1_1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: "t_1_1", done: true });
    const again = await getRoadmap(new Request("http://x"), params({ userId: "aisha" }));
    expect((await again.json()).data.weeks[0].tasks[0].done).toBe(true);
  });
});
