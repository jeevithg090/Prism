// P5 PR1 required route test: POST /api/help with an empty message → 400.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => {
  const rows = new Map<string, unknown>();
  return {
    getStore: () => ({
      get: async (_c: string, id: string) => rows.get(id) ?? null,
      list: async () => [...rows.values()],
      upsert: async (_c: string, id: string, doc: unknown) => { rows.set(id, doc); return doc; },
      remove: async () => {},
    }),
  };
});

import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/help", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("/api/help (stub)", () => {
  it("rejects an empty message with 400 bad_request", async () => {
    const res = await post({ fromUserId: "aisha", kind: "question", message: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
  });

  it("creates an open request and lists it", async () => {
    const res = await post({ fromUserId: "aisha", kind: "question", message: "How do I read a stack trace?" });
    expect([200, 201]).toContain(res.status);
    const created = (await res.json()).data;
    expect(created).toMatchObject({ fromUserId: "aisha", status: "open" });
    const list = (await (await GET(new Request("http://localhost/api/help"))).json()).data;
    expect(list.map((h: { id: string }) => h.id)).toContain(created.id);
  });
});
