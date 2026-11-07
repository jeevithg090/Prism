// Route tests for /api/labs/pathway (GET ranking, POST roadmap preview/approve, POST undo): envelope, zod 400s,
// viewer from the cookie, the human checkpoint, the run ledger and the writes other parts read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async () => { throw new Error("no_key"); }),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));

import { GET } from "@/app/api/labs/pathway/route";
import { POST as addPOST } from "@/app/api/labs/pathway/roadmap/route";
import { POST as undoPOST } from "@/app/api/labs/pathway/undo/route";
import { getRunEvents } from "@/lib/agents/events";
import { PATHWAY_COLLECTION } from "@/lib/labs/pathway/agent";
import type { PathwayResult } from "@/lib/labs/pathway/types";
import type { Roadmap } from "@/lib/types";
import { testStore } from "@/tests/seededStore";

const get = (qs = "?demo=1", cookie?: string) => GET(new Request(`http://x/api/labs/pathway${qs}`, cookie ? { headers: { cookie } } : undefined));
const post = (fn: (r: Request) => Promise<Response>, body: unknown, cookie?: string) =>
  fn(new Request("http://x", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const QUAYLINE = "opp-quayline-ml-intern";

beforeEach(() => {
  process.env.DEMO_MODE = "true";
  testStore().reset();
});
afterEach(() => { delete process.env.DEMO_MODE; });

describe("GET /api/labs/pathway", () => {
  it("ranks the demo listings for Aisha deterministically and narrates the run with real numbers", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const data = body.data as PathwayResult;
    expect(data).toMatchObject({ userId: "aisha", firstName: "Aisha", roleId: "ml-engineer", asOf: "2026-11-07T09:00:00.000Z", hoursPerWeek: 8, source: "demo", closed: 0 });
    expect(data.paths).toHaveLength(7);
    expect(data.paths[0].state).toBe("apply-now");
    const q = data.paths.find((p) => p.opportunity.id === QUAYLINE)!;
    expect(q).toMatchObject({ state: "within-reach", skillsToLearn: 2, studyWeeks: 3 });
    const events = getRunEvents(data.runId!);
    expect(events.map((e) => `${e.agent}:${e.status}`)).toEqual(expect.arrayContaining(["roadmap:started", "market:done", "roadmap:done"]));
    expect(events.find((e) => e.agent === "market" && e.status === "done")?.message).toMatch(/7 open listings/);
    expect(events.find((e) => /skill combinations/.test(e.message))).toBeTruthy();
    const second = (await (await get()).json()).data as PathwayResult;
    expect(JSON.stringify(second.paths)).toBe(JSON.stringify(data.paths));
  });

  it("acts for the cookie's student (never a query field), and 404s with a plain message when there is no profile", async () => {
    const priya = (await (await get("", "ks_uid=priya")).json()).data as PathwayResult;
    expect(priya.userId).toBe("priya");
    // Priya has proven Docker and PyTorch, so Quayline is closer for her than for Aisha.
    const q = priya.paths.find((p) => p.opportunity.id === QUAYLINE)!;
    expect(q.steps.find((s) => s.skillId === "docker")?.mode).toBe("have");
    const forged = (await (await get("?userId=priya&demo=1")).json()).data as PathwayResult;
    expect(forged.userId).toBe("aisha");
    const missing = await get("", "ks_uid=nobody");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });

  it("400s on a bad query", async () => {
    expect((await get("?demo=yes")).status).toBe(400);
  });
});

describe("POST /api/labs/pathway/roadmap (human checkpoint)", () => {
  it("previews without writing, then writes only when approved, with a ledger entry naming the checkpoint", async () => {
    const store = testStore();
    const before = (await (await get()).json()).data as PathwayResult;
    expect(before.applied).toBeUndefined();

    const preview = await (await post(addPOST, { opportunityId: QUAYLINE, demo: true })).json();
    expect(preview.data.status).toBe("needs_approval");
    expect(preview.data.preview.changes.map((c: { skillId: string }) => c.skillId)).toEqual(["docker", "tensorflow"]);
    const unchanged = await store.get<Roadmap>("roadmaps", "aisha");
    expect(unchanged?.version ?? 1).toBe(1);
    expect(await store.get(PATHWAY_COLLECTION, "aisha")).toBeNull();

    const added = await (await post(addPOST, { opportunityId: QUAYLINE, approved: true, rememberGoal: true, demo: true })).json();
    expect(added.data).toMatchObject({ status: "added", version: 2, rememberedGoal: true });
    const rm = await store.get<Roadmap>("roadmaps", "aisha");
    expect(rm?.version).toBe(2);
    expect(rm?.weeks.slice(0, 3).map((w) => w.focusSkillId)).toEqual(["docker", "tensorflow", "tensorflow"]);
    const runs = await store.list<{ agent: string; status: string; checkpoint?: { kind: string }; guardrails: { name: string; action: string }[] }>("agent_runs");
    const run = runs.find((r) => r.checkpoint?.kind === "student-approval");
    expect(run).toMatchObject({ agent: "roadmap", status: "ok" });
    expect(run?.guardrails).toEqual(expect.arrayContaining([expect.objectContaining({ name: "noOutboundMessaging", action: "pass" })]));
    const notes = await store.list<{ kind: string; text: string }>("coach_memory", { userId: "aisha" });
    expect(notes.some((n) => n.kind === "goal" && /Quayline Health/.test(n.text))).toBe(true);

    const after = (await (await get()).json()).data as PathwayResult;
    expect(after.applied).toMatchObject({ opportunityId: QUAYLINE, version: 2 });
    const again = await (await post(addPOST, { opportunityId: QUAYLINE, approved: true, demo: true })).json();
    expect(again.data).toMatchObject({ status: "already-added", version: 2 });
  });

  it("says there is nothing to add for an apply-now listing or a path that waits for a module", async () => {
    const now = await (await post(addPOST, { opportunityId: "opp-fernhill-sprint", approved: true, demo: true })).json();
    expect(now.data.status).toBe("nothing-to-add");
    const later = await (await post(addPOST, { opportunityId: "opp-pennine-placement", demo: true })).json();
    expect(later.data.status).toBe("nothing-to-add");
    expect(later.data.message).toMatch(/re-plans/);
  });

  it("validates input and 404s an unknown listing", async () => {
    expect((await post(addPOST, "not json")).status).toBe(400);
    expect((await post(addPOST, { opportunityId: "../etc" })).status).toBe(400);
    expect((await post(addPOST, { opportunityId: QUAYLINE, approved: "yes" })).status).toBe(400);
    const missing = await post(addPOST, { opportunityId: "opp-nope", demo: true });
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/labs/pathway/undo", () => {
  it("restores the previous plan and forgets the goal note; a second undo is a 404", async () => {
    const store = testStore();
    await post(addPOST, { opportunityId: QUAYLINE, approved: true, rememberGoal: true, demo: true });
    const res = await (await post(undoPOST, { demo: true })).json();
    expect(res.data).toMatchObject({ status: "undone", version: 3 });
    const rm = await store.get<Roadmap>("roadmaps", "aisha");
    expect(rm?.weeks.slice(0, 3).map((w) => w.focusSkillId)).toEqual(["docker", "pytorch", "sql"]);
    expect(await store.list("coach_memory", { userId: "aisha" })).toHaveLength(0);
    expect((await post(undoPOST, { demo: true })).status).toBe(404);
  });

  it("refuses (409) when the roadmap changed after the path was added", async () => {
    const store = testStore();
    await post(addPOST, { opportunityId: QUAYLINE, approved: true, demo: true });
    const rm = (await store.get<Roadmap>("roadmaps", "aisha"))!;
    await store.upsert<Roadmap & { id?: string }>("roadmaps", "aisha", { ...rm, version: rm.version + 1 }, "aisha");
    const res = await post(undoPOST, { demo: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/Re-plan/);
  });
});
