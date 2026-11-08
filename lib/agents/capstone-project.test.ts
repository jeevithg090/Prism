import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeMap, BridgeNode } from "@/lib/types";

const h = vi.hoisted(() => ({
  loadGraph: vi.fn(),
  store: {
    get: vi.fn(),
    list: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
  },
  emit: vi.fn(),
}));

vi.mock("@/lib/graph/build", () => ({ loadGraph: h.loadGraph }));
vi.mock("@/lib/store", () => ({ getStore: () => h.store }));
vi.mock("@/lib/agents/events", () => ({ emit: h.emit, newRunId: () => "run_capstone_test" }));

import {
  createCapstone,
  listCapstones,
  updateCapstone,
  toggleMilestone,
} from "./capstone-project";
import type { CapstoneProject, Milestone } from "@/lib/schemas/capstone";

const gapNode = (skillId: string, demand: number): BridgeNode => ({
  skillId,
  name: skillId,
  category: "language",
  status: "gap",
  demand,
  level: 0 as const,
  evidenceIds: [],
  moduleCodes: [],
});

const provenNode: BridgeNode = {
  skillId: "git",
  name: "Git",
  category: "practice",
  status: "proven",
  demand: 0.9,
  level: 2 as const,
  evidenceIds: [],
  moduleCodes: [],
};

const map: BridgeMap = {
  userId: "u1",
  roleId: "ml-engineer",
  nodes: [gapNode("python", 0.9), gapNode("docker", 0.8), gapNode("react", 0.7), gapNode("aws", 0.6), gapNode("sql", 0.5), provenNode],
  edges: [],
  readinessNow: 0,
  readinessProjected: 0,
  generatedAt: "2026-11-07T12:00:00Z",
};

const stored: Record<string, unknown> = {};

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(stored).forEach((k) => delete stored[k]);
  h.store.get.mockImplementation(async (_c: string, id: string) => (stored[id] as unknown) ?? null);
  h.store.list.mockImplementation(async (_c: string, f?: { userId?: string }) =>
    Object.values(stored).filter((d) => !f?.userId || (d as { userId?: string }).userId === f.userId),
  );
  h.store.upsert.mockImplementation(async (_c: string, id: string, doc: unknown) => {
    stored[id] = doc;
    return doc;
  });
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("createCapstone", () => {
  it("picks up to 4 gap skills ranked by demand, generates 3 milestones, stores and emits started→progress→done", async () => {
    h.loadGraph.mockResolvedValue(map);
    const project = await createCapstone({ userId: "u1", title: "My CV reviewer", roleId: "ml-engineer" });

    expect(h.loadGraph).toHaveBeenCalledWith("u1", "ml-engineer");
    expect(project.targetSkills).toEqual(["python", "docker", "react", "aws"]);
    expect(project.milestones).toHaveLength(3);
    expect(project.status).toBe("planning");
    expect(project.userId).toBe("u1");
    expect(project.title).toBe("My CV reviewer");
    // Each milestone has one task per target skill.
    for (const m of project.milestones) {
      expect(m.tasks).toHaveLength(4);
      expect(m.done).toBe(false);
      expect(m.id).toBeTruthy();
    }
    // Proven skill "git" is not included.
    expect(project.targetSkills).not.toContain("git");
    expect(h.store.upsert).toHaveBeenCalledWith("capstones", project.id, expect.objectContaining({ id: project.id }), "u1");
    expect(h.emit).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run_capstone_test", agent: "architect", status: "started" }),
    );
    expect(h.emit).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run_capstone_test", agent: "architect", status: "progress" }),
    );
    expect(h.emit).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run_capstone_test", agent: "architect", status: "done" }),
    );
  });

  it("uses provided targetSkills instead of the map (no cap on provided skills)", async () => {
    h.loadGraph.mockResolvedValue(map);
    const project = await createCapstone({
      userId: "u1",
      title: "Custom",
      targetSkills: ["react", "typescript", "nodejs", "postgresql", "aws"],
    });
    expect(project.targetSkills).toEqual(["react", "typescript", "nodejs", "postgresql", "aws"]);
    expect(project.milestones).toHaveLength(3);
    expect(h.store.upsert).toHaveBeenCalledTimes(1);
  });

  it("falls back gracefully when loadGraph fails and no targetSkills are given", async () => {
    h.loadGraph.mockRejectedValue(new Error("bridge map down"));
    const project = await createCapstone({ userId: "u1", title: "Fallback project" });
    expect(project.targetSkills).toEqual(["communication"]);
    expect(project.milestones).toHaveLength(3);
    expect(h.store.upsert).toHaveBeenCalledTimes(1);
  });

  it("never throws when the store fails", async () => {
    h.loadGraph.mockResolvedValue(map);
    h.store.upsert.mockRejectedValueOnce(new Error("store down"));
    const project = await createCapstone({ userId: "u1", title: "Store-down project" });
    expect(project.title).toBe("Store-down project");
    expect(project.milestones).toHaveLength(3);
  });
});

