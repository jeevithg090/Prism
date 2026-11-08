// Colocated unit tests for the Codeforces connector. All HTTP is mocked: no real network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRunEvents } from "@/lib/agents/events";
import { EvidenceItemZ } from "@/lib/graph/schemas";
import type { EvidenceItem } from "@/lib/types";

const h = vi.hoisted(() => ({ docs: new Map<string, { doc: unknown; userId?: string }>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) =>
      [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => {
      h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId });
      return doc;
    },
    remove: async (c: string, id: string) => { h.docs.delete(`${c}/${id}`); },
  }),
}));

import { ratingToEvidence, syncCodeforcesEvidence } from "./codeforces";

const USER_ID = "test-user";
const HANDLE = "cf-student";
let runNo = 0;
const RUN_ID = () => `run_cf_${++runNo}`;

const RATED_USER = { handle: HANDLE, rating: 1623, rank: "specialist", maxRating: 1659, maxRank: "specialist" };
const SUBMISSIONS = { status: "OK", result: [{ problem: { name: "Two Sum" } }, { problem: { name: "Merge Intervals" } }, { problem: { name: "Two Sum" } }] };
const NOT_FOUND = { status: "FAILED", comment: `handles: User with handle ${HANDLE} not found` };

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Mocks fetch the way the real API behaves: GET /user.info then GET /user.status. Unexpected URLs throw. */
const routeFetch = (info: { body: unknown; status?: number }, statusCall?: { body: unknown; status?: number }) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/user.info")) return respond(info.body, info.status ?? 200);
    if (url.includes("/user.status")) {
      if (!statusCall) throw new Error(`unexpected call ${url}`);
      return respond(statusCall.body, statusCall.status ?? 200);
    }
    throw new Error(`unexpected call ${url}`);
  });

/** One item of GitHub evidence, so every test can see a re-sync keeps the evidence you already have. */
const seedPriorEvidence = async () => {
  const prior: EvidenceItem = {
    id: "ev_test-user_python_github", userId: USER_ID, skillId: "python", level: 1, confidence: 0.5,
    source: "github", url: "https://github.com/test-user/proj", createdAt: "2026-11-01T00:00:00Z",
  };
  const { getStore } = await import("@/lib/store");
  await getStore().upsert("evidence", prior.id, prior, USER_ID);
  return prior;
};

beforeEach(() => {
  h.docs.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ratingToEvidence (pure mapper)", () => {
  it("maps a 1623 rating to level 2 Algorithms + Data structures with the verified profile URL", () => {
    const items = ratingToEvidence(USER_ID, RATED_USER);
    expect(items.map((e) => e.skillId).sort()).toEqual(["algorithms", "data-structures"]);
    for (const e of items) {
      expect(e.id).toBe(`ev_${USER_ID}_${e.skillId}_codeforces`);
      expect(e.source).toBe("codeforces");
      expect(e.level).toBe(2);
      expect(e.confidence).toBe(0.7);
      expect(e.url).toBe(`https://codeforces.com/profile/${HANDLE}`);
      expect(new Date(e.createdAt).toISOString()).toBe(e.createdAt);
      expect(EvidenceItemZ.safeParse(e).success).toBe(true);
    }
  });

  it("writes one plain-English sentence carrying the hard facts", () => {
    expect(ratingToEvidence(USER_ID, RATED_USER)[0]?.quote).toBe("Codeforces rating 1623 (specialist), max 1659 in rated contests");
  });

  it("claims only level 1 under 1600 and a stronger quote from 1900", () => {
    const beginner = ratingToEvidence(USER_ID, { handle: HANDLE, rating: 1250, rank: "pupil", maxRating: 1300 });
    expect(beginner.map((e) => e.level)).toEqual([1, 1]);
    expect(beginner[0].confidence).toBe(0.6);
    expect(beginner[0].quote).toBe("Codeforces rating 1250 (pupil), max 1300 in rated contests");

    const strong = ratingToEvidence(USER_ID, { handle: HANDLE, rating: 3408, rank: "legendary grandmaster" });
    expect(strong[0].quote).toBe("Codeforces rating 3408 (legendary grandmaster) — among the top few percent of rated contest programmers");
  });

  it("never claims a skill from an unrated or low-rated account", () => {
    expect(ratingToEvidence(USER_ID, { handle: HANDLE })).toEqual([]);
    expect(ratingToEvidence(USER_ID, { handle: HANDLE, rating: 1199 })).toEqual([]);
  });

  it("works without rank or maxRating and never exceeds level 2 or confidence 0.8", () => {
    const items = ratingToEvidence(USER_ID, { handle: HANDLE, rating: 1700 });
    expect(items[0].quote).toBe("Codeforces rating 1700 in rated contests");
    expect(items.every((e) => e.level <= 2 && e.confidence <= 0.8)).toBe(true);
  });
});

