import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pod, ProjectBrief } from "@/lib/types";

const m = vi.hoisted(() => ({
  designProject: vi.fn(), createRepoAndIssues: vi.fn(), readDemoPod: vi.fn(), pods: new Map<string, unknown>(),
}));
vi.mock("@/lib/agents/architect", () => ({
  designProject: m.designProject,
  createRepoAndIssues: m.createRepoAndIssues,
  demoResult: (b: ProjectBrief) => ({ ...b, repoUrl: "https://github.com/keystone-demo/pod-vision-demo" }),
}));
vi.mock("@/lib/agents/matchmaker", () => ({ DEMO_FIXTURE_POD_ID: "pod_demo01", readDemoPod: m.readDemoPod }));
vi.mock("@/lib/agents/events", () => ({ newRunId: () => "run_test" }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (_c: string, id: string) => m.pods.get(id) ?? null,
    upsert: async (_c: string, id: string, doc: unknown) => { m.pods.set(id, doc); return doc; },
  }),
}));

import { startPodProject } from "./projects";

const fixtureBrief: ProjectBrief = {
  title: "VisionAid: accessible image captioning API", pitch: "Fixture pitch.", milestones: ["W1", "W2", "W3"], issues: [],
  repoUrl: "https://github.com/keystone-demo/pod-vision-demo",
};
const demoPod: Pod = {
  id: "pod_demo01", name: "Pod Orbit", score: 0.7, createdAt: "2026-11-07T14:40:00.000Z", explanations: [],
  members: [{ userId: "aisha", learns: ["docker"], teaches: ["python"], role: "Learns Docker · Teaches Python" }],
  project: fixtureBrief,
};
const designed: ProjectBrief = { title: "Caption Studio", pitch: "Designed by the model.", milestones: ["A", "B", "C"], issues: [] };

beforeEach(() => {
  m.pods.clear();
  m.designProject.mockReset().mockResolvedValue(designed);
  m.createRepoAndIssues.mockReset();
  m.readDemoPod.mockReset().mockReturnValue(demoPod);
  delete process.env.DEMO_MODE;
});
afterEach(() => { delete process.env.DEMO_MODE; });

describe("startPodProject", () => {
  it("designs the seeded demo pod's project for real (linked to the demo repo), once", async () => {
    m.pods.set("pod_demo01", demoPod);
    const first = await startPodProject("pod_demo01");
    expect(m.designProject).toHaveBeenCalledTimes(1);
    expect(m.createRepoAndIssues).not.toHaveBeenCalled(); // no new GitHub repo for the shared demo pod
    expect(first).toMatchObject({ created: true, brief: { title: "Caption Studio", repoUrl: "https://github.com/keystone-demo/pod-vision-demo" } });
    const again = await startPodProject("pod_demo01");
    expect(again).toMatchObject({ created: false, brief: { title: "Caption Studio" } });
    expect(m.designProject).toHaveBeenCalledTimes(1);
  });

  it("DEMO_MODE keeps the fixture brief", async () => {
    process.env.DEMO_MODE = "true";
    m.pods.set("pod_demo01", demoPod);
    expect(await startPodProject("pod_demo01")).toMatchObject({ created: false, brief: { title: fixtureBrief.title } });
    expect(m.designProject).not.toHaveBeenCalled();
  });

  it("other pods design and create their repo as before", async () => {
    m.pods.set("pod_abc123", { ...demoPod, id: "pod_abc123", project: undefined });
    m.createRepoAndIssues.mockResolvedValue({ ...designed, repoUrl: "https://github.com/org/pod-caption-studio-x1y2" });
    expect(await startPodProject("pod_abc123")).toMatchObject({ created: true, brief: { repoUrl: "https://github.com/org/pod-caption-studio-x1y2" } });
    expect(m.createRepoAndIssues).toHaveBeenCalledTimes(1);
  });
});
