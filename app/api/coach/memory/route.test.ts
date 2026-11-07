import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ api: null as null | ReturnType<typeof import("@/lib/agents/coach/testTools").memoryStore> }));
vi.mock("@/lib/store", async () => {
  const { memoryStore } = await import("@/lib/agents/coach/testTools");
  h.api = memoryStore();
  return { getStore: () => h.api!.store };
});

import { addMemory } from "@/lib/agents/coach/memory";
import { DELETE, GET } from "./route";

const url = (q: string) => `http://localhost/api/coach/memory${q}`;

beforeEach(async () => {
  h.api!.rows.clear();
  await addMemory({ userId: "aisha", kind: "preference", text: "you prefer project-based learning" });
  await addMemory({ userId: "tom", kind: "goal", text: "your goal is AWS" });
});

describe("GET /api/coach/memory", () => {
  it("lists only the student's own notes", async () => {
    const res = await GET(new Request(url("?userId=aisha")));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([expect.objectContaining({ id: "aisha:1", text: "you prefer project-based learning" })]);
  });
  it("returns 400 without a userId", async () => {
    expect((await GET(new Request(url("")))).status).toBe(400);
  });
});

describe("DELETE /api/coach/memory", () => {
  it("deletes the student's note", async () => {
    const res = await DELETE(new Request(url("?userId=aisha&id=aisha:1"), { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { deleted: true, id: "aisha:1" } });
    expect((await (await GET(new Request(url("?userId=aisha")))).json()).data).toEqual([]);
  });
  it("returns 404 for someone else's or a missing note, 400 for missing params", async () => {
    expect((await DELETE(new Request(url("?userId=aisha&id=tom:1"), { method: "DELETE" }))).status).toBe(404);
    expect((await DELETE(new Request(url("?userId=aisha&id=aisha:9"), { method: "DELETE" }))).status).toBe(404);
    expect((await DELETE(new Request(url("?userId=aisha"), { method: "DELETE" }))).status).toBe(400);
  });
});