describe("syncCodeforcesEvidence", () => {
  it("fetches rating and submissions, upserts items and streams started → progress → done", async () => {
    const prior = await seedPriorEvidence();
    const spy = routeFetch({ body: { status: "OK", result: [RATED_USER] } }, { body: SUBMISSIONS });
    const runId = RUN_ID();
    const out = await syncCodeforcesEvidence({ userId: USER_ID, handle: HANDLE, runId });

    expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([
      `https://codeforces.com/api/user.info?handles=${HANDLE}`,
      `https://codeforces.com/api/user.status?handle=${HANDLE}&count=100`,
    ]);
    expect(out.map((e) => e.id)).toEqual([prior.id, "ev_test-user_data-structures_codeforces", "ev_test-user_algorithms_codeforces"]);
    for (const e of out.filter((x) => x.id !== prior.id)) {
      expect(e.source).toBe("codeforces");
      expect(e.level).toBe(2);
      expect(e.confidence).toBe(0.7);
      expect(e.url).toBe(`https://codeforces.com/profile/${HANDLE}`);
      expect(e.quote).toContain("Codeforces rating 1623");
    }

    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events.every((e) => e.agent === "evidence")).toBe(true);
    expect(events[0].message).toBe(`Evidence Agent: reading Codeforces for @${HANDLE}`);
    expect(events[1].message).toBe("rating 1623 · 3 recent submissions");
    expect(events[1].data).toMatchObject({ rating: 1623, rank: "specialist", submissions: 3 });
    expect(events[2].message).toBe("found 2 skills from your contest rating (2 at level 2)");
  });

  it("keeps going when the submissions call fails (telemetry is best effort)", async () => {
    await seedPriorEvidence();
    routeFetch({ body: { status: "OK", result: [RATED_USER] } }, { body: {}, status: 503 });
    const runId = RUN_ID();
    const out = await syncCodeforcesEvidence({ userId: USER_ID, handle: HANDLE, runId });
    expect(out.filter((e) => e.source === "codeforces")).toHaveLength(2);
    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events[1].message).toBe("rating 1623");
    expect(events[2].status).toBe("done");
  });

  it("degrades with a kind error event when the user doesn't exist (HTTP 400 FAILED payload)", async () => {
    const prior = await seedPriorEvidence();
    routeFetch({ body: NOT_FOUND, status: 400 });
    const runId = RUN_ID();
    const out = await syncCodeforcesEvidence({ userId: USER_ID, handle: HANDLE, runId });
    expect(out).toEqual([prior]);
    const events = getRunEvents(runId);
    expect(events.at(-1)?.status).toBe("error");
    expect(events.at(-1)?.agent).toBe("evidence");
    expect(events.at(-1)?.message).toBe("Codeforces wasn't available just now: keeping the evidence we already have");
    expect(String(events.at(-1)?.data?.reason)).toContain(HANDLE);
    expect(String(events.at(-1)?.data?.reason)).toContain("not found");
  });

  it("degrades when Codeforces is down (503) or fetch throws, and never rethrows", async () => {
    await seedPriorEvidence();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gateway gone", { status: 503 }));
    const runId = RUN_ID();
    await expect(syncCodeforcesEvidence({ userId: USER_ID, handle: HANDLE, runId })).resolves.toBeDefined();
    expect(getRunEvents(runId).at(-1)?.status).toBe("error");

    const runId2 = RUN_ID();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(syncCodeforcesEvidence({ userId: USER_ID, handle: HANDLE, runId: runId2 })).resolves.toBeDefined();
    expect(getRunEvents(runId2).at(-1)?.status).toBe("error");
  });

  it("unrated accounts store nothing and finish cleanly", async () => {
    await seedPriorEvidence();
    routeFetch({ body: { status: "OK", result: [{ handle: HANDLE, contribution: 0 }] } }, { body: SUBMISSIONS });
    const runId = RUN_ID();
    const out = await syncCodeforcesEvidence({ userId: USER_ID, handle: HANDLE, runId });
    expect(out.map((e) => e.source)).toEqual(["github"]);
    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events[1].message).toContain("rating unrated");
    expect(events[2].message).toBe("found 0 skills from your contest rating (0 at level 2)");
  });
});
