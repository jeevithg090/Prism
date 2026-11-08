import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => { void fn; } }));
vi.mock("@/lib/agents/orchestrator", async () => {
  class ProfileNotFoundError extends Error {}
  return { ProfileNotFoundError, runOnboarding: h.run };
});

import { POST } from "./route";
import { ProfileNotFoundError } from "@/lib/agents/orchestrator";

const post = (body: unknown) => POST(new Request("http://x/api/onboard/run", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => h.run.mockReset());

describe("POST /api/onboard/run", () => {
  it("returns {runId} straight away and passes the options through", async () => {
    h.run.mockResolvedValue({ runId: "run_abc", mode: "demo" });
    const res = await post({ userId: "aisha", demo: true });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, data: { runId: "run_abc" } });
    expect(h.run).toHaveBeenCalledWith("aisha", expect.objectContaining({ demo: true, schedule: expect.any(Function) }));
  });

  it("rejects bad input with 400", async () => {
    expect((await post("not json")).status).toBe(400);
    const res = await post({ userId: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
    expect((await post({ userId: "aisha", programmeUrl: "not a url" })).status).toBe(400);
    expect(h.run).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user and 500 on other failures", async () => {
    h.run.mockRejectedValueOnce(new ProfileNotFoundError("nobody"));
    const res = await post({ userId: "nobody" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
    h.run.mockRejectedValueOnce(new Error("boom"));
    expect((await post({ userId: "aisha" })).status).toBe(500);
  });
});
