// P5 PR1 required route test: GET /api/pods?userId=aisha → 200 with an array.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => {
  const pod = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/pod.aisha.json"), "utf8"));
  const rows = new Map<string, Map<string, unknown>>([["pods", new Map([[pod.id, pod]])]]);
  return {
    getStore: () => ({
      get: async (c: string, id: string) => rows.get(c)?.get(id) ?? null,
      list: async (c: string) => [...(rows.get(c)?.values() ?? [])],
      upsert: async (_c: string, _id: string, doc: unknown) => doc,
      remove: async () => {},
    }),
  };
});

import { GET } from "./route";

describe("GET /api/pods (stub)", () => {
  it("returns 200 with an array containing Aisha's pod", async () => {
    const res = await GET(new Request("http://localhost/api/pods?userId=aisha"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.map((p: { id: string }) => p.id)).toContain("pod_demo01");
  });

  it("returns an empty array for a user with no pod, and 400 without userId", async () => {
    const res = await GET(new Request("http://localhost/api/pods?userId=jakub"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
    const bad = await GET(new Request("http://localhost/api/pods"));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("bad_request");
  });
});
