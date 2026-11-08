import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";

const h = vi.hoisted(() => ({ docs: new Map<string, unknown>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`) ?? null),
    list: async (c: string, f?: { userId?: string }) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => structuredClone(d))
      .filter((d) => !f?.userId || (d as { userId?: string }).userId === f.userId),
    upsert: async (c: string, id: string, doc: unknown) => { h.docs.set(`${c}/${id}`, doc); return doc; },
    remove: async () => {},
  }),
}));

import { GET } from "./route";

const get = (q: string) => GET(new Request(`http://localhost/api/interview/config${q}`));
const env = { ...process.env };
beforeEach(() => {
  h.docs.clear();
  vi.restoreAllMocks();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_INTERVIEW_AGENT_ID;
  h.docs.set("profiles/aisha", { id: "aisha", name: "Aisha Rahman", year: 1, dna: { targetRoles: ["ml-engineer"] }, badges: [] });
  h.docs.set("profiles/priya", { id: "priya", name: "Priya Shah", year: 2, dna: { targetRoles: ["ml-engineer"] }, badges: [] });
  h.docs.set("pods/pod_demo01", structuredClone(podFixture));
});
afterEach(() => { process.env = { ...env }; });

describe("GET /api/interview/config", () => {
  it("400s without a userId", async () => {
    expect((await get("")).status).toBe(400);
  });

  it("asks about Aisha's pod issue and runs Practice mode without ElevenLabs env", async () => {
    const res = await get("?userId=aisha&roleId=ml-engineer");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.agentId).toBe("practice");
    expect(data.signedUrl).toBeUndefined();
    expect(data.dynamicVariables).toMatchObject({
      name: "Aisha", role: "ML engineer", pr_title: "Containerise the captioning API with Docker", pr_skill: "Docker",
      pr_status: "in progress", reviewer: "Priya", pod_name: "Pod Orbit", project_title: "VisionAid: accessible image captioning API",
      week_focus: "Docker",
    });
    expect(Object.values(data.dynamicVariables).every((v) => typeof v === "string")).toBe(true);
    expect(data.dynamicVariables.gaps).toContain("Docker");
  });

  it("uses the latest merged pod PR from pod_progress", async () => {
    h.docs.set("pod_progress/pod_demo01", { id: "pod_demo01", podId: "pod_demo01", merged: [
      { issueIndex: 0, userId: "aisha", skillId: "docker", mergedAt: "2026-11-03T10:00:00Z" },
      { issueIndex: 4, userId: "aisha", skillId: "pytorch", mergedAt: "2026-11-06T10:00:00Z" },
    ] });
    const { data } = await (await get("?userId=aisha")).json();
    expect(data.dynamicVariables).toMatchObject({ pr_title: "Add PyTorch batch inference and a caption quality check", pr_skill_id: "pytorch", pr_status: "merged" });
  });

  it("falls back to the demo story for a user with no pod", async () => {
    const { data } = await (await get("?userId=nobody&roleId=data-analyst")).json();
    expect(data.dynamicVariables).toMatchObject({ pr_title: "Containerise the captioning API with Docker", role: "Data analyst" });
  });

  it("returns a signed URL when ElevenLabs is configured, and Practice mode if that call fails", async () => {
    process.env.ELEVENLABS_API_KEY = "xi_test";
    process.env.ELEVENLABS_INTERVIEW_AGENT_ID = "agent_123";
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_123&conversation_signature=x" }));
    const { data } = await (await get("?userId=aisha")).json();
    expect(data).toMatchObject({ agentId: "agent_123", signedUrl: expect.stringMatching(/^wss:\/\//) });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/convai/conversation/get-signed-url?agent_id=agent_123");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi_test");

    f.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const again = await (await get("?userId=aisha")).json();
    expect(again.data.agentId).toBe("practice");
  });
});