describe("listCapstones", () => {
  it("returns projects for the user", async () => {
    const project = { id: "cap_1", userId: "u1", title: "T", pitch: "P", roleId: "ml-engineer", targetSkills: [], milestones: [], status: "planning" as const, createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z" };
    stored["cap_1"] = project;
    const list = await listCapstones("u1");
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("T");
    const other = await listCapstones("u2");
    expect(other).toHaveLength(0);
  });

  it("returns empty when the store fails", async () => {
    h.store.list.mockRejectedValueOnce(new Error("store down"));
    const list = await listCapstones("u1");
    expect(list).toEqual([]);
  });
});

describe("updateCapstone", () => {
  it("updates title, pitch, status and showcaseUrl", async () => {
    const existing: CapstoneProject = {
      id: "cap_1", userId: "u1", title: "Old", pitch: "Old pitch", roleId: "ml-engineer",
      targetSkills: ["python"], milestones: [], status: "planning", createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z",
    };
    stored["cap_1"] = existing;
    const updated = await updateCapstone("cap_1", "u1", { title: "New", status: "showcasing", showcaseUrl: "https://example.com" });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("New");
    expect(updated!.status).toBe("showcasing");
    expect(updated!.showcaseUrl).toBe("https://example.com");
    expect(updated!.userId).toBe("u1");
    expect(h.store.upsert).toHaveBeenCalledWith("capstones", "cap_1", expect.objectContaining({ title: "New" }), "u1");
  });

  it("returns null for a missing project or wrong user", async () => {
    expect(await updateCapstone("nope", "u1", { title: "X" })).toBeNull();
    stored["cap_1"] = { id: "cap_1", userId: "u1", title: "T", pitch: "P", roleId: "r", targetSkills: [], milestones: [], status: "planning", createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z" };
    expect(await updateCapstone("cap_1", "u2", { title: "X" })).toBeNull();
  });

  it("returns null when validation or store fails", async () => {
    const existing: CapstoneProject = {
      id: "cap_1", userId: "u1", title: "T", pitch: "P", roleId: "r", targetSkills: [], milestones: [], status: "planning", createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z",
    };
    stored["cap_1"] = existing;
    h.store.upsert.mockRejectedValueOnce(new Error("store down"));
    expect(await updateCapstone("cap_1", "u1", { title: "X" })).toBeNull();
  });
});

describe("toggleMilestone", () => {
  it("flips a milestone's done flag and returns true", async () => {
    const m1: Milestone = { id: "m1", title: "Learn", skillId: "python", tasks: ["a", "b"], done: false };
    const existing: CapstoneProject = {
      id: "cap_1", userId: "u1", title: "T", pitch: "P", roleId: "r", targetSkills: ["python"],
      milestones: [m1], status: "planning", createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z",
    };
    stored["cap_1"] = existing;
    const ok = await toggleMilestone("cap_1", "u1", "m1", true);
    expect(ok).toBe(true);
    const updated = stored["cap_1"] as { milestones: { done: boolean }[] };
    expect(updated.milestones[0].done).toBe(true);
    expect(h.store.upsert).toHaveBeenCalledWith(
      "capstones",
      "cap_1",
      expect.objectContaining({ milestones: expect.arrayContaining([expect.objectContaining({ id: "m1", done: true })]) }),
      "u1",
    );
  });

  it("returns false for a missing project, wrong user or unknown milestone", async () => {
    expect(await toggleMilestone("nope", "u1", "m1", true)).toBe(false);
    stored["cap_1"] = { id: "cap_1", userId: "u1", title: "T", pitch: "P", roleId: "r", targetSkills: [], milestones: [], status: "planning", createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z" };
    expect(await toggleMilestone("cap_1", "u2", "m1", true)).toBe(false);
    expect(await toggleMilestone("cap_1", "u1", "m_nope", true)).toBe(false);
  });

  it("returns false when the store fails", async () => {
    stored["cap_1"] = { id: "cap_1", userId: "u1", title: "T", pitch: "P", roleId: "r", targetSkills: [], milestones: [], status: "planning", createdAt: "2026-11-07T12:00:00Z", updatedAt: "2026-11-07T12:00:00Z" };
    h.store.upsert.mockRejectedValueOnce(new Error("store down"));
    expect(await toggleMilestone("cap_1", "u1", "m1", true)).toBe(false);
  });
});
