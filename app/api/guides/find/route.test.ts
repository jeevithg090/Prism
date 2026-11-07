import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideSuggestionZ } from "@/lib/schemas/community";
import type { BridgeMap, GuideSuggestion } from "@/lib/types";

type Row = { doc: unknown; userId?: string };
const { db, store, findGuides, loadGraph } = vi.hoisted(() => {
  const db = new Map<string, Map<string, Row>>();
  const col = (c: string) => { let m = db.get(c); if (!m) { m = new Map(); db.set(c, m); } return m; };
  return {
    db,
    store: {
      get: vi.fn(async (c: string, id: string) => col(c).get(id)?.doc ?? null),
      list: vi.fn(async (c: string) => [...col(c).values()].map((r) => r.doc)),
      upsert: vi.fn(async (c: string, id: string, doc: unknown, userId?: string) => { col(c).set(id, { doc, userId }); return doc; }),
      remove: vi.fn(async (c: string, id: string) => { col(c).delete(id); }),
    },
    findGuides: vi.fn(),
    loadGraph: vi.fn(),
  };
});
vi.mock("@/lib/store", () => ({ getStore: () => store }));
vi.mock("@/lib/agents/guides", () => ({ findGuides }));
vi.mock("@/lib/graph/build", () => ({ loadGraph }));

import { POST } from "./route";

const GUIDES: GuideSuggestion[] = [
  { name: "mcr-dev", whyRelevant: "Writes TypeScript in Manchester.", publicUrl: "https://github.com/mcr-dev", source: "github", suggestedQuestion: "How did you learn Docker?", draftMessage: "Hi mcr-dev, I'm Aisha…" },
  { name: "Docker Manchester", whyRelevant: "Runs Docker talks.", publicUrl: "https://www.meetup.com/docker-manchester/", source: "web", suggestedQuestion: "Any beginner talks?", draftMessage: "Hi there, I'm Aisha…" },
];
const FIXTURE: GuideSuggestion[] = [{ ...GUIDES[0], name: "Fixture Guide", publicUrl: "https://github.com/fixture" }];
const MAP: BridgeMap = { userId: "aisha", roleId: "ml-engineer", nodes: [{ skillId: "docker", name: "Docker", category: "cloud-devops", status: "gap", demand: 0.41, level: 0, evidenceIds: [], moduleCodes: [] }], edges: [], readinessNow: 0.38, readinessProjected: 0.6, generatedAt: "2026-11-07T10:00:00Z" };

const call = (body: unknown, qs = "") =>
  POST(new Request(`http://test/api/guides/find${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const realRead = fs.readFileSync;
beforeEach(() => {
  db.clear();
  vi.clearAllMocks();
  delete process.env.DEMO_MODE;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  const profiles = new Map<string, Row>([["aisha", { doc: { id: "aisha", name: "Aisha Rahman", dna: { targetRoles: ["ml-engineer"] } }, userId: "aisha" }]]);
  db.set("profiles", profiles);
  findGuides.mockResolvedValue(GUIDES);
  loadGraph.mockResolvedValue(MAP);
  vi.spyOn(fs, "readFileSync").mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) =>
    String(p).endsWith("guides.aisha.json") ? JSON.stringify(FIXTURE) : (realRead as (...a: unknown[]) => unknown)(p, ...rest)) as typeof fs.readFileSync);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.DEMO_MODE;
});

describe("POST /api/guides/find", () => {
  it("returns valid suggestions for the user's top gap", async () => {
    const res = await call({ userId: "aisha" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(2);
    for (const g of json.data) expect(GuideSuggestionZ.safeParse(g).success).toBe(true);
    expect(loadGraph).toHaveBeenCalledWith("aisha", "ml-engineer");
    expect(findGuides).toHaveBeenCalledWith(expect.objectContaining({ id: "aisha" }), MAP);
  });

  it("prefers the map cached in the store", async () => {
    const cached = { ...MAP, readinessNow: 0.5 };
    await store.upsert("maps", "aisha:ml-engineer", cached);
    await call({ userId: "aisha" });
    expect(loadGraph).not.toHaveBeenCalled();
    expect(findGuides).toHaveBeenCalledWith(expect.anything(), cached);
  });

  it("returns 400 for a bad body and 404 for an unknown user", async () => {
    expect((await call({})).status).toBe(400);
    const res = await call({ userId: "nobody" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("allows 3 drafts a day; the 4th request returns 429 daily_limit", async () => {
    for (let i = 0; i < 3; i++) expect((await call({ userId: "aisha" })).status).toBe(200);
    const res = await call({ userId: "aisha" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "daily_limit" } });
    expect(findGuides).toHaveBeenCalledTimes(3);
    expect(await store.get("guides_usage", "aisha:2026-11-07")).toMatchObject({ count: 3 });

    vi.setSystemTime(new Date("2026-11-08T09:00:00Z"));
    expect((await call({ userId: "aisha" })).status).toBe(200);
  });

  it("serves the fixture in DEMO_MODE without running the agent, still counting usage", async () => {
    process.env.DEMO_MODE = "true";
    const json = await (await call({ userId: "aisha" })).json();
    expect(json.data).toEqual(FIXTURE);
    expect(findGuides).not.toHaveBeenCalled();
    expect(await store.get("guides_usage", "aisha:2026-11-07")).toMatchObject({ count: 1 });
  });

  it("falls back to the fixture when the live path finds nothing", async () => {
    findGuides.mockResolvedValue([]);
    expect((await (await call({ userId: "aisha" })).json()).data).toEqual(FIXTURE);
    findGuides.mockRejectedValue(new Error("boom"));
    expect((await (await call({ userId: "aisha" })).json()).data).toEqual(FIXTURE);
  });
});
