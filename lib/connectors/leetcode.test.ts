import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit, newRunId: () => "run_test" }));

import { getStore, resetStore } from "@/lib/store";
import type { EvidenceItem } from "@/lib/types";
import {
  CONFIDENCE_DS_L1,
  CONFIDENCE_L1,
  LEVEL_1_TOTAL,
  LEVEL_2_TOTAL,
  beatsPercentile,
  leetCodeToEvidence,
  newestRecentAc,
  problemCounts,
  syncLeetCodeEvidence,
} from "./leetcode";

const NOW = new Date("2026-11-08T10:00:00Z");

/**
 * Live-verified shapes (captured from leetcode.com/graphql on 8 Nov 2026 with the official "LeetCode" account,
 * see the ops notes in the PR): profile {ranking, reputation, solutionCount}, submitStatsGlobal.acSubmissionNum,
 * problemsSolvedBeatsStats (percentage is a 0-100 float) and recentAcSubmissionList. The official account had
 * no recent accepted submissions, so those rows carry the verified field names only.
 */
const OK = {
  matchedUser: {
    username: "LeetCode",
    profile: { ranking: 2971222, reputation: 79164, solutionCount: 6620 },
    submitStatsGlobal: {
      acSubmissionNum: [
        { difficulty: "All", count: 45 },
        { difficulty: "Easy", count: 12 },
        { difficulty: "Medium", count: 22 },
        { difficulty: "Hard", count: 11 },
      ],
    },
    problemsSolvedBeatsStats: [
      { difficulty: "Easy", percentage: 34.65 },
      { difficulty: "Medium", percentage: 57.42 },
      { difficulty: "Hard", percentage: 64.79 },
    ],
  },
  recentAcSubmissionList: [
    { title: "Tallest Billboard", titleSlug: "tallest-billboard", timestamp: 1729987200 },
    { title: "3Sum", titleSlug: "3sum", timestamp: 1729710000 },
  ],
};

/** 4× the accepted counts, still under the real-question totals: enough to cross LEVEL_2_TOTAL. */
const BIG = JSON.parse(JSON.stringify(OK)) as typeof OK;
for (const row of BIG.matchedUser.submitStatsGlobal?.acSubmissionNum ?? []) row.count *= 4;

const seed = (userId: string): EvidenceItem => ({
  id: `ev_${userId}_other-github`,
  userId,
  skillId: "python",
  level: 1,
  confidence: 0.5,
  source: "github",
  url: "https://github.com/octocat/hello",
  createdAt: NOW.toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});
afterEach(() => vi.restoreAllMocks());

describe("constants", () => {
  it("keeps the agreed thresholds and the ≤ 0.85 confidence cap", () => {
    expect([LEVEL_1_TOTAL, LEVEL_2_TOTAL, CONFIDENCE_L1, CONFIDENCE_DS_L1]).toEqual([25, 150, 0.6, 0.55]);
  });
});

describe("problemCounts", () => {
  it("reads the verified difficulty counts and skips invalid rows", () => {
    expect(problemCounts(OK.matchedUser)).toEqual({ all: 45, easy: 12, medium: 22, hard: 11 });
    expect(
      problemCounts({
        submitStatsGlobal: {
          acSubmissionNum: [
            { difficulty: "All", count: -3 },
            { difficulty: "All", count: "22" },
            { difficulty: "ALLL", count: 9 },
            { difficulty: "All" },
          ],
        },
      }),
    ).toEqual({});
  });
  it("returns {} without submitStatsGlobal or nothing usable", () => {
    expect(problemCounts(null)).toEqual({});
    expect(problemCounts({ submitStatsGlobal: { acSubmissionNum: 5 } })).toEqual({});
  });
});

