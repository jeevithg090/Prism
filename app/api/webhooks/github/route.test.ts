import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const h = vi.hoisted(() => ({ reviewPullRequest: vi.fn(async () => ({ reviewed: true })) }));

vi.mock("@/lib/agents/techlead", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agents/techlead")>();
  return { ...real, reviewPullRequest: h.reviewPullRequest };
});
vi.mock("@/lib/llm", () => ({ llmText: vi.fn(), llmJSON: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_x", subscribe: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ get: async () => null, list: async () => [], upsert: async () => ({}), remove: async () => {} }) }));
vi.mock("octokit", () => ({ Octokit: class { request = vi.fn(); } }));

import { POST } from "./route";

const SECRET = "hook-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const body = JSON.stringify({ action: "opened", pull_request: { number: 1 }, repository: { name: "r", owner: { login: "o" } } });

const call = (opts: { event?: string; signature?: string | null; raw?: string }) => {
  const raw = opts.raw ?? body;
  const headers: Record<string, string> = { "content-type": "application/json", "x-github-event": opts.event ?? "pull_request" };
  const sig = opts.signature === undefined ? sign(raw) : opts.signature;
  if (sig) headers["x-hub-signature-256"] = sig;
  return POST(new Request("http://localhost/api/webhooks/github", { method: "POST", headers, body: raw }));
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
});
afterEach(() => { delete process.env.GITHUB_WEBHOOK_SECRET; });

describe("POST /api/webhooks/github", () => {
  it("returns 401 for a bad signature", async () => {
    const res = await call({ signature: sign(body, "wrong") });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(h.reviewPullRequest).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature header is missing", async () => {
    expect((await call({ signature: null })).status).toBe(401);
  });

  it("returns {reviewed:false} for a non-PR event without reviewing", async () => {
    const res = await call({ event: "push" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { reviewed: false } });
    expect(h.reviewPullRequest).not.toHaveBeenCalled();
  });

  it("passes a verified pull_request event to the tech lead", async () => {
    const res = await call({});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { reviewed: true } });
    expect(h.reviewPullRequest).toHaveBeenCalledWith(JSON.parse(body));
  });
});
