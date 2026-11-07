import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpRequestZ } from "@/lib/schemas/community";
import type { HelpRequest } from "@/lib/types";

type Row = { doc: unknown; userId?: string };
const db = new Map<string, Map<string, Row>>();
const col = (c: string) => { let m = db.get(c); if (!m) { m = new Map(); db.set(c, m); } return m; };
const store = {
  get: vi.fn(async (c: string, id: string) => (col(c).get(id)?.doc ?? null)),
  list: vi.fn(async (c: string, f?: { userId?: string }) =>
    [...col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc)),
  upsert: vi.fn(async (c: string, id: string, doc: unknown, userId?: string) => { col(c).set(id, { doc, userId }); return doc; }),
  remove: vi.fn(async (c: string, id: string) => { col(c).delete(id); }),
};
vi.mock("@/lib/store", () => ({ getStore: () => store }));

import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://test/api/help", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const seed: HelpRequest[] = [
  { id: "help_01", fromUserId: "aisha", kind: "question", message: "How do I set up a Python venv?", status: "open", createdAt: "2026-11-06T10:00:00.000Z" },
  { id: "help_02", fromUserId: "tom", kind: "chat-15", message: "Chat about SQL joins?", status: "accepted", toUserId: "priya", createdAt: "2026-11-07T09:00:00.000Z" },
  { id: "help_03", fromUserId: "mei", kind: "code-review", message: "Review my React hook?", status: "open", createdAt: "2026-11-07T11:00:00.000Z" },
];

beforeEach(() => {
  db.clear();
  vi.clearAllMocks();
  for (const r of seed) col("help").set(r.id, { doc: { ...r }, userId: r.fromUserId });
  col("profiles").set("aisha", { doc: { id: "aisha", name: "Aisha Rahman" }, userId: "aisha" });
});

describe("GET /api/help", () => {
  it("returns every request newest first", async () => {
    const res = await GET(new Request("http://test/api/help"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.map((r: HelpRequest) => r.id)).toEqual(["help_03", "help_02", "help_01"]);
  });

  it("filters by ?status=open", async () => {
    const json = await (await GET(new Request("http://test/api/help?status=open"))).json();
    expect(json.data.map((r: HelpRequest) => r.id)).toEqual(["help_03", "help_01"]);
  });

  it("rejects an unknown status with 400", async () => {
    const res = await GET(new Request("http://test/api/help?status=nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });
});

describe("POST /api/help (create)", () => {
  it("rejects an empty or whitespace message with 400", async () => {
    for (const message of ["", "   \n "]) {
      const res = await post({ fromUserId: "aisha", kind: "question", message });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await POST(new Request("http://test/api/help", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("creates an open request with a help_ id and saves it", async () => {
    const res = await post({ fromUserId: "aisha", kind: "code-review", message: "  Could someone look at my first PR?  " });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const created = HelpRequestZ.parse(json.data);
    expect(created.id).toMatch(/^help_[A-Za-z0-9_-]{6}$/);
    expect(created).toMatchObject({ fromUserId: "aisha", kind: "code-review", status: "open", message: "Could someone look at my first PR?" });
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(store.upsert).toHaveBeenCalledWith("help", created.id, created, "aisha");
  });
});

describe("POST /api/help (update)", () => {
  it("accepts a request, records the helper's momentum event and returns the request", async () => {
    const res = await post({ id: "help_01", status: "accepted", toUserId: "priya" });
    expect(res.status).toBe(200);
    const json = await res.json();
    const updated = HelpRequestZ.parse(json.data);
    expect(updated).toMatchObject({ id: "help_01", status: "accepted", toUserId: "priya", fromUserId: "aisha" });

    expect(store.upsert).toHaveBeenCalledWith(
      "momentum_events",
      expect.any(String),
      expect.objectContaining({ userId: "priya", kind: "helped-newcomer", label: "Helped Aisha with a question" }),
      "priya",
    );
    const events = await store.list("momentum_events", { userId: "priya" });
    expect(events).toHaveLength(1);
    expect((await store.get("help", "help_01")) as HelpRequest).toMatchObject({ status: "accepted", toUserId: "priya" });
  });

  it("does not double-count momentum when the same helper accepts twice", async () => {
    await post({ id: "help_01", status: "accepted", toUserId: "priya" });
    await post({ id: "help_01", status: "accepted", toUserId: "priya" });
    expect(await store.list("momentum_events")).toHaveLength(1);
  });

  it("marks a request done without recording momentum", async () => {
    const res = await post({ id: "help_02", status: "done" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ status: "done", toUserId: "priya" });
    expect(await store.list("momentum_events")).toHaveLength(0);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await post({ id: "help_missing", status: "accepted", toUserId: "priya" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 400 for an invalid status and for accepting your own request", async () => {
    expect((await post({ id: "help_01", status: "maybe" })).status).toBe(400);
    expect((await post({ id: "help_01", status: "accepted", toUserId: "aisha" })).status).toBe(400);
  });
});
