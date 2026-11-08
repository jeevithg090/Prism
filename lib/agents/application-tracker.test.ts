import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStore, type Store } from "@/lib/store";
import type { Application } from "@/lib/schemas/application";

type Row = { doc: unknown; userId?: string };
const db = new Map<string, Map<string, Row>>();
const col = (c: string) => {
  let m = db.get(c);
  if (!m) { m = new Map(); db.set(c, m); }
  return m;
};

const workingStore = {
  get: vi.fn(async (c: string, id: string) => (col(c).get(id)?.doc ?? null)),
  list: vi.fn(async (c: string, f?: { userId?: string }) =>
    [...col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc as Application)),
  upsert: vi.fn(async (c: string, id: string, doc: unknown, userId?: string) => { col(c).set(id, { doc, userId }); return doc; }),
  remove: vi.fn(async (c: string, id: string) => { col(c).delete(id); return undefined; }),
};

const failingStore = {
  get: vi.fn(async () => { throw new Error("store is down"); }),
  list: vi.fn(async () => { throw new Error("store is down"); }),
  upsert: vi.fn(async () => { throw new Error("store is down"); }),
  remove: vi.fn(async () => { throw new Error("store is down"); }),
};

vi.mock("@/lib/store", () => ({ getStore: vi.fn(() => workingStore) }));

import {
  createApplication,
  listApplications,
  matchSkillsForJob,
  removeApplication,
  updateApplication,
} from "./application-tracker";

const seed: Application[] = [
  {
    id: "app_01", userId: "aisha", company: "Arm", roleTitle: "ML Engineer", roleUrl: "https://example.com/arm-ml",
    status: "applied", appliedAt: "2026-11-01T09:00:00Z", source: "adzuna",
    notes: "Python and PyTorch", matchedSkills: ["python", "pytorch"], matchScore: 0.67,
    createdAt: "2026-11-01T09:00:00Z", updatedAt: "2026-11-01T09:00:00Z",
  },
  {
    id: "app_02", userId: "aisha", company: "Ocado", roleTitle: "Data Analyst",
    status: "interviewing", appliedAt: "2026-11-03T09:00:00Z", source: "reed",
    notes: "SQL and Tableau", matchedSkills: ["sql"], matchScore: 0.25,
    createdAt: "2026-11-03T09:00:00Z", updatedAt: "2026-11-03T09:00:00Z",
  },
  { id: "app_03", userId: "tom", company: "BBC", roleTitle: "Java Developer", status: "rejected",
    appliedAt: "2026-11-02T09:00:00Z", source: "reed", notes: "Java", matchedSkills: ["java"], matchScore: 1,
    createdAt: "2026-11-02T09:00:00Z", updatedAt: "2026-11-02T09:00:00Z" },
];

beforeEach(() => {
  db.clear();
  vi.clearAllMocks();
  for (const a of seed) col("applications").set(a.id, { doc: { ...a }, userId: a.userId });
});

describe("matchSkillsForJob (pure)", () => {
  it("matches known skills by name, case-insensitive", () => {
    const { matchedSkills, matchScore } = matchSkillsForJob("Python and React developer", undefined, [
      "python", "react", "docker",
    ]);
    expect(matchedSkills).toEqual(["python", "react"]);
    expect(matchScore).toBe(Math.round((2 / 3) * 100) / 100);
  });

  it("matches aliases and multi-word skill names", () => {
    const { matchedSkills } = matchSkillsForJob("HTML & CSS developer", undefined, ["html-css", "python"]);
    expect(matchedSkills).toEqual(["html-css"]);
  });

  it("skips unknown skills and does not substring-match (java !== javascript)", () => {
    const { matchedSkills, matchScore } = matchSkillsForJob("JavaScript developer", undefined, [
      "java", "javascript", "python",
    ]);
    expect(matchedSkills).toEqual(["javascript"]);
    expect(matchScore).toBe(0.33);
  });

  it("returns empty and score 0 when nothing is proven", () => {
    expect(matchSkillsForJob("Python developer", undefined, [])).toEqual({ matchedSkills: [], matchScore: 0 });
    expect(matchSkillsForJob("Python developer", "nothing relevant", ["rust"])).toEqual({
      matchedSkills: [], matchScore: 0,
    });
  });

  it("ignores notes when undefined and matches across title+notes", () => {
    const { matchedSkills } = matchSkillsForJob("Developer", "knows AWS and Docker", ["aws", "docker", "python"]);
    expect(matchedSkills).toEqual(["aws", "docker"]);
  });
});

