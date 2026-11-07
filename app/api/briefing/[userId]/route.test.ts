import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";
import briefingFixture from "@/data/fixtures/briefing.aisha.json";
import interviewFixture from "@/data/fixtures/interview.feedback.aisha.json";
import { BriefingZ, InterviewFeedbackZ } from "@/lib/voice/schemas";

const h = vi.hoisted(() => ({ docs: new Map<string, unknown>(), llmText: vi.fn() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`) ?? null),
    list: async (c: string) => [...h.docs.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([, d]) => structuredClone(d)),
    upsert: async (c: string, id: string, doc: unknown) => { h.docs.set(`${c}/${id}`, doc); return doc; },
    remove: async () => {},
  }),
}));
vi.mock("@/lib/llm", () => ({ llmText: h.llmText, llmJSON: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/components/momentum/server", () => ({ loadMomentumWeeks: async () => [{ changePct: 12 }, { changePct: 18 }] }));

import { GET } from "./route";
import { briefingFacts, briefingScript, briefingWeekOf } from "@/lib/briefing";

const env = { ...process.env };
const get = (userId: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/briefing/${userId}`, { headers }), { params: Promise.resolve({ userId }) });
beforeEach(() => {
  h.docs.clear();
  h.llmText.mockReset().mockRejectedValue(new Error("no_key"));
  delete process.env.DEMO_MODE;
  process.env.KEYSTONE_SHARED_SECRET = "s3cret";
  h.docs.set("profiles/aisha", { id: "aisha", name: "Aisha Rahman", dna: { targetRoles: ["ml-engineer"] } });
  h.docs.set("profiles/priya", { id: "priya", name: "Priya Shah" });
  h.docs.set("pods/pod_demo01", structuredClone(podFixture));
});
afterEach(() => { process.env = { ...env }; });

describe("fixtures", () => {
  it("parse with their schemas", () => {
    expect(BriefingZ.safeParse(briefingFixture).success).toBe(true);
    expect(InterviewFeedbackZ.safeParse(interviewFixture).success).toBe(true);
    expect(interviewFixture).toMatchObject({ scores: { content: 4, structure: 3, clarity: 4, confidence: 3 }, fillerWordsPerMin: 6.2 });
  });
});

describe("GET /api/briefing/[userId]", () => {
  it("401s without the secret outside DEMO_MODE", async () => {
    expect((await get("aisha")).status).toBe(401);
    expect((await get("aisha", { "x-keystone-secret": "nope" })).status).toBe(401);
  });
  it("answers with the secret, in DEMO_MODE, or to the signed-in user", async () => {
    expect((await get("aisha", { "x-keystone-secret": "s3cret" })).status).toBe(200);
    expect((await get("aisha", { cookie: "ks_uid=aisha" })).status).toBe(200);
    expect((await get("aisha", { cookie: "ks_uid=tom" })).status).toBe(401);
    process.env.DEMO_MODE = "true";
    h.llmText.mockClear();
    const res = await get("aisha");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(BriefingZ.safeParse(data).success).toBe(true);
    expect(data.topTasks).toHaveLength(3);
    expect(data.script).toContain("Docker");
    expect(data.script).toContain("up 18%");
    expect(data.script).toContain("Pod Orbit");
    expect(data.marketMoves[0]).toMatch(/41% of ML engineer ads/);
    expect(h.llmText).not.toHaveBeenCalled();
  });
});

describe("buildBriefing data", () => {
  it("passes the focus skill and the momentum % to the LLM, and keeps the rule script if it fails", async () => {
    const res = await get("aisha", { "x-keystone-secret": "s3cret" });
    const { data } = await res.json();
    const facts = JSON.parse(h.llmText.mock.calls[0][0].user);
    expect(facts).toMatchObject({ focus: "Docker", momentumPct: 18, podName: "Pod Orbit" });
    expect(data.script).toBe(briefingScript(await briefingFacts("aisha")));
    expect(data.script).toMatch(/^Good morning, Aisha\./);
  });
  it("targets next Monday at the weekend and this Monday in the week", () => {
    expect(briefingWeekOf(new Date("2026-11-07T12:00:00Z"))).toBe("2026-11-09");
    expect(briefingWeekOf(new Date("2026-11-11T12:00:00Z"))).toBe("2026-11-09");
    expect(briefingWeekOf(new Date("2026-11-09T07:00:00Z"))).toBe("2026-11-09");
  });
});