describe("beatsPercentile", () => {
  it("prefers Medium and falls back to the first valid row", () => {
    expect(beatsPercentile(OK.matchedUser)).toEqual({ difficulty: "Medium", pct: 57.42 });
    expect(beatsPercentile({ problemsSolvedBeatsStats: [{ difficulty: "Hard", percentage: 12.4 }] })).toEqual({ difficulty: "Hard", pct: 12.4 });
  });
  it("skips invalid percentages", () => {
    expect(beatsPercentile({ problemsSolvedBeatsStats: [{ difficulty: "Medium", percentage: 200 }, { percentage: 10 }] })).toBeNull();
    expect(beatsPercentile({})).toBeNull();
  });
});

describe("newestRecentAc", () => {
  it("takes the newest usable row regardless of the given order", () => {
    expect(newestRecentAc(OK.recentAcSubmissionList)).toEqual({ title: "Tallest Billboard", titleSlug: "tallest-billboard" });
    expect(newestRecentAc([...OK.recentAcSubmissionList].reverse())).toEqual({ title: "Tallest Billboard", titleSlug: "tallest-billboard" });
  });
  it("skips garbage rows and returns null when nothing is usable", () => {
    expect(newestRecentAc([{ title: "x", titleSlug: "" }, { title: 5 }, {}])).toBeNull();
    expect(newestRecentAc(null)).toBeNull();
  });
});

describe("leetCodeToEvidence (pure mapper)", () => {
  it("maps the live-verified numbers into both skills at level 1 with the hard facts quoted", () => {
    const items = leetCodeToEvidence("u1", OK.matchedUser, OK.recentAcSubmissionList, NOW);
    expect(items.map((e) => [e.id, e.skillId, e.level, e.confidence])).toEqual([
      ["ev_u1_algorithms_leetcode", "algorithms", 1, 0.6],
      ["ev_u1_data-structures_leetcode", "data-structures", 1, 0.55],
    ]);
    expect(items.every((e) => e.userId === "u1" && e.source === "leetcode" && e.createdAt === NOW.toISOString())).toBe(true);
    expect(items[0].url).toBe("https://leetcode.com/LeetCode/");
    expect(items[0].quote).toBe("Ranked 2971222 on LeetCode with 45 problems solved, beating 57% of users on Medium problems");
    expect(items[1].url).toBe("https://leetcode.com/problems/tallest-billboard/");
    expect(items[1].quote).toBe("12 easy, 22 medium and 11 hard problems solved on LeetCode; most recent: Tallest Billboard");
  });

  it("reaches level 2 once LEVEL_2_TOTAL problems are solved, confidence still 0.75 at most", () => {
    const items = leetCodeToEvidence("u1", BIG.matchedUser, [], NOW);
    expect(items.map((e) => e.level)).toEqual([2, 2]);
    expect(items.map((e) => e.confidence)).toEqual([0.75, 0.7]);
    expect(items[1].quote).toBe("48 easy, 88 medium and 44 hard problems solved on LeetCode");
    expect(items[1].url).toBe("https://leetcode.com/LeetCode/"); // no recent submissions → the profile page
  });

  it("returns no items under LEVEL_1_TOTAL or when the total is missing", () => {
    const few = JSON.parse(JSON.stringify(OK)) as typeof OK;
    for (const row of few.matchedUser.submitStatsGlobal?.acSubmissionNum ?? []) row.count = Math.min(row.count, 24);
    expect(leetCodeToEvidence("u1", few.matchedUser, OK.recentAcSubmissionList, NOW)).toEqual([]);
    expect(leetCodeToEvidence("u1", { submitStatsGlobal: { acSubmissionNum: [{ difficulty: "Medium", count: 99 }] } }, [], NOW)).toEqual([]);
    expect(leetCodeToEvidence("u1", null, OK.recentAcSubmissionList, NOW)).toEqual([]);
  });

  it("quotes the total with no percentile or rank when LeetCode reports neither", () => {
    const plain = { submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 30 }] } };
    const items = leetCodeToEvidence("u1", plain, [], NOW);
    expect(items[0].quote).toBe("30 problems solved on LeetCode");
    expect(items[0].url).toBe("https://leetcode.com/");
    expect(items[1].quote).toBe("30 problems solved on LeetCode");
    const user = { username: "someone", submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 30 }] } };
    expect(leetCodeToEvidence("u1", user, [], NOW)[0].url).toBe("https://leetcode.com/someone/");
  });
});

