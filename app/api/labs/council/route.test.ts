import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async () => { throw new Error("no_key"); }),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));

import { testStore } from "@/tests/seededStore";
import { GET, POST } from "./route";
import { POST as DECIDE } from "./decide/route";

const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request("http://localhost/api/labs/council", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeAll(() => { process.env.DEMO_MODE = "true"; });
afterAll(() => { delete process.env.DEMO_MODE; });
beforeEach(() => testStore().reset());

describe("GET /api/labs/council", () => {
  it("validates the user id and 404s an unknown student", async () => {
    expect((await GET(new Request("http://localhost/api/labs/council"))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/labs/council?userId=../etc"))).status).toBe(400);
    const res = await GET(new Request("http://localhost/api/labs/council?userId=nobody"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns the motions, real source counts and no session before the first debate", async () => {
    const json = await (await GET(new Request("http://localhost/api/labs/council?userId=aisha"))).json();
    expect(json.ok).toBe(true);
    expect(json.data.options[0]).toMatchObject({ skillId: "docker", week: 1, label: "Week 1: Docker" });
    expect(json.data.sources.ads).toBe(214);
    expect(json.data.current).toBeNull();
  });
});

describe("POST /api/labs/council", () => {
  it("rejects bad bodies", async () => {
    expect((await post(POST, "not json")).status).toBe(400);
    expect((await post(POST, { userId: "aisha", week: 40 })).status).toBe(400);
    expect((await post(POST, { userId: "aisha", skillId: "Not A Skill" })).status).toBe(400);
    expect((await post(POST, { userId: "aisha", skillId: "basket-weaving" })).status).toBe(404);
  });

  it("convenes the council on week 1 by default and the session comes back on GET", async () => {
    const res = await post(POST, { userId: "aisha", runId: "run_routetest" });
    expect(res.status).toBe(200);
    const s = (await res.json()).data;
    expect(s).toMatchObject({ runId: "run_routetest", motion: { label: "Docker in week 1" }, verdict: { decision: "adjust" } });
    expect(s.arguments.map((a: { seat: string }) => a.seat)).toEqual(["market", "degree", "wellbeing"]);
    const ov = (await (await GET(new Request(`http://localhost/api/labs/council?userId=aisha&session=${s.id}`))).json()).data;
    expect(ov.current.id).toBe(s.id);
    expect(ov.sessions[0]).toMatchObject({ id: s.id, choice: null });
  });
});

describe("POST /api/labs/council/decide", () => {
  it("validates, 404s a missing session, records the decision once and 409s a second one", async () => {
    expect((await post(DECIDE, "{")).status).toBe(400);
    expect((await post(DECIDE, { userId: "aisha", sessionId: "council_nope", choice: "maybe" })).status).toBe(400);
    expect((await post(DECIDE, { userId: "aisha", sessionId: "council_missing1", choice: "accept" })).status).toBe(404);
    const s = (await (await post(POST, { userId: "aisha" })).json()).data;
    const res = await post(DECIDE, { userId: "aisha", sessionId: s.id, choice: "accept" });
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.decision).toMatchObject({ choice: "accept", applied: true, roadmapVersion: 2 });
    const again = await post(DECIDE, { userId: "aisha", sessionId: s.id, choice: "overrule" });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("conflict");
  });
});
