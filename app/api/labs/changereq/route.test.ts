// Route tests for /api/labs/changereq: contract envelope, zod 400s, 404/409 mapping and the full DEMO_MODE flow.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(async () => { throw new Error("no_key"); }), llmText: vi.fn(async () => { throw new Error("no_key"); }), LLMError: class extends Error {} }));

import { testStore } from "@/tests/seededStore";
import { GET, POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/labs/changereq", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = (q: string) => GET(new Request(`http://x/api/labs/changereq${q}`));

beforeEach(() => { process.env.DEMO_MODE = "true"; testStore().reset(); });
afterAll(() => { delete process.env.DEMO_MODE; });

describe("GET /api/labs/changereq", () => {
  it("returns the plan and no open request for Aisha", async () => {
    const res = await get("?userId=aisha");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ userId: "aisha", roleId: "ml-engineer", version: 1, open: null });
    expect(body.data.weeks).toHaveLength(12);
  });
  it("400s on a missing or unsafe user id and 404s for a user with no map", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?userId=..%2Fetc")).status).toBe(400);
    const missing = await get("?userId=nobody");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });
});

describe("POST /api/labs/changereq", () => {
  it("400s on a bad body or unknown action", async () => {
    const bad = await POST(new Request("http://x", { method: "POST", body: "{" }));
    expect(bad.status).toBe(400);
    expect((await post({ action: "merge", userId: "aisha" })).status).toBe(400);
    expect((await post({ action: "comment", userId: "aisha", id: "cr_aisha_1", text: "" })).status).toBe(400);
  });
  it("refresh → comment → approve → revert, with 404 and 409 where they belong", async () => {
    const opened = await (await post({ action: "refresh", userId: "aisha", runId: "run_route01" })).json();
    expect(opened.ok).toBe(true);
    expect(opened.data.runId).toBe("run_route01");
    const cr = opened.data.state.open;
    expect(cr).toMatchObject({ number: 1, status: "open" });

    const commented = await (await post({ action: "comment", userId: "aisha", id: cr.id, text: "why?" })).json();
    expect(commented.data.message).toContain("Week 7");

    expect((await post({ action: "approve", userId: "aisha", id: "cr_aisha_99" })).status).toBe(404);
    const merged = await (await post({ action: "approve", userId: "aisha", id: cr.id })).json();
    expect(merged.data).toMatchObject({ version: 2, message: "Roadmap v2 is live." });
    expect(merged.data.state.open).toBeNull();
    expect(merged.data.state.history[0]).toMatchObject({ number: 1, status: "approved", resultVersion: 2 });

    const again = await post({ action: "approve", userId: "aisha", id: cr.id });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("conflict");

    const reverted = await (await post({ action: "revert", userId: "aisha", toVersion: 1 })).json();
    expect(reverted.data.version).toBe(3);
    expect(reverted.data.state.weeks[6].skillId).toBe("ci-cd");
  });
});