describe("syncLeetCodeEvidence", () => {
  it("happy path: one GraphQL POST, items upserted, full list returned, started → progress → done", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: OK }));
    const items = await syncLeetCodeEvidence({ userId: "lc-happy", handle: "LeetCode", runId: "run_lc" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://leetcode.com/graphql");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ query: expect.stringContaining("matchedUser"), variables: { username: "LeetCode" } });
    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "progress", "done"]);
    const [started, progress, done] = emit.mock.calls.map((c) => c[0]);
    expect(started.message).toBe("Evidence Agent: reading LeetCode for @LeetCode");
    expect(progress.message).toBe("read 2 recent accepted submissions · 45 problems solved in total");
    expect(progress.data).toEqual({ solved: 45, recent: 2 });
    expect(done.message).toBe("found 2 skills from your LeetCode record (0 at level 2)");
    expect(items.map((e) => e.id)).toEqual(["ev_lc-happy_algorithms_leetcode", "ev_lc-happy_data-structures_leetcode"]);
    expect(items.map((e) => e.skillId)).toEqual(["algorithms", "data-structures"]);
    expect(items[0]).toMatchObject({ level: 1, confidence: 0.6 });
    expect(Number.isNaN(Date.parse(items[0].createdAt))).toBe(false);
    expect(await getStore().get<EvidenceItem>("evidence", "ev_lc-happy_algorithms_leetcode")).toEqual(items[0]);
    expect(items.every((e) => e.userId === "lc-happy" && e.source === "leetcode")).toBe(true);
  });

  it("without a runId nothing is emitted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: OK }));
    const items = await syncLeetCodeEvidence({ userId: "lc-quiet", handle: "LeetCode" });
    expect(emit).not.toHaveBeenCalled();
    expect(items).toHaveLength(2);
  });

  it("LeetCode down: no throw, one error event, the evidence you already have", async () => {
    await getStore().upsert("evidence", seed("lc-down").id, seed("lc-down"), "lc-down");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("gateway", { status: 503 }));
    const items = await syncLeetCodeEvidence({ userId: "lc-down", handle: "LeetCode", runId: "run_lc_down" });
    expect(items).toEqual([expect.objectContaining({ id: "ev_lc-down_other-github", userId: "lc-down" })]);
    expect(await getStore().get("evidence", "ev_lc-down_algorithms_leetcode")).toBeNull();
    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "error"]);
    const last = emit.mock.calls.at(-1)![0];
    expect(last.message).toContain("keeping the evidence we already have");
    expect(last.data).toEqual({ reason: "LeetCode 503" });
  });

  it("unknown handle (GraphQL error body) fails kindly instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ errors: [{ message: "That user does not exist." }] }));
    const items = await syncLeetCodeEvidence({ userId: "lc-ghost", handle: "no_such_user_id", runId: "run_ghost" });
    expect(items).toEqual([]);
    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "error"]);
    expect(emit.mock.calls.at(-1)![0].data).toEqual({ reason: "LeetCode: That user does not exist." });
  });

  it("a network failure fails kindly too", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const items = await syncLeetCodeEvidence({ userId: "lc-off", handle: "LeetCode", runId: "run_off" });
    expect(items).toEqual([]);
    expect(emit.mock.calls.at(-1)![0].status).toBe("error");
    expect(emit.mock.calls.at(-1)![0].data).toEqual({ reason: "offline" });
  });

  it("empty or garbage profile data: done, no error, no bogus items", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { matchedUser: { submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 5 }] } }, recentAcSubmissionList: [{ title: "", titleSlug: "" }] } }));
    const items = await syncLeetCodeEvidence({ userId: "lc-empty", handle: "LeetCode", runId: "run_empty" });
    expect(items).toEqual([]);
    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "progress", "done"]);
    expect(emit.mock.calls.at(-1)![0].message).toBe("found 0 skills from your LeetCode record (0 at level 2)");
  });
});
