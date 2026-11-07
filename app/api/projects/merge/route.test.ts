import { beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import { ProofResultZ, ProjectProgressZ } from "@/lib/schemas/studio";
import type { Profile } from "@/lib/types";

const h = vi.hoisted(() => ({ docs: new Map<string, unknown>(), upsert: vi.fn() }));

vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_merge", subscribe: vi.fn() }));
vi.mock("@/lib/graph/build", () => ({
  loadGraph: async (u: string, r: string) => (u === "aisha" && r === "ml-engineer" ? structuredClone(mapFixture) : null),
}));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`) ?? null),
    list: async (c: string) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => structuredClone(d)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.upsert(c, id, doc, userId); h.docs.set(`${c}/${id}`, structuredClone(doc)); return doc; },
    remove: async () => {},
  }),
}));

import { POST } from "./route";
import { GET } from "../progress/route";

const dna = { targetRoles: ["ml-engineer"] } as Profile["dna"];
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/projects/merge", {
    method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const progress = (q: string) => GET(new Request(`http://localhost/api/projects/progress${q}`));

beforeEach(() => {
  vi.clearAllMocks();
  h.docs.clear();
  h.docs.set("pods/pod_demo01", structuredClone(podFixture));
  h.docs.set("profiles/aisha", { id: "aisha", name: "Aisha Rahman", badges: ["new-to-uni", "international"], dna });
  h.docs.set("profiles/priya", { id: "priya", name: "Priya Shah", badges: ["first-gen"], dna });
});

describe("POST /api/projects/merge", () => {
  it("returns a ProofResult with runId for pod_demo01 issue 0", async () => {
    const res = await post({ podId: "pod_demo01", issueIndex: 0 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(ProofResultZ.safeParse(json.data).success).toBe(true);
    expect(json.data).toMatchObject({
      podId: "pod_demo01", issueIndex: 0, userId: "aisha", skillId: "docker", skillName: "Docker", reviewerUserId: "priya",
      readinessBefore: 0.38, badgesEarned: ["shipped"], momentumPoints: 5, runId: "run_merge",
    });
    expect(json.data.readinessAfter).toBeGreaterThan(0.38);
    expect(json.data.evidenceIds).toHaveLength(2);
    expect(json.data.message).toMatch(/^Docker is now proven on Aisha's Bridge Map · readiness 38% → \d+%$/);
  });

  it("returns 404 not_found for an unknown pod or issue", async () => {
    const res = await post({ podId: "pod_nope", issueIndex: 0 });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await post({ podId: "pod_demo01", issueIndex: 42 })).status).toBe(404);
  });

  it("returns 400 bad_request for invalid input", async () => {
    for (const b of [{}, { podId: "pod_demo01" }, { podId: "pod_demo01", issueIndex: -1 }, { podId: "", issueIndex: 0 }, "not json"]) {
      const res = await post(b);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
    }
  });
});

describe("GET /api/projects/progress", () => {
  it("returns an empty merged list when nothing is merged yet", async () => {
    const res = await progress("?podId=pod_demo01");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { podId: "pod_demo01", merged: [] } });
  });

  it("lists merged issues after a merge", async () => {
    await post({ podId: "pod_demo01", issueIndex: 0, prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8" });
    const json = await (await progress("?podId=pod_demo01")).json();
    expect(ProjectProgressZ.safeParse(json.data).success).toBe(true);
    expect(json.data.merged).toEqual([
      expect.objectContaining({ issueIndex: 0, userId: "aisha", skillId: "docker", prUrl: "https://github.com/keystone-demo/pod-vision-demo/pull/8" }),
    ]);
    expect(json.data.id).toBeUndefined();
  });

  it("returns 400 without a podId", async () => {
    expect((await progress("")).status).toBe(400);
    expect((await progress("?podId=")).status).toBe(400);
  });
});
