import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/events", () => ({ emit, newRunId: () => "run_t", subscribe: vi.fn() }));

import { isWorkflowName, triggerWorkflow, verifySecret } from "./n8n";

const env = { ...process.env };
beforeEach(() => {
  vi.restoreAllMocks();
  emit.mockClear();
  process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test/webhook/";
  process.env.KEYSTONE_SHARED_SECRET = "s3cret";
});
afterEach(() => { process.env = { ...env }; });

describe("triggerWorkflow", () => {
  it("posts to ${base}/pod-kickoff with the shared secret and returns true on 200", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(triggerWorkflow("pod-kickoff", { podId: "pod_demo01", runId: "run_1" })).resolves.toBe(true);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://n8n.test/webhook/pod-kickoff");
    expect((init.headers as Record<string, string>)["x-keystone-secret"]).toBe("s3cret");
    expect(JSON.parse(String(init.body))).toMatchObject({ podId: "pod_demo01" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_1", agent: "n8n", status: "done", message: "triggered pod-kickoff" }));
  });
  it("returns false on a non-2xx, a throw or a timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(triggerWorkflow("monday-briefing", {})).resolves.toBe(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(triggerWorkflow("monday-briefing", {})).resolves.toBe(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(triggerWorkflow("monday-briefing", {})).resolves.toBe(false);
  });
  it("returns false without calling fetch when n8n isn't configured", async () => {
    delete process.env.N8N_WEBHOOK_BASE_URL;
    const f = vi.spyOn(globalThis, "fetch");
    await expect(triggerWorkflow("pod-kickoff", { runId: "r" })).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: "progress" }));
  });
  it("knows the six workflow names", () => {
    expect(["market-refresh", "monday-briefing", "pod-kickoff", "pod-nudge", "opportunity-watcher", "newcomer-welcome"].every(isWorkflowName)).toBe(true);
    expect(isWorkflowName("rm-rf")).toBe(false);
  });
});

describe("verifySecret", () => {
  const req = (h?: string) => new Request("http://x", { headers: h ? { "x-keystone-secret": h } : {} });
  it("is true only for the matching header", () => {
    expect(verifySecret(req("s3cret"))).toBe(true);
    expect(verifySecret(req("wrong"))).toBe(false);
    expect(verifySecret(req())).toBe(false);
  });
  it("is false when the env var is unset", () => {
    delete process.env.KEYSTONE_SHARED_SECRET;
    expect(verifySecret(req("s3cret"))).toBe(false);
    expect(verifySecret(req(""))).toBe(false);
  });
});
