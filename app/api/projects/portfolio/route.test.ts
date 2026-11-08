import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createCapstone: vi.fn(),
  listCapstones: vi.fn(),
  updateCapstone: vi.fn(),
  toggleMilestone: vi.fn(),
}));

vi.mock("@/lib/agents/capstone-project", () => ({
  createCapstone: h.createCapstone,
  listCapstones: h.listCapstones,
  updateCapstone: h.updateCapstone,
  toggleMilestone: h.toggleMilestone,
}));

import { GET, POST, PATCH } from "./route";

const project = {
  id: "cap_1",
  userId: "u1",
  title: "My capstone",
  pitch: "A pitch.",
  roleId: "ml-engineer",
  targetSkills: ["python", "docker"],
  milestones: [],
  status: "planning",
  createdAt: "2026-11-07T12:00:00Z",
  updatedAt: "2026-11-07T12:00:00Z",
};

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/projects/portfolio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api/projects/portfolio", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

const get = (url: string) => GET(new Request(url));

beforeEach(() => {
  vi.clearAllMocks();
  h.createCapstone.mockResolvedValue(project);
  h.listCapstones.mockResolvedValue([project]);
  h.updateCapstone.mockResolvedValue(project);
  h.toggleMilestone.mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("GET /api/projects/portfolio", () => {
  it("lists capstones for a user", async () => {
    const res = await get("http://localhost/api/projects/portfolio?userId=u1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(h.listCapstones).toHaveBeenCalledWith("u1");
  });

  it("400s when userId is missing", async () => {
    const res = await get("http://localhost/api/projects/portfolio");
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("bad_request");
  });
});

describe("POST /api/projects/portfolio", () => {
  it("creates a project and returns 201", async () => {
    const res = await post({ userId: "u1", title: "My capstone", pitch: "A pitch." });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(h.createCapstone).toHaveBeenCalledWith({ userId: "u1", title: "My capstone", pitch: "A pitch." });
  });

  it("400s for an invalid body", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ userId: "u1" })).status).toBe(400);
  });

  it("toggles a milestone when milestoneId and done are present", async () => {
    const res = await post({ id: "cap_1", userId: "u1", milestoneId: "m1", done: true });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ toggled: true });
    expect(h.toggleMilestone).toHaveBeenCalledWith("cap_1", "u1", "m1", true);
  });

  it("400s for a toggle missing id or userId", async () => {
    expect((await post({ milestoneId: "m1", done: true })).status).toBe(400);
    expect((await post({ id: "cap_1", milestoneId: "m1", done: true })).status).toBe(400);
  });
});

describe("PATCH /api/projects/portfolio", () => {
  it("updates a project and returns 200", async () => {
    const res = await patch({ id: "cap_1", userId: "u1", title: "Renamed", status: "showcasing" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(h.updateCapstone).toHaveBeenCalledWith("cap_1", "u1", { title: "Renamed", status: "showcasing" });
  });

  it("404s when the project is not found", async () => {
    h.updateCapstone.mockResolvedValue(null);
    const res = await patch({ id: "cap_1", userId: "u1", title: "Renamed" });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("400s for an invalid body or missing id/userId", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
    expect((await patch({ userId: "u1" })).status).toBe(400);
    expect((await patch({ id: "cap_1" })).status).toBe(400);
  });
});
