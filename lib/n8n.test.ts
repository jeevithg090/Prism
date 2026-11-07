import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));

import { emit } from "@/lib/agents/events";
import { triggerWorkflow, triggerWorkflowDetailed, verifySecret } from "./n8n";

const BASE = "https://n8n.example.test/webhook";

function reqWith(secret?: string) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers["x-keystone-secret"] = secret;
  return new Request("http://localhost/api/n8n/callback", { method: "POST", headers });
}

describe("triggerWorkflow", () => {
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
    vi.mocked(emit).mockClear();
  });

  it("posts the payload to `${base}/pod-kickoff` with the shared-secret header and returns true on 200", async () => {
    fetchSpy.mockResolvedValue(Response.json({ discordChannelUrl: "https://discord.com/channels/1/2" }));

    await expect(triggerWorkflow("pod-kickoff", { podId: "pod_1" })).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/pod-kickoff`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-keystone-secret"]).toBe("s3cret");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ podId: "pod_1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("tolerates a trailing slash on the base URL", async () => {
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", `${BASE}/`);
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    await triggerWorkflow("monday-briefing", {});
    expect(fetchSpy.mock.calls[0][0]).toBe(`${BASE}/monday-briefing`);
  });

  it("returns false when fetch throws", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    await expect(triggerWorkflow("pod-kickoff", {})).resolves.toBe(false);
  });

  it("aborts a hanging request after 5 s and returns false", async () => {
    vi.useFakeTimers();
    try {
      // Node's AbortSignal.timeout runs on internal timers, so route it through (fake) setTimeout.
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
        const c = new AbortController();
        setTimeout(() => c.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), ms);
        return c.signal;
      });
      // A fetch that never answers on its own; it only settles when its signal aborts, like the real one.
      fetchSpy.mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return; // no signal: hang forever (the test then times out)
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      );

      let settled: boolean | undefined;
      const pending = triggerWorkflow("pod-kickoff", {}).then((v) => (settled = v));

      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(false);
      expect(timeoutSpy).toHaveBeenCalledWith(5000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns false on a non-2xx response", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(triggerWorkflow("pod-kickoff", {})).resolves.toBe(false);
  });

  it("returns the workflow's JSON response and emits a done event when a runId is passed", async () => {
    fetchSpy.mockResolvedValue(Response.json({ discordChannelUrl: "https://discord.com/channels/1/2" }));
    const res = await triggerWorkflowDetailed("pod-kickoff", { runId: "run_abc", podId: "pod_1" });
    expect(res).toEqual({ triggered: true, response: { discordChannelUrl: "https://discord.com/channels/1/2" } });
    expect(emit).toHaveBeenCalledWith({ runId: "run_abc", agent: "n8n", status: "done", message: "triggered pod-kickoff" });
  });

  it("does not emit without a runId", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    await triggerWorkflow("pod-kickoff", {});
    expect(emit).not.toHaveBeenCalled();
  });

  it("returns true without calling n8n in demo mode when no base URL is set", async () => {
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", "");
    vi.stubEnv("DEMO_MODE", "true");
    await expect(triggerWorkflow("pod-kickoff", {})).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false without calling n8n outside demo mode when no base URL is set", async () => {
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", "");
    await expect(triggerWorkflow("pod-kickoff", {})).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("verifySecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true for the correct header", () => {
    vi.stubEnv("KEYSTONE_SHARED_SECRET", "s3cret");
    expect(verifySecret(reqWith("s3cret"))).toBe(true);
  });

  it("is false for a wrong or missing header", () => {
    vi.stubEnv("KEYSTONE_SHARED_SECRET", "s3cret");
    expect(verifySecret(reqWith("wrong"))).toBe(false);
    expect(verifySecret(reqWith(""))).toBe(false);
    expect(verifySecret(reqWith())).toBe(false);
  });

  it("is false when the env var is unset or empty, whatever the header says", () => {
    vi.stubEnv("KEYSTONE_SHARED_SECRET", "");
    expect(verifySecret(reqWith(""))).toBe(false);
    expect(verifySecret(reqWith())).toBe(false);
    vi.stubEnv("KEYSTONE_SHARED_SECRET", undefined as unknown as string);
    expect(verifySecret(reqWith("undefined"))).toBe(false);
    expect(verifySecret(reqWith())).toBe(false);
  });
});
