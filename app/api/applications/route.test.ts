import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/lib/schemas/application";

type Row = { doc: unknown; userId?: string };
const db = new Map<string, Map<string, Row>>();
const col = (c: string) => {
  let m = db.get(c);
  if (!m) { m = new Map(); db.set(c, m); }
  return m;
};

const store = {
  get: vi.fn(async (c: string, id: string) => (col(c).get(id)?.doc ?? null)),
  list: vi.fn(async (c: string, f?: { userId?: string }) =>
    [...col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc as Application)),
  upsert: vi.fn(async (c: string, id: string, doc: unknown, userId?: string) => { col(c).set(id, { doc, userId }); return doc; }),
  remove: vi.fn(async (c: string, id: string) => { col(c).delete(id); return undefined; }),
};

vi.mock("@/lib/store", () => ({ getStore: () => store }));

import { DELETE, GET, PATCH, POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://test/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new Request("http://test/api/applications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

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
    notes: "SQL", matchedSkills: ["sql"], matchScore: 0.25,
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

describe("GET /api/applications", () => {
  it("lists a user's applications", async () => {
    const res = await GET(new Request("http://test/api/applications?userId=aisha"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.map((a: Application) => a.id)).toEqual(["app_02", "app_01"]);
  });

  it("filters by ?status=", async () => {
    const json = await (await GET(new Request("http://test/api/applications?userId=aisha&status=interviewing"))).json();
    expect(json.data.map((a: Application) => a.id)).toEqual(["app_02"]);
  });

  it("respects ?limit=", async () => {
    const json = await (await GET(new Request("http://test/api/applications?userId=aisha&limit=1"))).json();
    expect(json.data).toHaveLength(1);
  });

  it("rejects a missing userId with 400", async () => {
    const res = await GET(new Request("http://test/api/applications"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });
});

describe("POST /api/applications (create)", () => {
  it("rejects a non-JSON body with 400", async () => {
    const res = await POST(new Request("http://test/api/applications", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing company/roleTitle with 400 and does not write", async () => {
    const res = await post({ userId: "aisha", roleTitle: "Intern" });
    expect(res.status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing userId with 400", async () => {
    const res = await post({ company: "C", roleTitle: "R" });
    expect(res.status).toBe(400);
  });

  it("creates and returns the application", async () => {
    const res = await post({ userId: "aisha", company: "NewCo", roleTitle: "Intern", status: "applied", notes: "Go" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const created = json.data;
    expect(created.id).toMatch(/^app_[A-Za-z0-9_-]{8}$/);
    expect(created).toMatchObject({ userId: "aisha", company: "NewCo", roleTitle: "Intern", status: "applied" });
    expect(store.upsert).toHaveBeenCalledWith("applications", created.id, created, "aisha");
  });
});

describe("PATCH /api/applications (update)", () => {
  it("updates status and notes and returns the application", async () => {
    const res = await patch({ id: "app_01", userId: "aisha", status: "offered", notes: "Great offer" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ id: "app_01", status: "offered", notes: "Great offer" });
  });

  it("supports a partial patch", async () => {
    const res = await patch({ id: "app_02", userId: "aisha", notes: "final round" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("interviewing");
    expect(json.data.notes).toBe("final round");
  });

  it("rejects invalid status with 400", async () => {
    const res = await patch({ id: "app_01", userId: "aisha", status: "maybe" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("returns 404 for a missing id or another user's application", async () => {
    expect((await patch({ id: "app_missing", userId: "aisha", status: "offered" })).status).toBe(404);
    expect((await patch({ id: "app_03", userId: "aisha", status: "offered" })).status).toBe(404); // tom's
  });

  it("rejects missing id/userId with 400", async () => {
    expect((await patch({ userId: "aisha", status: "offered" })).status).toBe(400);
    expect((await patch({ id: "app_01", status: "offered" })).status).toBe(400);
  });
});

describe("DELETE /api/applications", () => {
  it("removes an owned application and returns true", async () => {
    const res = await DELETE(new Request("http://test/api/applications?id=app_01&userId=aisha"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ id: "app_01", removed: true });
    expect((await store.list("applications", { userId: "aisha" })).map((a) => a.id)).toEqual(["app_02"]);
  });

  it("returns 404 for a missing id or another user's application", async () => {
    expect((await DELETE(new Request("http://test/api/applications?id=app_missing&userId=aisha"))).status).toBe(404);
    expect((await DELETE(new Request("http://test/api/applications?id=app_03&userId=aisha"))).status).toBe(404); // tom's
  });

  it("rejects missing id/userId with 400", async () => {
    expect((await DELETE(new Request("http://test/api/applications?id=app_01"))).status).toBe(400);
    expect((await DELETE(new Request("http://test/api/applications?userId=aisha"))).status).toBe(400);
  });
});
