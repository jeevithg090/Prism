import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  LLMError: class extends Error {},
}));

import { testStore } from "@/tests/seededStore";
import { DecisionResultZ, PulseSnapshotZ, SessionStartZ } from "@/lib/labs/pulse/model";
import { GET } from "./route";
import { POST as startPOST } from "./session/route";
import { POST as decidePOST } from "./decide/route";

const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const get = (qs: string) => GET(new Request(`http://localhost/api/labs/pulse${qs}`));

let prevDemo: string | undefined;
beforeEach(() => {
  prevDemo = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";
  testStore().reset();
});
afterEach(() => {
  if (prevDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = prevDemo;
});

describe("/api/labs/pulse", () => {
  it("runs a whole lab: start, tick, decide, watch the effect", async () => {
    const started = await post(startPOST, "/api/labs/pulse/session", {});
    expect(started.status).toBe(201);
    const start = SessionStartZ.parse((await started.json()).data);
    expect(start.snapshot.cohortSize).toBe(13);

    const tick = await get(`?sessionId=${start.session.id}&minute=5.5`);
    expect(tick.status).toBe(200);
    const snap = PulseSnapshotZ.parse((await tick.json()).data);
    expect(snap.minute).toBe(5.5);
    expect(snap.suggestion?.kind).toBe("explain");

    const decided = await post(decidePOST, "/api/labs/pulse/decide", {
      sessionId: start.session.id, minute: 5.5, criterionId: snap.suggestion!.criterionId, kind: "explain", decision: "run",
    });
    expect(decided.status).toBe(200);
    const d = DecisionResultZ.parse((await decided.json()).data);
    expect(d.explainer?.points.length).toBeGreaterThan(0);

    const after = PulseSnapshotZ.parse((await (await get(`?sessionId=${start.session.id}&minute=11`)).json()).data);
    expect(after.effects[0].metNow).toBeGreaterThan(after.effects[0].metBefore);
  });

  it("validates input with 400 bad_request", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?sessionId=../../etc")).status).toBe(400);
    expect((await get("?sessionId=pulse_x&minute=-3")).status).toBe(400);
    expect((await post(startPOST, "/api/labs/pulse/session", { source: "hacked" })).status).toBe(400);
    expect((await post(decidePOST, "/api/labs/pulse/decide", "not json")).status).toBe(400);
    const bad = await post(decidePOST, "/api/labs/pulse/decide", { sessionId: "pulse_x", minute: 5, criterionId: "deps-layer", kind: "explain", decision: "maybe" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("bad_request");
    const long = await post(decidePOST, "/api/labs/pulse/decide", { sessionId: "pulse_x", minute: 5, criterionId: "deps-layer", kind: "explain", decision: "run", note: "x".repeat(281) });
    expect(long.status).toBe(400);
  });

  it("returns 404 for an unknown session, challenge or criterion", async () => {
    const missing = await get("?sessionId=pulse_nope");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
    expect((await post(startPOST, "/api/labs/pulse/session", { challengeId: "ch_cobol_99" })).status).toBe(404);
    const { data } = await (await post(startPOST, "/api/labs/pulse/session", {})).json();
    const wrong = await post(decidePOST, "/api/labs/pulse/decide", { sessionId: data.session.id, minute: 5, criterionId: "made-up", kind: "explain", decision: "run" });
    expect(wrong.status).toBe(404);
  });

  it("returns 500 internal when the store fails", async () => {
    const { data } = await (await post(startPOST, "/api/labs/pulse/session", {})).json();
    // The cohort read fails mid-board: the route answers with the generic 500 envelope, never the error text.
    const list = vi.spyOn(testStore(), "list").mockRejectedValue(new Error("db down"));
    const res = await get(`?sessionId=${data.session.id}&minute=3`);
    list.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: "internal", message: "Something went wrong on our side." } });
  });
});
