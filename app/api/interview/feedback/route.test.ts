import { beforeEach, describe, expect, it, vi } from "vitest";
import podFixture from "@/data/fixtures/pod.aisha.json";
import { badgeContext, computeBadges } from "@/lib/badges";
import type { InterviewFeedback, Profile } from "@/lib/types";
import { InterviewResultZ } from "@/lib/voice/schemas";

const h = vi.hoisted(() => ({ docs: new Map<string, { doc: unknown; userId?: string }>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) => [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.docs.set(`${c}/${id}`, { doc, userId }); return doc; },
    remove: async () => {},
  }),
}));
vi.mock("@/lib/llm", () => ({ llmJSON: async () => { throw new Error("no_key"); }, llmText: async () => { throw new Error("no_key"); }, LLMError: class extends Error {} }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/interview/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const profile = { id: "aisha", name: "Aisha Rahman", year: 1, startedAt: "2026-09-21", badges: ["new-to-uni"], dna: { targetRoles: ["ml-engineer"] } } as unknown as Profile;

beforeEach(() => {
  h.docs.clear();
  h.docs.set("profiles/aisha", { doc: profile, userId: "aisha" });
  h.docs.set("pods/pod_demo01", { doc: structuredClone(podFixture), userId: "aisha" });
});

const good = "ai: Walk me through it.\nuser: In our pod my issue was to containerise the captioning API with Docker. I wrote the Dockerfile from a slim Python base image. I moved pip install above the COPY of the code so the layer cache works, because builds were slow. As a result builds went from 4 minutes to 20 seconds and Priya approved the merge.";

describe("POST /api/interview/feedback", () => {
  it("400s on an empty or whitespace transcript, bad JSON or a missing duration", async () => {
    expect((await post({ userId: "aisha", roleId: "ml-engineer", transcript: "", durationSec: 60 })).status).toBe(400);
    expect((await post({ userId: "aisha", roleId: "ml-engineer", transcript: "   ", durationSec: 60 })).status).toBe(400);
    expect((await post({ userId: "aisha", roleId: "ml-engineer", transcript: "user: hi" })).status).toBe(400);
    const bad = await post("{nope");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("bad_request");
  });

  it("scores, saves the interview and keystone-interview evidence, and feeds the interview-ready badge", async () => {
    const res = await post({ userId: "aisha", roleId: "ml-engineer", transcript: good, durationSec: 60 });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(InterviewResultZ.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ userId: "aisha", roleId: "ml-engineer", skillId: "docker", scoredBy: "rules" });
    expect(data.evidence.map((e: { label: string }) => e.label)).toEqual(["Communication", "Docker (explained)"]);

    const evidence = [...h.docs.entries()].filter(([k]) => k.startsWith("evidence/")).map(([, r]) => r.doc as { source: string; skillId: string; userId: string });
    expect(evidence.every((e) => e.source === "keystone-interview" && e.userId === "aisha")).toBe(true);

    const interviews = [...h.docs.entries()].filter(([k, r]) => k.startsWith("interviews/") && r.userId === "aisha").map(([, r]) => r.doc as InterviewFeedback);
    expect(interviews).toHaveLength(1);
    const ctx = badgeContext("aisha", { help: [], pods: [], interviews });
    const badges = computeBadges(profile, { ...ctx, now: new Date("2026-11-07") });
    expect(badges.includes("interview-ready")).toBe(ctx.interviewAvg! >= 3.5);
    expect(ctx.interviewAvg).toBeGreaterThanOrEqual(3.5);
  });
});
