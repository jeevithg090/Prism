import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { readFileMock, listMock } = vi.hoisted(() => ({ readFileMock: vi.fn(), listMock: vi.fn() }));

vi.mock("node:fs/promises", () => ({ readFile: readFileMock, default: { readFile: readFileMock } }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({ list: listMock, get: vi.fn(), upsert: vi.fn(), remove: vi.fn() }),
}));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));

import { emit } from "@/lib/agents/events";
import { POST } from "./route";

const APP = "https://keystone.example.test";

const market: Record<string, { skillId: string; share: number }[]> = {
  "market.ml-engineer.json": [
    { skillId: "python", share: 0.86 },
    { skillId: "docker", share: 0.41 },
  ],
  "market.data-analyst.json": [
    { skillId: "sql", share: 0.8 },
    { skillId: "excel", share: 0.6 },
  ],
};

const profile = (id: string, roleId: string) => ({ id, name: id, dna: { targetRoles: [roleId] } });

function call(body: unknown, secret: string | null = "s3cret") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-keystone-secret"] = secret;
  return POST(new Request("http://localhost/api/n8n/callback", { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("POST /api/n8n/callback", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    vi.stubEnv("KEYSTONE_SHARED_SECRET", "s3cret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ ok: true, data: {} }));
    readFileMock.mockImplementation(async (p: string) => {
      const file = Object.keys(market).find((f) => String(p).endsWith(f));
      if (!file) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return JSON.stringify({ roleId: "x", skills: market[file] });
    });
    listMock.mockResolvedValue([profile("aisha", "ml-engineer"), profile("ben", "data-analyst"), profile("chen", "ml-engineer")]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(emit).mockClear();
    listMock.mockReset();
    readFileMock.mockReset();
  });

  it("returns 401 { ok: false } without the secret", async () => {
    const res = await call({ workflow: "market-refresh", result: { moved: ["docker"] } }, null);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const res = await call({ workflow: "market-refresh", result: { moved: ["docker"] } }, "nope");
    expect(res.status).toBe(401);
  });

  it("re-plans roadmaps only for profiles whose primary role needs a moved skill", async () => {
    const res = await call({ workflow: "market-refresh", result: { moved: ["docker"] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { ok: true, replanned: 2 } });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const calls = fetchSpy.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String((init as RequestInit).body)) }));
    for (const c of calls) expect(c.url).toBe(`${APP}/api/roadmap/generate`);
    expect(calls.map((c) => c.body)).toEqual(
      expect.arrayContaining([
        { userId: "aisha", roleId: "ml-engineer" },
        { userId: "chen", roleId: "ml-engineer" },
      ]),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "n8n", status: "done", message: "market moved: re-planned 2 roadmaps" }),
    );
  });

  it("counts only regenerations that succeeded", async () => {
    fetchSpy.mockReset();
    fetchSpy
      .mockImplementationOnce(async () => Response.json({ ok: true, data: {} }))
      .mockImplementationOnce(async () => new Response("boom", { status: 500 }));
    const res = await call({ workflow: "market-refresh", result: { moved: ["docker"] } });
    expect((await res.json()).data.replanned).toBe(1);
  });

  it("treats every moved skill as relevant when a role has no market data", async () => {
    listMock.mockResolvedValue([profile("dev", "software-engineer"), profile("ben", "data-analyst")]);
    const res = await call({ workflow: "market-refresh", result: { moved: ["docker"] } });
    expect((await res.json()).data.replanned).toBe(1);
    expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toEqual({
      userId: "dev",
      roleId: "software-engineer",
    });
  });

  it("returns 200 { replanned: 0 } for an unknown workflow", async () => {
    const res = await call({ workflow: "something-else", result: { moved: ["docker"] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { ok: true, replanned: 0 } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    expect((await call({ result: {} })).status).toBe(400);
    expect((await call({ workflow: "market-refresh", result: { moved: "docker" } })).status).toBe(400);
  });
});
