import { beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/data/fixtures/challenges.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";

const h = vi.hoisted(() => ({ docs: new Map<string, { doc: unknown; userId?: string }>() }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_route", subscribe: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmJSON: () => Promise.reject(new Error("no_key")), llmText: () => Promise.reject(new Error("no_key")), LLMError: class extends Error {} }));
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

import { POST as grade } from "./route";
import { POST as generate } from "../generate/route";
import { POST as sample } from "../sample/route";
import { GET as menu } from "../route";

const docker = fixtures.find((c) => c.skillId === "docker")!;
const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request("http://localhost/api/challenges", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  h.docs.clear();
  h.docs.set("profiles/aisha", { doc: { id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", dna: { targetRoles: ["ml-engineer"] }, badges: [] }, userId: "aisha" });
});

describe("challenge routes", () => {
  it("GET /api/challenges needs a userId and returns the menu", async () => {
    expect((await menu(new Request("http://localhost/api/challenges"))).status).toBe(400);
    const res = await menu(new Request("http://localhost/api/challenges?userId=aisha"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.focusSkillId).toBe("docker");
  });

  it("POST /generate validates input, 404s an unknown skill, and returns a public challenge", async () => {
    expect((await post(generate, "nope")).status).toBe(400);
    expect((await post(generate, { userId: "aisha" })).status).toBe(400);
    const missing = await post(generate, { userId: "aisha", skillId: "kubernetes" });
    expect(missing.status).toBe(404);
    const res = await post(generate, { userId: "aisha", skillId: "docker" });
    const json = await res.json();
    expect(json.data).toMatchObject({ id: docker.id, checksCount: 3 });
    expect(json.data.sampleAnswer).toBeUndefined();
  });

  it("POST /grade: the starter fails with hints, the good answer passes; empty and unknown are rejected", async () => {
    expect((await post(grade, { userId: "aisha", challengeId: docker.id, submission: "   " })).status).toBe(400);
    expect((await post(grade, { userId: "aisha", challengeId: "nope", submission: "FROM x" })).status).toBe(404);
    const bad = await (await post(grade, { userId: "aisha", challengeId: docker.id, submission: docker.starter })).json();
    expect(bad.data).toMatchObject({ passed: false, rubricMet: 0 });
    expect(bad.data.rubric[0].hint).toMatch(/\?$/);
    const good = await (await post(grade, { userId: "aisha", challengeId: docker.id, submission: docker.sampleAnswer })).json();
    expect(good.data).toMatchObject({ passed: true, usedSample: true, evidenceId: "ev_mc_aisha_docker" });
  });

  it("POST /sample returns the sample answer only when asked", async () => {
    const json = await (await post(sample, { challengeId: docker.id })).json();
    expect(json.data.sampleAnswer).toBe(docker.sampleAnswer);
    expect((await post(sample, { challengeId: "nope" })).status).toBe(404);
  });
});