describe("create → list roundtrip", () => {
  it("creates an application and lists it for the same user", async () => {
    const created = await createApplication({
      userId: "aisha", company: "NewCo", roleTitle: "Intern", status: "applied", notes: "Go",
    });
    expect(created.id).toMatch(/^app_[A-Za-z0-9_-]{8}$/);
    expect(created.status).toBe("applied");
    expect(created.matchScore).toBe(0);
    expect(created.matchedSkills).toEqual([]);

    const items = await listApplications("aisha");
    expect(items.map((a) => a.id)).toContain(created.id);
    expect(items.every((a) => a.userId === "aisha")).toBe(true);
  });

  it("defaults status to applied and timestamps", async () => {
    const created = await createApplication({ userId: "mei", company: "C", roleTitle: "R" });
    expect(created.status).toBe("applied");
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(created.createdAt).toBe(created.updatedAt);
  });

  it("does not leak other users' applications", async () => {
    await createApplication({ userId: "tom", company: "C", roleTitle: "R" });
    const aisha = await listApplications("aisha");
    expect(aisha.map((a) => a.id).sort()).toEqual(["app_01", "app_02"].sort());
  });

  it("filters by status and limit", async () => {
    const interviewing = await listApplications("aisha", { status: "interviewing" });
    expect(interviewing.map((a) => a.id)).toEqual(["app_02"]);
    const limited = await listApplications("aisha", { limit: 1 });
    expect(limited).toHaveLength(1);
  });
});

describe("update", () => {
  it("updates status and notes and returns the application", async () => {
    const updated = await updateApplication("app_01", "aisha", { status: "offered", notes: "Great offer" });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("offered");
    expect(updated!.notes).toBe("Great offer");
    expect(updated!.updatedAt).not.toBe(seed[0].updatedAt);
  });

  it("returns null for a missing id or another user's application", async () => {
    expect(await updateApplication("app_missing", "aisha", { status: "offered" })).toBeNull();
    expect(await updateApplication("app_03", "aisha", { status: "offered" })).toBeNull(); // tom's
  });

  it("supports a partial patch", async () => {
    const updated = await updateApplication("app_02", "aisha", { notes: "moved to final round" });
    expect(updated!.status).toBe("interviewing"); // unchanged
    expect(updated!.notes).toBe("moved to final round");
  });
});

describe("remove", () => {
  it("removes an owned application and returns true", async () => {
    expect(await removeApplication("app_01", "aisha")).toBe(true);
    expect(await listApplications("aisha").then((r) => r.map((a) => a.id))).toEqual(["app_02"]);
  });

  it("returns false for a missing id or another user's application", async () => {
    expect(await removeApplication("app_missing", "aisha")).toBe(false);
    expect(await removeApplication("app_03", "aisha")).toBe(false); // tom's still there
    expect((await listApplications("tom")).map((a) => a.id)).toEqual(["app_03"]);
  });
});

describe("store failure (graceful degradation)", () => {
  beforeEach(() => {
    vi.mocked(getStore).mockReturnValue(failingStore as unknown as Store);
  });
  afterEach(() => {
    vi.mocked(getStore).mockReturnValue(workingStore as unknown as Store);
  });

  it("listApplications returns []", async () => {
    expect(await listApplications("aisha")).toEqual([]);
  });

  it("updateApplication returns null", async () => {
    expect(await updateApplication("app_01", "aisha", { status: "offered" })).toBeNull();
  });

  it("removeApplication returns false", async () => {
    expect(await removeApplication("app_01", "aisha")).toBe(false);
  });

  it("createApplication still returns an application and never throws", async () => {
    const app = await createApplication({ userId: "aisha", company: "C", roleTitle: "R" });
    expect(app.id).toMatch(/^app_/);
    expect(app.company).toBe("C");
  });
});
