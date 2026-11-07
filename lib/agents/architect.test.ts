import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import type { Pod, Profile, ProjectBrief } from "@/lib/types";
import { ProjectBriefZ } from "@/lib/schemas/community";

const h = vi.hoisted(() => ({
  llmJSON: vi.fn(),
  request: vi.fn(),
  triggerWorkflow: vi.fn(async () => true),
  emit: vi.fn(),
  profiles: new Map<string, unknown>(),
  octokitCtor: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({ llmJSON: h.llmJSON, llmText: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/n8n", () => ({ triggerWorkflow: h.triggerWorkflow }));
vi.mock("@/lib/agents/events", () => ({ emit: h.emit, newRunId: () => "run_test", subscribe: vi.fn() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (_c: string, id: string) => h.profiles.get(id) ?? null,
    list: async () => [],
    upsert: async (_c: string, _id: string, doc: unknown) => doc,
    remove: async () => {},
  }),
}));
vi.mock("octokit", () => ({
  Octokit: class {
    request = h.request;
    constructor(opts: unknown) { h.octokitCtor(opts); }
  },
}));

import { createRepoAndIssues, designProject, repairBrief, DEMO_REPO_URL } from "./architect";

const pod: Pod = {
  id: "pod_t1", name: "Pod Aurora", score: 0.8, createdAt: "2026-11-07T12:00:00Z", explanations: [],
  members: [
    { userId: "aisha", learns: ["docker", "pytorch"], teaches: ["python", "git"], role: "ML" },
    { userId: "priya", learns: ["sql", "aws"], teaches: ["python", "pytorch", "docker"], role: "Model lead" },
    { userId: "tom", learns: ["pytorch", "react"], teaches: ["sql", "postgresql", "aws"], role: "Data" },
    { userId: "mei", learns: ["python", "machine-learning"], teaches: ["react", "typescript", "ci-cd"], role: "Front end" },
  ],
};

const profile = (id: string, name: string, extra: Partial<Profile> = {}) =>
  ({ id, name, interests: ["computer vision"], isDemo: true, ...extra }) as Profile;

function issue(assigneeUserId: string, reviewerUserId: string, skillId: string, milestone = "Week 1: Foundations") {
  return { title: `Work on ${skillId}`, body: "- [ ] done", assigneeUserId, reviewerUserId, skillId, milestone };
}

const MILESTONES = ["Week 1: Foundations", "Week 2: Build", "Week 3: Ship & demo"];

/** A brief with no issue for Mei. */
const llmDraft = () => ({
  title: "VisionAid",
  pitch: "Accessible image captions.",
  milestones: MILESTONES,
  issues: [
    issue("aisha", "priya", "docker"),
    issue("priya", "tom", "sql", "Week 2: Build"),
    issue("tom", "priya", "pytorch", "Week 2: Build"),
  ],
});

function brief(n = 3): ProjectBrief {
  return {
    title: "VisionAid: accessible image captioning API",
    pitch: "Captions for everyone.",
    milestones: MILESTONES,
    issues: Array.from({ length: n }, (_, i) =>
      issue(pod.members[i % 4].userId, pod.members[(i + 1) % 4].userId, ["docker", "sql", "pytorch", "python"][i % 4], MILESTONES[i % 3])),
  };
}

const err = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

function liveRequestMock(opts: { labelStatus?: number; failIssues?: boolean } = {}) {
  let issueN = 0;
  let msN = 0;
  h.request.mockImplementation(async (route: string, params: Record<string, unknown>) => {
    if (route === "POST /orgs/{org}/repos") return { data: { name: params.name, html_url: `https://github.com/keystone-demo/${params.name}`, owner: { login: "keystone-demo" } } };
    if (route.startsWith("GET /repos/{owner}/{repo}/contents")) return { data: { sha: "abc123" } };
    if (route.startsWith("PUT /repos/{owner}/{repo}/contents")) return { data: {} };
    if (route === "POST /repos/{owner}/{repo}/labels") {
      if (opts.labelStatus) throw err(opts.labelStatus);
      return { data: {} };
    }
    if (route === "POST /repos/{owner}/{repo}/milestones") return { data: { number: ++msN } };
    if (route === "POST /repos/{owner}/{repo}/issues") {
      if (opts.failIssues) throw err(500);
      issueN++;
      return { data: { html_url: `https://github.com/keystone-demo/x/issues/${issueN}` } };
    }
    throw new Error(`unexpected route ${route}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.profiles.clear();
  h.profiles.set("aisha", profile("aisha", "Aisha Rahman"));
  h.profiles.set("priya", profile("priya", "Priya Shah"));
  h.profiles.set("tom", profile("tom", "Tom Okafor"));
  h.profiles.set("mei", profile("mei", "Mei Lin"));
  delete process.env.DEMO_MODE;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_ORG;
});

afterEach(() => {
  delete process.env.DEMO_MODE;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_ORG;
});

describe("designProject", () => {
  it("adds a template issue for a member whose learns are not covered (Mei)", async () => {
    h.llmJSON.mockResolvedValueOnce(llmDraft());
    const out = await designProject(pod, "run_x");
    const mei = out.issues.filter((i) => i.assigneeUserId === "mei");
    expect(mei).toHaveLength(1);
    expect(mei[0].title).toBe("Add Python to the project");
    expect(mei[0].skillId).toBe("python");
    expect(mei[0].body).toContain("- [ ]");
    // reviewer teaches python and isn't Mei
    expect(["aisha", "priya"]).toContain(mei[0].reviewerUserId);
    for (const m of pod.members) {
      expect(out.issues.some((i) => i.assigneeUserId === m.userId && m.learns.includes(i.skillId))).toBe(true);
    }
    expect(ProjectBriefZ.safeParse(out).success).toBe(true);
  });

  it("passes the member names, learns and interests to the LLM", async () => {
    h.llmJSON.mockResolvedValueOnce(llmDraft());
    await designProject(pod);
    const call = h.llmJSON.mock.calls[0][0];
    expect(call.agent).toBe("architect");
    expect(call.system).toContain("3-week student team project");
    expect(call.user).toContain("MEMBERS:");
    expect(call.user).toContain("Mei Lin");
    expect(call.user).toContain("learns python, machine-learning");
    expect(call.user).toContain("computer vision");
  });

  it("reassigns a reviewer equal to the assignee to a member who teaches the skill", async () => {
    const d = llmDraft();
    d.issues[0] = issue("aisha", "aisha", "pytorch");
    h.llmJSON.mockResolvedValueOnce(d);
    const out = await designProject(pod);
    const fixed = out.issues.find((i) => i.assigneeUserId === "aisha" && i.skillId === "pytorch")!;
    expect(fixed.reviewerUserId).toBe("priya");
  });

  it("falls back to the other member who teaches most when nobody teaches the skill", () => {
    const out = repairBrief({ title: "T", pitch: "P", milestones: MILESTONES, issues: [issue("aisha", "aisha", "kubernetes")] }, pod.members);
    // priya, tom and mei all teach 3; the first (priya) wins
    expect(out.issues[0].reviewerUserId).toBe("priya");
  });

  it("fixes unknown milestones, pads to exactly 3 milestones and caps at 8 issues", () => {
    const many = Array.from({ length: 12 }, () => issue("tom", "priya", "pytorch", "Sprint 9"));
    const out = repairBrief({ title: "T", pitch: "P", milestones: ["Kick-off"], issues: many }, pod.members);
    expect(out.milestones).toEqual(["Kick-off", "Week 1: Foundations", "Week 2: Build"]);
    expect(out.issues).toHaveLength(8);
    for (const i of out.issues) expect(out.milestones).toContain(i.milestone);
    // coverage issues for aisha, priya and mei survive the cap
    for (const m of pod.members) {
      expect(out.issues.some((i) => i.assigneeUserId === m.userId && m.learns.includes(i.skillId))).toBe(true);
    }
  });

  it("reuses the seeded VisionAid brief (minus URLs) when the LLM fails for the seeded members", async () => {
    h.llmJSON.mockRejectedValueOnce(new Error("no_key"));
    const fixture = {
      ...pod, id: "pod_demo01",
      project: { ...brief(7), repoUrl: DEMO_REPO_URL, issues: brief(7).issues.map((i, n) => ({ ...i, githubIssueUrl: `${DEMO_REPO_URL}/issues/${n + 1}` })) },
    };
    const spy = vi.spyOn(fs, "readFileSync").mockReturnValueOnce(JSON.stringify(fixture));
    const out = await designProject(pod);
    spy.mockRestore();
    expect(out.title).toBe("VisionAid: accessible image captioning API");
    expect(out.repoUrl).toBeUndefined();
    expect(out.issues).toHaveLength(7);
    expect(out.issues.every((i) => i.githubIssueUrl === undefined)).toBe(true);
  });

  it("builds a valid template brief when the LLM fails", async () => {
    h.llmJSON.mockRejectedValueOnce(new Error("no_key"));
    const other: Pod = { ...pod, id: "pod_t2", name: "Pod Nova", members: pod.members.slice(1) };
    const out = await designProject(other);
    expect(out.title).toMatch(/^Pod Nova Lab: /);
    expect(out.milestones).toEqual(MILESTONES);
    expect(out.issues.length).toBeGreaterThanOrEqual(6);
    expect(out.issues.length).toBeLessThanOrEqual(8);
    for (const i of out.issues) expect(i.reviewerUserId).not.toBe(i.assigneeUserId);
    expect(ProjectBriefZ.safeParse(out).success).toBe(true);
  });
});

describe("createRepoAndIssues", () => {
  it("in DEMO_MODE makes no octokit calls and returns the demo repo + issue URLs", async () => {
    process.env.DEMO_MODE = "true";
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_ORG = "keystone-demo";
    const out = await createRepoAndIssues(pod, brief(7));
    expect(h.request).not.toHaveBeenCalled();
    expect(h.octokitCtor).not.toHaveBeenCalled();
    expect(out.repoUrl).toBe(DEMO_REPO_URL);
    expect(out.issues.map((i) => i.githubIssueUrl)).toEqual(
      Array.from({ length: 7 }, (_, i) => `https://github.com/keystone-demo/pod-vision-demo/issues/${i + 1}`),
    );
  });

  it("live: calls repos.create → contents → labels → milestones → issues ×N", async () => {
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_ORG = "keystone-demo";
    liveRequestMock();
    const b = brief(7);
    const out = await createRepoAndIssues(pod, b, "run_live");
    const routes = h.request.mock.calls.map((c) => c[0] as string);
    const skills = new Set(b.issues.map((i) => i.skillId)).size;
    expect(routes).toEqual([
      "POST /orgs/{org}/repos",
      "GET /repos/{owner}/{repo}/contents/{path}",
      "PUT /repos/{owner}/{repo}/contents/{path}",
      ...Array(skills).fill("POST /repos/{owner}/{repo}/labels"),
      ...Array(3).fill("POST /repos/{owner}/{repo}/milestones"),
      ...Array(7).fill("POST /repos/{owner}/{repo}/issues"),
    ]);
    const createParams = h.request.mock.calls[0][1];
    expect(createParams.name).toMatch(/^pod-[a-z0-9-]+-[a-z0-9]{4}$/);
    expect(createParams.auto_init).toBe(true);
    expect(createParams.private).toBe(false);
    const put = h.request.mock.calls[2][1];
    expect(put.sha).toBe("abc123");
    const readme = Buffer.from(put.content, "base64").toString("utf8");
    expect(readme).toContain("Made with Keystone");
    expect(readme).toContain("Mei Lin");
    const issueCalls = h.request.mock.calls.filter((c) => c[0] === "POST /repos/{owner}/{repo}/issues");
    for (const [, p] of issueCalls) {
      expect(p.body).toContain("Reviewer:");
      expect(p.labels).toHaveLength(1);
      expect(typeof p.milestone).toBe("number");
      expect(p.assignees).toBeUndefined(); // demo students have no real logins
    }
    expect(out.repoUrl).toBe(`https://github.com/keystone-demo/${createParams.name}`);
    expect(out.issues.every((i) => i.githubIssueUrl?.startsWith("https://github.com/keystone-demo/x/issues/"))).toBe(true);
    const messages = h.emit.mock.calls.map((c) => c[0].message as string);
    expect(messages.some((m) => /^created repo pod-/.test(m))).toBe(true);
    expect(messages).toContain("opened 7 issues across 3 milestones");
    expect(h.emit.mock.calls.every((c) => c[0].agent === "architect" && c[0].runId === "run_live")).toBe(true);
  });

  it("does not fail the run when a label already exists (422)", async () => {
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_ORG = "keystone-demo";
    liveRequestMock({ labelStatus: 422 });
    const out = await createRepoAndIssues(pod, brief(4));
    expect(out.repoUrl).not.toBe(DEMO_REPO_URL);
    expect(out.issues).toHaveLength(4);
    expect(h.emit.mock.calls.some((c) => c[0].status === "error")).toBe(false);
  });

  it("falls back to the demo repo and emits an error event when issue creation fails", async () => {
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_ORG = "keystone-demo";
    liveRequestMock({ failIssues: true });
    const out = await createRepoAndIssues(pod, brief(5));
    expect(out.repoUrl).toBe(DEMO_REPO_URL);
    expect(out.issues[4].githubIssueUrl).toBe(`${DEMO_REPO_URL}/issues/5`);
    expect(h.emit).toHaveBeenCalledWith(expect.objectContaining({ agent: "architect", status: "error", message: "GitHub failed: using demo repo" }));
  });

  it("calls triggerWorkflow once with the repoUrl", async () => {
    process.env.DEMO_MODE = "true";
    await createRepoAndIssues(pod, brief(3));
    expect(h.triggerWorkflow).toHaveBeenCalledTimes(1);
    expect(h.triggerWorkflow).toHaveBeenCalledWith("pod-kickoff", expect.objectContaining({
      podId: "pod_t1", podName: "Pod Aurora", repoUrl: DEMO_REPO_URL,
      members: ["Aisha Rahman", "Priya Shah", "Tom Okafor", "Mei Lin"],
      title: "VisionAid: accessible image captioning API", pitch: "Captions for everyone.",
    }));
  });

  it("assigns members with a real GitHub login", async () => {
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_ORG = "keystone-demo";
    h.profiles.set("aisha", profile("aisha", "Aisha Rahman", { githubLogin: "aisha-real", isDemo: false }));
    liveRequestMock();
    await createRepoAndIssues(pod, brief(4));
    const aishaIssue = h.request.mock.calls.find((c) => c[0] === "POST /repos/{owner}/{repo}/issues" && c[1].assignees);
    expect(aishaIssue?.[1].assignees).toEqual(["aisha-real"]);
  });
});
