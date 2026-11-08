import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelpRequest, InterviewFeedback, Pod, Profile } from "@/lib/types";

const db = vi.hoisted(() => ({ rows: {} as Record<string, { id: string; doc: unknown; userId?: string }[]> }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => (db.rows[c] ?? []).find((r) => r.id === id)?.doc ?? null,
    list: async (c: string, f?: { userId?: string }) => (db.rows[c] ?? []).filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc),
    upsert: async () => undefined,
    remove: async () => undefined,
  }),
}));

import { GET } from "./route";

const NOW = new Date("2026-11-07T12:00:00Z");
const put = (c: string, id: string, doc: unknown, userId?: string) => (db.rows[c] ??= []).push({ id, doc, userId });
const call = (userId: string) => GET(new Request(`http://localhost/api/badges/${userId}`), { params: Promise.resolve({ userId }) });

const profile: Profile = {
  id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-10-08", badges: ["new-to-uni", "international"],
  interests: [], availability: [],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 70, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
};
const help = (id: string, toUserId: string, status: HelpRequest["status"]): HelpRequest =>
  ({ id, fromUserId: "leo", toUserId, kind: "question", message: "Help with Git?", status, createdAt: NOW.toISOString() });
const interview = (scores: InterviewFeedback["scores"]): InterviewFeedback =>
  ({ userId: "aisha", roleId: "ml-engineer", scores, fillerWordsPerMin: 3, strengths: [], improvements: [], createdAt: NOW.toISOString() });
const pod: Pod = {
  id: "pod_demo01", name: "Pod Aurora", score: 0.82, explanations: [], createdAt: NOW.toISOString(),
  members: ["aisha", "priya"].map((userId) => ({ userId, learns: [], teaches: [], role: "" })),
  project: { title: "VisionAid", pitch: "p", milestones: [], issues: [], repoUrl: "https://github.com/keystone-demo/pod-vision-demo" },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.rows = {};
});
afterEach(() => vi.useRealTimers());

describe("GET /api/badges/[userId]", () => {
  it("combines opt-in badges with earned ones from help, pods and interviews", async () => {
    put("profiles", "aisha", profile, "aisha");
    put("help", "h1", help("h1", "aisha", "accepted"), "leo");
    put("help", "h2", help("h2", "aisha", "done"), "mei");
    put("help", "h3", help("h3", "aisha", "open"), "tom");
    put("pods", pod.id, pod, "aisha");
    put("interviews", "i1", interview({ content: 4, structure: 3, clarity: 4, confidence: 3 }), "aisha");
    put("interviews", "i2", interview({ content: 4, structure: 4, clarity: 4, confidence: 4 }), "aisha");
    const res = await call("aisha");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: ["new-to-uni", "international", "helper", "shipped", "interview-ready"] });
  });

  it("only returns opt-in badges when nothing has been earned", async () => {
    put("profiles", "aisha", { ...profile, startedAt: "2026-06-01" }, "aisha");
    put("help", "h1", help("h1", "aisha", "accepted"), "leo");
    put("pods", "p2", { ...pod, members: [{ userId: "priya", learns: [], teaches: [], role: "" }] }, "priya");
    expect(await (await call("aisha")).json()).toEqual({ ok: true, data: ["international"] });
  });

  it("returns 404 when there is no profile", async () => {
    const res = await call("ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
