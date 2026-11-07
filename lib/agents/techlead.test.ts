import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const h = vi.hoisted(() => ({
  llmText: vi.fn(),
  request: vi.fn(),
  upsert: vi.fn(),
  profiles: [] as unknown[],
}));

vi.mock("@/lib/llm", () => ({ llmText: h.llmText, llmJSON: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_tl", subscribe: vi.fn() }));
vi.mock("octokit", () => ({ Octokit: class { request = h.request; } }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async () => null,
    list: async () => h.profiles,
    upsert: async (...args: unknown[]) => { h.upsert(...args); return args[2]; },
    remove: async () => {},
  }),
}));

import { MAX_DIFF_CHARS, reviewPullRequest, stripLongCodeBlocks, verifySignature } from "./techlead";

const SECRET = "s3cret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const prEvent = (action: string, extra: Record<string, unknown> = {}) => ({
  action,
  pull_request: { number: 3, title: "Add Dockerfile", body: "", html_url: "https://github.com/keystone-demo/pod-x/pull/3", user: { login: "Priya-Real" }, ...extra },
  repository: { name: "pod-x", full_name: "keystone-demo/pod-x", owner: { login: "keystone-demo" } },
});

/** Returns a code block of n lines. */
const block = (n: number) => ["```python", ...Array.from({ length: n }, (_, i) => `x${i} = ${i}`), "```"].join("\n");

const longestFencedBlock = (s: string) => {
  let max = 0;
  for (const m of s.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) max = Math.max(max, m[1].split("\n").filter(Boolean).length);
  return max;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.profiles = [];
  process.env.GITHUB_TOKEN = "t";
});
afterEach(() => { delete process.env.GITHUB_TOKEN; });

describe("verifySignature", () => {
  const body = JSON.stringify({ action: "opened" });
  it("returns true for a valid signature", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });
  it("returns false for a tampered body or wrong secret", () => {
    expect(verifySignature(body + " ", sign(body), SECRET)).toBe(false);
    expect(verifySignature(body, sign(body, "other"), SECRET)).toBe(false);
  });
  it("returns false for a missing header, missing secret or different length", () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, sign(body), "")).toBe(false);
    expect(verifySignature(body, "sha256=abc", SECRET)).toBe(false);
  });
});

describe("stripLongCodeBlocks", () => {
  it("removes fenced blocks longer than 5 lines and keeps short ones", () => {
    const out = stripLongCodeBlocks(`Q1?\n${block(3)}\nQ2?\n${block(9)}\nQ3?`);
    expect(out).toContain("x2 = 2");
    expect(out).not.toContain("x8 = 8");
    expect(out).toContain("Q3?");
    expect(longestFencedBlock(out)).toBeLessThanOrEqual(5);
  });
  it("removes an unclosed fence", () => {
    expect(stripLongCodeBlocks("Hi\n~~~\na\nb")).not.toContain("\na\n");
  });
});

describe("reviewPullRequest", () => {
  it("returns {reviewed:false} for a non-PR event", async () => {
    expect(await reviewPullRequest({ ref: "refs/heads/main", commits: [] })).toEqual({ reviewed: false });
    expect(await reviewPullRequest(prEvent("labeled"))).toEqual({ reviewed: false });
    expect(h.request).not.toHaveBeenCalled();
  });

  it("posts a Socratic comment with no fenced code block longer than 5 lines", async () => {
    const hugeDiff = "d".repeat(MAX_DIFF_CHARS + 500);
    h.request.mockImplementation(async (route: string) => (route.startsWith("GET") ? { data: hugeDiff } : { data: { id: 1 } }));
    h.llmText.mockResolvedValueOnce(`- What happens if the image is missing?\n${block(12)}\n- Which docs explain layer caching?\n${block(2)}`);
    expect(await reviewPullRequest(prEvent("opened"))).toEqual({ reviewed: true });

    const [getRoute, getParams] = h.request.mock.calls[0];
    expect(getRoute).toBe("GET /repos/{owner}/{repo}/pulls/{pull_number}");
    expect(getParams).toMatchObject({ owner: "keystone-demo", repo: "pod-x", pull_number: 3, mediaType: { format: "diff" } });
    const llmUser = h.llmText.mock.calls[0][0].user as string;
    expect(llmUser).not.toContain("d".repeat(MAX_DIFF_CHARS + 1));
    expect(h.llmText.mock.calls[0][0].system).toContain("Socratic");

    const [postRoute, postParams] = h.request.mock.calls[1];
    expect(postRoute).toBe("POST /repos/{owner}/{repo}/issues/{issue_number}/comments");
    expect(postParams.issue_number).toBe(3);
    expect(postParams.body).toContain("What happens if the image is missing?");
    expect(longestFencedBlock(postParams.body)).toBeLessThanOrEqual(5);
    expect(postParams.body).not.toContain("x11 = 11");
  });

  it("reviews on synchronize too", async () => {
    h.request.mockResolvedValue({ data: "diff --git a b" });
    h.llmText.mockResolvedValueOnce("- Why this name?");
    expect(await reviewPullRequest(prEvent("synchronize"))).toEqual({ reviewed: true });
  });

  it("posts nothing when the LLM fails", async () => {
    h.request.mockResolvedValue({ data: "diff --git a b" });
    h.llmText.mockRejectedValueOnce(new Error("no_key"));
    expect(await reviewPullRequest(prEvent("opened"))).toEqual({ reviewed: false });
    expect(h.request.mock.calls.some((c) => String(c[0]).includes("/comments"))).toBe(false);
  });

  it("records a pr-merged momentum event for the member with that GitHub login", async () => {
    h.profiles = [{ id: "tom", githubLogin: "tom-o" }, { id: "priya", githubLogin: "priya-real" }];
    const out = await reviewPullRequest(prEvent("closed", { merged: true, merged_at: "2026-11-07T15:00:00Z" }));
    expect(out).toEqual({ reviewed: false });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    const [collection, id, doc, userId] = h.upsert.mock.calls[0];
    expect(collection).toBe("momentum_events");
    expect(userId).toBe("priya");
    expect(doc).toEqual({ id, userId: "priya", kind: "pr-merged", ts: "2026-11-07T15:00:00Z", label: "Merged PR in pod-x", url: "https://github.com/keystone-demo/pod-x/pull/3" });
    expect(h.llmText).not.toHaveBeenCalled();
  });

  it("does not record anything for a closed but unmerged PR", async () => {
    h.profiles = [{ id: "priya", githubLogin: "priya-real" }];
    expect(await reviewPullRequest(prEvent("closed", { merged: false }))).toEqual({ reviewed: false });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
