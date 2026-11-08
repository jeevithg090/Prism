import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Pod } from "@/lib/types";
import { ProjectBriefZ } from "@/lib/schemas/community";

const h = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  upsert: vi.fn(),
  triggerWorkflow: vi.fn(async () => true),
  request: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(),
  LLMError: class extends Error {},
}));
vi.mock("@/lib/n8n", () => ({ triggerWorkflow: h.triggerWorkflow }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_route", subscribe: vi.fn() }));
vi.mock("octokit", () => ({ Octokit: class { request = h.request; } }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => h.docs.get(`${c}/${id}`) ?? null,
    list: async () => [],
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.upsert(c, id, doc, userId); h.docs.set(`${c}/${id}`, doc); return doc; },
    remove: async () => {},
  }),
}));

import { POST } from "./route";

const pod: Pod = {
  id: "pod_r1", name: "Pod Nova", score: 0.7, createdAt: "2026-11-07T12:00:00Z", explanations: [],
  members: [
    { userId: "zara", learns: ["docker", "pytorch"], teaches: ["python"], role: "ML" },
    { userId: "ben", learns: ["sql"], teaches: ["docker", "pytorch"], role: "Infra" },
    { userId: "kai", learns: ["python", "react"], teaches: ["sql", "react"], role: "Web" },
  ],
};

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/projects/create", {
    method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  h.docs.clear();
  process.env.DEMO_MODE = "true";
});
afterEach(() => { delete process.env.DEMO_MODE; });

describe("POST /api/projects/create", () => {
  it("returns 404 not_found for a missing pod", async () => {
    const res = await post({ podId: "pod_nope" });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("returns 400 for an invalid body", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });

  it("designs + creates the project for an existing pod, saves it and returns a valid brief", async () => {
    h.docs.set("pods/pod_r1", pod);
    const res = await post({ podId: "pod_r1" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const parsed = ProjectBriefZ.safeParse(json.data);
    expect(parsed.success).toBe(true);
    expect(json.data.repoUrl).toBe("https://github.com/keystone-demo/pod-vision-demo");
    expect(json.data.issues.every((i: { githubIssueUrl?: string }) => i.githubIssueUrl)).toBe(true);
    expect(json.data.runId).toBe("run_route");
    expect(h.request).not.toHaveBeenCalled();
    expect(h.upsert).toHaveBeenCalledWith("pods", "pod_r1", expect.objectContaining({ project: expect.objectContaining({ repoUrl: json.data.repoUrl }) }), "zara");
    expect(h.triggerWorkflow).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when the pod already has a repo", async () => {
    const project = { title: "Existing", pitch: "Already made.", milestones: ["A", "B", "C"], issues: [], repoUrl: "https://github.com/keystone-demo/pod-existing-ab12" };
    h.docs.set("pods/pod_r1", { ...pod, project });
    const res = await post({ podId: "pod_r1" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(project);
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.triggerWorkflow).not.toHaveBeenCalled();
  });
});
