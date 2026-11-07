import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => h.docs.get(`${c}/${id}`) ?? null,
    list: async (c: string) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => d),
    upsert: async (c: string, id: string, doc: unknown) => { h.docs.set(`${c}/${id}`, doc); return doc; },
    remove: async () => {},
  }),
}));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_cb", subscribe: vi.fn() }));

import { POST } from "./route";

const env = { ...process.env };
const post = (body: unknown, secret?: string) => POST(new Request("http://localhost/api/n8n/callback", {
  method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-keystone-secret": secret } : {}) }, body: JSON.stringify(body),
}));
beforeEach(() => {
  h.docs.clear();
  vi.restoreAllMocks();
  process.env.KEYSTONE_SHARED_SECRET = "s3cret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  h.docs.set("profiles/aisha", { id: "aisha", dna: { targetRoles: ["ml-engineer"] } });
  h.docs.set("profiles/tom", { id: "tom", dna: { targetRoles: ["data-analyst"] } });
});
afterEach(() => { process.env = { ...env }; });

describe("POST /api/n8n/callback", () => {
  it("401s without the secret or with a wrong one", async () => {
    const res = await post({ workflow: "market-refresh", result: {} });
    expect(res.status).toBe(401);
    expect((await res.json()).ok).toBe(false);
    expect((await post({ workflow: "x", result: {} }, "nope")).status).toBe(401);
  });

  it("re-plans roadmaps for profiles whose role skills moved", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
    const res = await post({ workflow: "market-refresh", result: { moved: ["docker"] } }, "s3cret");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ ok: true, replanned: 1 });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.test/api/roadmap/generate");
    expect(JSON.parse(String(init.body))).toEqual({ userId: "aisha", roleId: "ml-engineer" });
  });

  it("answers 200 with replanned 0 for an unknown workflow", async () => {
    const res = await post({ workflow: "something-else", result: {} }, "s3cret");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ok: true, replanned: 0 });
  });

  it("stores the Discord channel from pod-kickoff", async () => {
    h.docs.set("pods/pod_demo01", { id: "pod_demo01", name: "Pod Orbit", members: [{ userId: "aisha" }] });
    const res = await post({ workflow: "pod-kickoff", result: { podId: "pod_demo01", discordChannelUrl: "https://discord.com/channels/1/2" } }, "s3cret");
    expect((await res.json()).data.updated).toBe(true);
    expect((h.docs.get("pods/pod_demo01") as { discordChannelUrl: string }).discordChannelUrl).toBe("https://discord.com/channels/1/2");
  });
});
