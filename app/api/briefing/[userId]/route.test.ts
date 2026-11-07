import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BriefingZ } from "@/lib/schemas/voice";
import { getStore } from "@/lib/store";
import { GET } from "./route";

vi.mock("@/lib/llm", () => ({
  llmText: vi.fn().mockRejectedValue(new Error("no_key")),
  llmJSON: vi.fn(),
  LLMError: class LLMError extends Error {},
}));

const URL_BASE = "http://localhost:3000/api/briefing";
let emptyDir: string;

const call = (userId: string, headers: Record<string, string> = {}) =>
  GET(new Request(`${URL_BASE}/${userId}`, { headers }), { params: Promise.resolve({ userId }) });

beforeAll(() => {
  emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ks-briefing-route-"));
});
afterAll(() => fs.rmSync(emptyDir, { recursive: true, force: true }));

beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue(emptyDir); // no teammate fixtures → built-in Aisha default
  process.env.KEYSTONE_SHARED_SECRET = "s3cret";
  delete process.env.DEMO_MODE;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.KEYSTONE_SHARED_SECRET;
});

describe("GET /api/briefing/[userId]", () => {
  it("returns 401 without the secret or a ks_uid cookie", async () => {
    const r = await call("aisha");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });

  it("returns 401 with a wrong secret", async () => {
    expect((await call("aisha", { "x-keystone-secret": "nope" })).status).toBe(401);
  });

  it("returns 200 and a valid Briefing with the secret", async () => {
    const r = await call("aisha", { "x-keystone-secret": "s3cret" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    const b = BriefingZ.parse(body.data);
    expect(b.userId).toBe("aisha");
    expect(b.script).toMatch(/^Morning Aisha!/);
    expect(b.topTasks).toHaveLength(3);
  });

  it("allows a same-origin request carrying the user's own ks_uid cookie", async () => {
    const r = await call("aisha", { cookie: "theme=dark; ks_uid=aisha", origin: "http://localhost:3000" });
    expect(r.status).toBe(200);
    const r2 = await call("aisha", { cookie: "ks_uid=aisha", "sec-fetch-site": "same-origin" });
    expect(r2.status).toBe(200);
  });

  it("lets our own pages load the demo persona's briefing before a session cookie exists, but no one else's", async () => {
    expect((await call("aisha", { "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect((await call("tom", { "sec-fetch-site": "same-origin" })).status).toBe(401);
    expect((await call("aisha", { "sec-fetch-site": "cross-site" })).status).toBe(401);
    expect((await call("aisha")).status).toBe(401);
  });

  it("rejects another user's cookie or a cross-site origin", async () => {
    expect((await call("aisha", { cookie: "ks_uid=bob" })).status).toBe(401);
    expect((await call("aisha", { cookie: "ks_uid=aisha", origin: "https://evil.example" })).status).toBe(401);
    expect((await call("aisha", { cookie: "ks_uid=aisha", "sec-fetch-site": "cross-site" })).status).toBe(401);
  });

  it("only rebuilds on ?refresh=1 for n8n (the secret), not for a cookie user", async () => {
    const get = (headers: Record<string, string>) =>
      GET(new Request(`${URL_BASE}/aisha?refresh=1`, { headers }), { params: Promise.resolve({ userId: "aisha" }) });
    await call("aisha", { "x-keystone-secret": "s3cret" }); // make sure this week's briefing is stored
    const upsert = vi.spyOn(getStore(), "upsert");
    const builds = () => upsert.mock.calls.filter((c) => c[0] === "briefings").length;
    expect((await get({ cookie: "ks_uid=aisha", origin: "http://localhost:3000" })).status).toBe(200);
    expect(builds()).toBe(0);
    expect((await get({ "x-keystone-secret": "s3cret" })).status).toBe(200);
    expect(builds()).toBe(1);
  });

  it("returns the fixture in DEMO_MODE", async () => {
    process.env.DEMO_MODE = "true";
    const body = await (await call("aisha", { "x-keystone-secret": "s3cret" })).json();
    expect(body.data.weekOf).toBe("2026-11-09");
    expect(body.data.marketMoves).toEqual(["LLM evaluation up 38% a year", "PyTorch steady at 52% of ads"]);
  });

  it("returns 404 not_found for a user with no roadmap yet", async () => {
    const r = await call("newbie", { "x-keystone-secret": "s3cret" });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("returns 400 for an invalid user id", async () => {
    expect((await call("../etc", { "x-keystone-secret": "s3cret" })).status).toBe(400);
  });
});
