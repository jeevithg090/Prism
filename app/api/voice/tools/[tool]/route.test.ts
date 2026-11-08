import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`) ?? null),
    list: async (c: string) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => structuredClone(d)),
    upsert: async (c: string, id: string, doc: unknown) => { h.docs.set(`${c}/${id}`, doc); return doc; },
    remove: async () => {},
  }),
}));
vi.mock("@/lib/llm", () => ({ llmJSON: async () => { throw new Error("no_key"); }, llmText: vi.fn(), LLMError: class extends Error {} }));

import { POST } from "./route";

const env = { ...process.env };
const call = (tool: string, body: unknown, secret = "s3cret") => POST(
  new Request(`http://localhost/api/voice/tools/${tool}`, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-keystone-secret": secret } : {}) }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ tool }) },
);
beforeEach(() => {
  h.docs.clear();
  process.env.KEYSTONE_SHARED_SECRET = "s3cret";
  h.docs.set("profiles/aisha", { id: "aisha", name: "Aisha Rahman", year: 1, programmeId: "uom-bsc-cs", badges: ["new-to-uni"], interests: ["computer vision"], dna: { targetRoles: ["ml-engineer"] } });
});
afterEach(() => { process.env = { ...env }; });

describe("POST /api/voice/tools/[tool]", () => {
  it("401s without the secret and 404s on an unknown tool", async () => {
    expect((await call("get_profile", { userId: "aisha" }, "")).status).toBe(401);
    expect((await call("delete_user", {})).status).toBe(404);
  });
  it("get_profile returns the person and the interview topic", async () => {
    const { data } = await (await call("get_profile", { userId: "aisha" })).json();
    expect(data).toMatchObject({ name: "Aisha Rahman", targetRole: "ML engineer", pr_title: "Containerise the captioning API with Docker" });
    expect((await call("get_profile", { userId: "ghost" })).status).toBe(404);
  });
  it("get_role_skills lists the role's skills with shares of ads", async () => {
    const { data } = await (await call("get_role_skills", { roleId: "ml-engineer", userId: "aisha" })).json();
    expect(data.roleName).toBe("ML engineer");
    expect(data.skills[0]).toMatchObject({ skillId: "python", sharePct: 62 });
  });
  it("log_interview scores and saves; save_dna clamps and stores a draft only", async () => {
    const log = await (await call("log_interview", { userId: "aisha", roleId: "ml-engineer", transcript: "user: I wrote the Dockerfile and moved pip install up so the layer cache works.", durationSec: 40 })).json();
    expect(log.data).toMatchObject({ saved: true });
    expect([...h.docs.keys()].some((k) => k.startsWith("interviews/"))).toBe(true);

    const dna = await (await call("save_dna", { userId: "aisha", hoursPerWeek: 99, theoryPractice: -5, targetRoles: ["ml-engineer"] })).json();
    expect(dna.data).toMatchObject({ saved: true, pending: true, dna: { hoursPerWeek: 40, theoryPractice: 0 } });
    expect(h.docs.get("dna_drafts/aisha")).toBeTruthy();
    expect((h.docs.get("profiles/aisha") as { dna: object }).dna).toEqual({ targetRoles: ["ml-engineer"] });
    expect((await call("save_dna", { hoursPerWeek: 5 })).status).toBe(400);
  });
});
