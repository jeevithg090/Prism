import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { POST } from "./route";

const BASE = "https://n8n.example.test/webhook";

// What the browser sends for a same-origin fetch from the signed-in user's page.
const BROWSER = { cookie: "theme=dark; ks_uid=aisha", origin: "http://localhost", "sec-fetch-site": "same-origin" };
const SERVER = { "x-keystone-secret": "s3cret" };

function call(workflow: string, body?: string, headers: Record<string, string> = BROWSER) {
  const req = new Request(`http://localhost/api/n8n/trigger/${workflow}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
  return POST(req, { params: Promise.resolve({ workflow }) });
}

const kickoff = (payload: Record<string, unknown> = { podId: "pod_1" }) => JSON.stringify({ payload });

describe("POST /api/n8n/trigger/[workflow]", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", BASE);
    vi.stubEnv("KEYSTONE_SHARED_SECRET", "s3cret");
    vi.stubEnv("DEMO_MODE", "false");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 400 for an unknown workflow without calling n8n", async () => {
    const res = await call("delete-everything", JSON.stringify({ payload: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("caller check", () => {
    it("returns 401 with neither the secret nor a same-origin ks_uid request", async () => {
      const res = await call("pod-kickoff", kickoff(), {});
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, error: { code: "unauthorized" } });
      expect((await call("pod-kickoff", kickoff(), { "x-keystone-secret": "wrong" })).status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns 401 for a cookie without same-origin evidence, or from another site", async () => {
      // curl-style: cookie but no Origin / Sec-Fetch-Site.
      expect((await call("pod-kickoff", kickoff(), { cookie: "ks_uid=aisha" })).status).toBe(401);
      expect((await call("pod-kickoff", kickoff(), { cookie: "ks_uid=aisha", origin: "https://evil.example" })).status).toBe(401);
      expect((await call("pod-kickoff", kickoff(), { cookie: "ks_uid=aisha", "sec-fetch-site": "cross-site" })).status).toBe(401);
      expect((await call("pod-kickoff", kickoff(), { cookie: "ks_uid=aisha", origin: "null" })).status).toBe(401);
      // Same origin but no cookie.
      expect((await call("pod-kickoff", kickoff(), { origin: "http://localhost", "sec-fetch-site": "same-origin" })).status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("accepts a same-origin browser request by Origin alone or by Sec-Fetch-Site alone", async () => {
      fetchSpy.mockImplementation(async () => new Response(null, { status: 200 }));
      expect((await call("pod-kickoff", kickoff(), { cookie: "ks_uid=aisha", origin: "http://localhost" })).status).toBe(200);
      expect((await call("pod-kickoff", kickoff(), { cookie: "ks_uid=aisha", "sec-fetch-site": "same-origin" })).status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("returns 403 when the browser asks for a server-only workflow", async () => {
      for (const wf of ["market-refresh", "newcomer-welcome", "monday-briefing", "pod-nudge", "opportunity-watcher"]) {
        const res = await call(wf, JSON.stringify({ payload: { anything: "goes" } }));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ ok: false, error: { code: "forbidden" } });
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("lets a caller with the shared secret start any workflow with any object payload", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
      const res = await call("market-refresh", JSON.stringify({ payload: { anything: "goes" } }), SERVER);
      expect(res.status).toBe(200);
      expect((await res.json()).data.triggered).toBe(true);
      expect(fetchSpy.mock.calls[0][0]).toBe(`${BASE}/market-refresh`);
      expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toEqual({ anything: "goes" });
    });
  });

  describe("body and payload", () => {
    it("returns 400 when the body is not JSON or the payload is not an object", async () => {
      expect((await call("pod-kickoff", "{not json")).status).toBe(400);
      expect((await call("pod-kickoff", JSON.stringify({ payload: "nope" }))).status).toBe(400);
      expect((await call("pod-kickoff", "[1,2]", SERVER)).status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when a non-empty body has no `payload` wrapper instead of sending {} to n8n", async () => {
      const res = await call("pod-kickoff", JSON.stringify({ podId: "pod_1", members: ["aisha"] }), SERVER);
      expect(res.status).toBe(400);
      expect((await call("pod-kickoff", JSON.stringify({ payload: { podId: "pod_1" }, extra: 1 }), SERVER)).status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("validates the pod-kickoff payload for browser callers", async () => {
      expect((await call("pod-kickoff", kickoff({}))).status).toBe(400); // no podId
      expect((await call("pod-kickoff", kickoff({ podId: "../x" }))).status).toBe(400);
      expect((await call("pod-kickoff", kickoff({ podId: "pod_1", pitch: "x".repeat(1001) }))).status).toBe(400);
      expect((await call("pod-kickoff", kickoff({ podId: "pod_1", repoUrl: "javascript:alert(1)" }))).status).toBe(400);
      expect((await call("pod-kickoff", kickoff({ podId: "pod_1", members: Array(9).fill("a") }))).status).toBe(400);
      const res = await call("pod-kickoff", kickoff({ podId: "pod_1", webhookOverride: "https://evil.example" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain("webhookOverride");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("forwards a valid payload to n8n and returns { triggered, response }", async () => {
      fetchSpy.mockResolvedValue(Response.json({ discordChannelUrl: "https://discord.com/channels/1/2" }));
      const payload = {
        podId: "pod_1",
        podName: "Pod Lovelace",
        repoUrl: "https://github.com/keystone-pods/pod-1",
        members: ["Aisha", "Zara"],
        title: "Study buddy bot",
        pitch: "A bot that pairs you with a study buddy.",
        runId: "run_abc",
      };
      const res = await call("pod-kickoff", kickoff(payload));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: { triggered: true, response: { discordChannelUrl: "https://discord.com/channels/1/2" } },
      });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/pod-kickoff`);
      expect(JSON.parse(String(init.body))).toEqual(payload);
    });

    it("accepts an empty body from a server caller (payload defaults to {})", async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
      const res = await call("monday-briefing", undefined, SERVER);
      expect(res.status).toBe(200);
      expect((await res.json()).data.triggered).toBe(true);
      expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toEqual({});
    });
  });

  describe("response scrubbing", () => {
    it("returns only the allowlisted fields", async () => {
      fetchSpy.mockResolvedValue(
        Response.json({ discordChannelUrl: "https://discord.com/channels/1/2", message: "Pod channel ready", botToken: "xyz", apiKey: "k", data: [{ id: 1 }] }),
      );
      const res = await call("pod-kickoff", kickoff());
      const text = await res.text();
      expect(text).not.toContain("xyz");
      expect(JSON.parse(text).data.response).toEqual({ discordChannelUrl: "https://discord.com/channels/1/2", message: "Pod channel ready" });
    });

    it("drops the whole response when the workflow echoes the shared secret in a nested header", async () => {
      fetchSpy.mockResolvedValue(
        Response.json({
          headers: { "x-keystone-secret": "s3cret", host: "n8n.example.test" },
          body: { podId: "pod_1" },
          discordChannelUrl: "https://discord.com/channels/1/2",
        }),
      );
      const res = await call("pod-kickoff", kickoff());
      const text = await res.text();
      expect(text).not.toContain("s3cret");
      expect(JSON.parse(text)).toEqual({ ok: true, data: { triggered: true } });
    });

    it("drops the response when the secret sits inside a value or an array", async () => {
      fetchSpy.mockResolvedValue(Response.json({ message: "auth s3cret ok", data: [{ apiKey: "k" }] }));
      let text = await (await call("pod-kickoff", kickoff())).text();
      expect(text).not.toContain("s3cret");
      expect(JSON.parse(text).data).toEqual({ triggered: true });

      fetchSpy.mockResolvedValue(Response.json({ items: [{ note: "key=s3cret" }], message: "fine" }));
      text = await (await call("pod-kickoff", kickoff())).text();
      expect(text).not.toContain("s3cret");
      expect(JSON.parse(text).data).toEqual({ triggered: true });
    });

    it("ignores a non-https channel url or non-string fields", async () => {
      fetchSpy.mockResolvedValue(Response.json({ discordChannelUrl: "javascript:alert(1)", message: { nested: true } }));
      const res = await call("pod-kickoff", kickoff());
      expect((await res.json()).data).toEqual({ triggered: true });
    });
  });

  it("returns 200 { triggered: false } when n8n is down", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    const res = await call("pod-kickoff", kickoff());
    expect(res.status).toBe(200);
    expect((await res.json()).data.triggered).toBe(false);
  });
});
