import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const h = vi.hoisted(() => ({
  reviewPullRequest: vi.fn<(e: unknown) => Promise<{ reviewed: boolean }>>(async () => ({ reviewed: true })),
  realReview: null as null | ((e: unknown) => Promise<{ reviewed: boolean }>),
  docs: new Map<string, unknown>(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/agents/techlead", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agents/techlead")>();
  h.realReview = real.reviewPullRequest;
  return { ...real, reviewPullRequest: h.reviewPullRequest };
});
vi.mock("@/lib/graph/build", () => ({ loadGraph: async () => null }));
vi.mock("@/lib/llm", () => ({ llmText: vi.fn(), llmJSON: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_x", subscribe: vi.fn() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`) ?? null),
    list: async (c: string) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => structuredClone(d)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.upsert(c, id, doc, userId); h.docs.set(`${c}/${id}`, structuredClone(doc)); return doc; },
    remove: async () => {},
  }),
}));
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
  h.docs.clear();
  h.docs.set("profiles/aisha", { id: "aisha", name: "Aisha Rahman", badges: ["new-to-uni"], githubLogin: "aisha-gh" });
  h.docs.set("profiles/priya", { id: "priya", name: "Priya Shah", badges: [], githubLogin: "priya-demo" });
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

describe("POST /api/webhooks/github · merged PR → proof", () => {
  const merged = (pr: Record<string, unknown>, repo = "https://github.com/keystone-demo/pod-vision-demo") => JSON.stringify({
    action: "closed",
    pull_request: { number: 8, title: "Add Dockerfile", body: "", html_url: `${repo}/pull/8`, merged: true, merged_at: "2026-11-07T16:00:00Z", user: { login: "aisha-gh" }, ...pr },
    repository: { name: repo.split("/").pop(), full_name: repo.replace("https://github.com/", ""), html_url: repo, owner: { login: repo.split("/")[3] } },
  });
  const momentum = () => h.upsert.mock.calls.filter((c) => c[0] === "momentum_events" && (c[2] as { kind: string }).kind === "pr-merged");

  it("records proof for the pod issue named by 'Closes #1' and writes one pr-merged event", async () => {
    h.reviewPullRequest.mockImplementation(async (e) => h.realReview!(e));
    const res = await call({ raw: merged({ body: "Closes #1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.reviewed).toBe(false);
    expect(json.data.proof).toMatchObject({ podId: "pod_demo01", issueIndex: 0, userId: "aisha", skillId: "docker", reviewerUserId: "priya" });
    expect(h.reviewPullRequest).not.toHaveBeenCalled();
    expect(momentum()).toHaveLength(1);
    expect(h.upsert.mock.calls.filter((c) => c[0] === "evidence")).toHaveLength(2);
    // GitHub redelivers the event: still one proof, no new writes
    const writes = h.upsert.mock.calls.length;
    await call({ raw: merged({ body: "Closes #1" }) });
    expect(h.upsert.mock.calls.length).toBe(writes);
  });

  it("maps by PR author login when the PR names no issue", async () => {
    const json = await (await call({ raw: merged({ user: { login: "Priya-Demo" } }) })).json();
    expect(json.data.proof).toMatchObject({ issueIndex: 1, userId: "priya", skillId: "sql" });
  });

  it("a merged PR outside any pod repo goes to the Tech Lead's login-based momentum (one event, no proof)", async () => {
    h.reviewPullRequest.mockImplementation(async (e) => h.realReview!(e));
    const json = await (await call({ raw: merged({}, "https://github.com/someone/side-project") })).json();
    expect(json.data).toEqual({ reviewed: false });
    expect(h.reviewPullRequest).toHaveBeenCalledTimes(1);
    expect(momentum()).toHaveLength(1);
    expect(momentum()[0][3]).toBe("aisha");
    expect(h.upsert.mock.calls.some((c) => c[0] === "evidence")).toBe(false);
  });
});
