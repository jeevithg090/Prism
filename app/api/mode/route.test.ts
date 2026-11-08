import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replayOrRecord } from "@/lib/replay";
import { GET, POST } from "./route";

const post = (body: unknown, url = "http://localhost/api/mode") =>
  POST(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ks-mode-test-"));
  vi.stubEnv("KEYSTONE_REPLAY_DIR", path.join(root, "bundle"));
  vi.stubEnv("KEYSTONE_REPLAY_TMP", path.join(root, "tmp"));
  vi.stubEnv("KEYSTONE_DEFAULT_MODE", "live");
  vi.stubEnv("DEMO_MODE", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/mode", () => {
  it("POST sets the ks_mode cookie for the whole site for 30 days", async () => {
    const res = await post({ mode: "demo" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("ks_mode=demo");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 30}`);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(await res.json()).toMatchObject({ ok: true, data: { mode: "demo" } });
    expect((await post({ mode: "live" }, "https://keystone.example/api/mode")).headers.get("set-cookie")).toContain("Secure");
  });

  it("POST rejects anything but demo or live", async () => {
    expect((await post({ mode: "mock" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("GET reads the cookie and counts recordings by namespace with their recordedAt range", async () => {
    await replayOrRecord("llm", { user: "a" }, async () => "A");
    await replayOrRecord("tts", { text: "b" }, async () => "B");
    const res = await GET(new Request("http://localhost/api/mode", { headers: { cookie: "ks_uid=aisha; ks_mode=demo" } }));
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, data: { mode: "demo", defaultMode: "live", demoModeEnv: false, total: 2, recordings: { llm: 1, tts: 1 } } });
    expect(j.data.recordedAt.first <= j.data.recordedAt.last).toBe(true);
    const fallback = await (await GET(new Request("http://localhost/api/mode"))).json();
    expect(fallback.data.mode).toBe("live");
  });

  it("POST {reset: true} clears the in-memory demo store outside production", async () => {
    const { getStore } = await import("@/lib/store");
    await getStore().upsert("evidence", "ev_tmp", { id: "ev_tmp" }, "aisha");
    const res = await post({ mode: "demo", reset: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { mode: "demo", reset: true } });
    expect(await getStore().get("evidence", "ev_tmp")).toBeNull();
  });
});
