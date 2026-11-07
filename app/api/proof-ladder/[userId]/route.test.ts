import { beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";

const h = vi.hoisted(() => ({ docs: new Map<string, { doc: unknown; userId?: string }>() }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_route", subscribe: vi.fn() }));
vi.mock("@/lib/graph/build", () => ({ loadGraph: async (u: string) => (u === "aisha" ? structuredClone(mapFixture) : null) }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) =>
      [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId }); return doc; },
    remove: async () => {},
  }),
}));

import { GET as ladder } from "./route";
import { GET as passport, PUT as setPassport } from "./passport/route";
import { GET as latest } from "../../proof/latest/[userId]/route";

const ctx = (userId: string) => ({ params: Promise.resolve({ userId }) });
const req = (url: string, init?: RequestInit & { uid?: string }) =>
  new Request(`http://localhost${url}`, { ...init, headers: { "content-type": "application/json", ...(init?.uid ? { cookie: `ks_uid=${init.uid}` } : {}) } });

beforeEach(() => {
  h.docs.clear();
  h.docs.set("profiles/aisha", { doc: { id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, dna: { targetRoles: ["ml-engineer"] }, badges: ["new-to-uni"] }, userId: "aisha" });
  h.docs.set(`pods/${podFixture.id}`, { doc: structuredClone(podFixture), userId: "aisha" });
});

describe("GET /api/proof-ladder/[userId]", () => {
  it("returns every skill's rungs, or one skill with ?skillId=", async () => {
    const all = await (await ladder(req("/api/proof-ladder/aisha"), ctx("aisha"))).json();
    expect(all.ok).toBe(true);
    expect(all.data.skills.length).toBeGreaterThan(5);
    const one = await (await ladder(req("/api/proof-ladder/aisha?skillId=docker"), ctx("aisha"))).json();
    expect(one.data.skills).toHaveLength(1);
    expect(one.data.skills[0]).toMatchObject({ skillId: "docker", level: 0 });
    expect(one.data.skills[0].rungs.map((r: { label: string }) => r.label)).toEqual(["Tried it", "Built it", "Can teach it"]);
  });

  it("400s a malformed skill id", async () => {
    expect((await ladder(req("/api/proof-ladder/aisha?skillId=Not%20A%20Skill"), ctx("aisha"))).status).toBe(400);
  });
});

describe("passport routes", () => {
  it("private by default (403 for others), owner can opt in, then others can see it", async () => {
    expect((await passport(req("/api/proof-ladder/aisha/passport", { uid: "tom" }), ctx("aisha"))).status).toBe(403);
    const own = await (await passport(req("/api/proof-ladder/aisha/passport"), ctx("aisha"))).json();
    expect(own.data).toMatchObject({ isOwner: true, isPublic: false });
    expect((await setPassport(req("/api/proof-ladder/aisha/passport", { method: "PUT", body: JSON.stringify({ public: true }), uid: "tom" }), ctx("aisha"))).status).toBe(403);
    expect((await setPassport(req("/api/proof-ladder/aisha/passport", { method: "PUT", body: JSON.stringify({ public: "yes" }) }), ctx("aisha"))).status).toBe(400);
    const put = await (await setPassport(req("/api/proof-ladder/aisha/passport", { method: "PUT", body: JSON.stringify({ public: true }) }), ctx("aisha"))).json();
    expect(put.data).toEqual({ isPublic: true });
    const visitor = await (await passport(req("/api/proof-ladder/aisha/passport", { uid: "tom" }), ctx("aisha"))).json();
    expect(visitor.data).toMatchObject({ isOwner: false, isPublic: true });
  });

  it("404s an unknown profile", async () => {
    expect((await passport(req("/api/proof-ladder/ghost/passport", { uid: "ghost" }), ctx("ghost"))).status).toBe(404);
  });
});

describe("GET /api/proof/latest/[userId]", () => {
  it("returns Aisha's pod issue with dynamic variables, and null for an unknown user", async () => {
    const json = await (await latest(req("/api/proof/latest/aisha"), ctx("aisha"))).json();
    expect(json.data).toMatchObject({ skillId: "docker", status: "in-progress", isDemo: true });
    expect(json.data.dynamicVariables.latest_pr_reviewer).toBe("Priya");
    const none = await (await latest(req("/api/proof/latest/ghost"), ctx("ghost"))).json();
    expect(none).toEqual({ ok: true, data: null });
  });
});
