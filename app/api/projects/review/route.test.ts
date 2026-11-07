import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRReviewZ } from "@/lib/schemas/studio";

const h = vi.hoisted(() => ({ llmText: vi.fn(), request: vi.fn(), emit: vi.fn() }));

vi.mock("@/lib/llm", () => ({ llmText: h.llmText, llmJSON: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: h.emit, newRunId: () => "run_review", subscribe: vi.fn() }));
vi.mock("octokit", () => ({ Octokit: class { request = h.request; } }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ get: async () => null, list: async () => [], upsert: async (_c: string, _i: string, d: unknown) => d, remove: async () => {} }) }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/projects/review", {
    method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));

const longestFencedBlock = (s: string) => {
  let max = 0;
  for (const m of s.matchAll(/(```|~~~)[^\n]*\n([\s\S]*?)\1/g)) max = Math.max(max, m[2].split("\n").filter(Boolean).length);
  return max;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DEMO_MODE = "true";
  process.env.GITHUB_TOKEN = "t";
});
afterEach(() => { delete process.env.DEMO_MODE; delete process.env.GITHUB_TOKEN; });

describe("POST /api/projects/review", () => {
  it("DEMO_MODE: reviews the sample Dockerfile PR with 5 Socratic hints and no long code", async () => {
    const res = await post({ podId: "pod_demo01" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(PRReviewZ.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({
      prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/1",
      prTitle: "Add a Dockerfile for the captioning API", posted: false, source: "demo", runId: "run_review",
    });
    expect(data.hints).toHaveLength(5);
    expect(data.hints.every((x: string) => x.includes("?") && x.includes("https://docs.docker.com/"))).toBe(true);
    expect(longestFencedBlock(data.comment)).toBeLessThanOrEqual(5);
    expect(data.comment).not.toMatch(/FROM python:3\.12-slim|USER \w+\n/); // never hands over the fixed Dockerfile
    expect(h.request).not.toHaveBeenCalled();
    expect(h.llmText).not.toHaveBeenCalled();
    const msgs = h.emit.mock.calls.map((c) => [c[0].agent, c[0].message]);
    expect(msgs).toEqual([
      ["techlead", "reading PR #1 diff (24 lines)"],
      ["techlead", "posted 5 Socratic hints: no solutions given"],
      ["orchestrator", "Tech Lead review ready for PR #1"],
    ]);
  });

  it("returns 404 for an unknown pod and 400 for a bad body", async () => {
    const res = await post({ podId: "pod_nope" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect((await post({})).status).toBe(400);
    expect((await post({ podId: "pod_demo01", prNumber: 0 })).status).toBe(400);
    expect((await post("nope")).status).toBe(400);
  });
});
