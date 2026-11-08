import "server-only";
// LeetCode connector (P2): the public GraphQL numbers → algorithms + data-structures evidence, conservatively.
// One POST per sync; the op key holds only the handle, so a re-sync replays the same recording (lib/replay.ts).
// LeetCode no longer exposes per-topic tags (Sql, Python…) on the public API, so we map nothing else.
import { emit } from "@/lib/agents/events";
import { listEvidence } from "@/lib/graph/data";
import { replayOrRecord } from "@/lib/replay";
import { getStore } from "@/lib/store";
import type { EvidenceItem, Level } from "@/lib/types";

export type LeetCodeCount = { difficulty?: unknown; count?: unknown };
export type LeetCodeBeat = { difficulty?: unknown; percentage?: unknown };
export type LeetCodeProfile = {
  username?: unknown;
  /** { ranking, reputation, solutionCount } — live-verified 8 Nov 2026. */
  profile?: { ranking?: unknown; reputation?: unknown; solutionCount?: unknown } | null;
  /** Deliberately `unknown`: the public schema drifts, so every field is re-validated at runtime. */
  submitStatsGlobal?: { acSubmissionNum?: unknown } | null;
  problemsSolvedBeatsStats?: unknown;
};
export type LeetCodeRecentAc = { title?: unknown; titleSlug?: unknown; timestamp?: unknown };
export type LeetCodeEnvelope = {
  matchedUser?: LeetCodeProfile | null;
  recentAcSubmissionList?: LeetCodeRecentAc[] | null;
};

export const LEVEL_1_TOTAL = 25; // solved problems before the first evidence items
export const LEVEL_2_TOTAL = 150; // at which both skills reach level 2
export const CONFIDENCE_L1 = 0.6; // LeetCode counts are self-reported tables: never stronger than this
export const CONFIDENCE_DS_L1 = 0.55;

const DIFFICULTY_KEYS = ["all", "easy", "medium", "hard"] as const;

/** Accepted-submission counts by difficulty ("all", "easy", "medium", "hard"); invalid entries skipped. */
export function problemCounts(profile?: LeetCodeProfile | null): { all?: number; easy?: number; medium?: number; hard?: number } {
  const out: { all?: number; easy?: number; medium?: number; hard?: number } = {};
  const nums = profile?.submitStatsGlobal?.acSubmissionNum;
  if (!Array.isArray(nums)) return out;
  for (const e of nums as unknown as LeetCodeCount[]) {
    const d = e?.difficulty;
    const n = e?.count;
    if (typeof d !== "string" || !((DIFFICULTY_KEYS as readonly string[]).includes(d.toLowerCase()))) continue;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) continue;
    out[d.toLowerCase() as keyof typeof out] = n;
  }
  return out;
}

/** The verified beat percentage, preferring Medium; null when LeetCode reports none (0-100 float live). */
export function beatsPercentile(profile?: LeetCodeProfile | null): { difficulty: string; pct: number } | null {
  const beats = profile?.problemsSolvedBeatsStats;
  if (!Array.isArray(beats)) return null;
  const ok: { difficulty: string; pct: number }[] = [];
  for (const b of beats as unknown as LeetCodeBeat[]) {
    if (typeof b?.difficulty !== "string" || !b.difficulty) continue;
    if (typeof b?.percentage !== "number" || !Number.isFinite(b.percentage) || b.percentage < 0 || b.percentage > 100) continue;
    ok.push({ difficulty: b.difficulty, pct: b.percentage });
  }
  return ok.find((b) => b.difficulty === "Medium") ?? ok[0] ?? null;
}

/** Newest recent accepted problem with a usable title, newest first by the epoch-seconds timestamp. */
export function newestRecentAc(recentAc?: LeetCodeRecentAc[] | null): { title: string; titleSlug: string } | null {
  if (!Array.isArray(recentAc)) return null;
  const ts = (r: LeetCodeRecentAc) => (typeof r?.timestamp === "number" && Number.isFinite(r.timestamp) ? r.timestamp : 0);
  const valid = recentAc
    .filter(
      (r): r is { title: string; titleSlug: string; timestamp?: unknown } =>
        typeof r?.title === "string" && !!r.title && typeof r?.titleSlug === "string" && !!r.titleSlug,
    )
    .sort((a, b) => ts(b) - ts(a));
  return valid.length ? { title: valid[0].title, titleSlug: valid[0].titleSlug } : null;
}

/** "12 easy, 22 medium and 11 hard" — a readable list with the final comma swapped for " and ". */
function countBits(c: { easy?: number; medium?: number; hard?: number }): string {
  const rows: [string, number | undefined][] = [
    ["easy", c.easy],
    ["medium", c.medium],
    ["hard", c.hard],
  ];
  const bits: string[] = [];
  for (const [d, n] of rows) if (typeof n === "number" && n > 0) bits.push(`${n} ${d}`);
  const flat = bits.join(", ");
  return bits.length > 1 ? flat.replace(/, ([^,]*)$/, " and $1") : flat;
}

/**
 * Solved-problem numbers → evidence for the two things proven public practice on LeetCode (algorithms and
 * data-structures), at conservative ≤ 2 levels. Ids are deterministic, so re-syncs upsert in place. Pure.
 */
export function leetCodeToEvidence(
  userId: string,
  profile?: LeetCodeProfile | null,
  recentAc?: LeetCodeRecentAc[] | null,
  now = new Date(),
): EvidenceItem[] {
  const c = problemCounts(profile);
  const total = c.all;
  if (typeof total !== "number" || total < LEVEL_1_TOTAL) return [];
  const level = (total >= LEVEL_2_TOTAL ? 2 : 1) as Level;
  const strong = total >= LEVEL_2_TOTAL;
  const rank = profile?.profile?.ranking;
  const beat = beatsPercentile(profile);
  const homeUrl = typeof profile?.username === "string" && profile.username ? `https://leetcode.com/${profile.username}/` : "https://leetcode.com/";

  const base = typeof rank === "number" && Number.isFinite(rank) ? `Ranked ${rank} on LeetCode with ${total} problems solved` : `${total} problems solved on LeetCode`;
  const algorithmsQuote = beat ? `${base}, beating ${Math.round(beat.pct)}% of users on ${beat.difficulty} problems` : base;

  const bits = countBits(c);
  const dsBase = bits ? `${bits} problems solved on LeetCode` : `${total} problems solved on LeetCode`;
  const recent = newestRecentAc(recentAc);
  const dataStructuresQuote = recent ? `${dsBase}; most recent: ${recent.title}` : dsBase;

  return [
    {
      id: `ev_${userId}_algorithms_leetcode`,
      userId,
      skillId: "algorithms",
      level,
      confidence: strong ? 0.75 : CONFIDENCE_L1,
      source: "leetcode" as const,
      url: homeUrl,
      quote: algorithmsQuote,
      createdAt: now.toISOString(),
    },
    {
      id: `ev_${userId}_data-structures_leetcode`,
      userId,
      skillId: "data-structures",
      level,
      confidence: strong ? 0.7 : CONFIDENCE_DS_L1,
      source: "leetcode" as const,
      url: recent ? `https://leetcode.com/problems/${recent.titleSlug}/` : homeUrl,
      quote: dataStructuresQuote,
      createdAt: now.toISOString(),
    },
  ];
}

/** The public profile read, live-verified with a real account (8 Nov 2026): profile + submissions + beats + recent AC. */
const PROFILE_QUERY = `query ksEvidence($username: String!) {
  matchedUser(username: $username) {
    username
    profile {
      ranking
      reputation
      solutionCount
    }
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
    problemsSolvedBeatsStats {
      difficulty
      percentage
    }
  }
  recentAcSubmissionList(username: $username, limit: 5) {
    title
    titleSlug
    timestamp
  }
}`;

/** A public LeetCode GraphQL read. Demo toggle: replayed from the recorded run, so the map built from it matches. */
function getJSON(username: string): Promise<LeetCodeEnvelope> {
  return replayOrRecord<LeetCodeEnvelope>(
    "leetcode",
    { op: "profile", username },
    async () => {
      const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", referer: "https://leetcode.com" },
        body: JSON.stringify({ query: PROFILE_QUERY, variables: { username } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`LeetCode ${res.status}`);
      const j = (await res.json()) as { data?: LeetCodeEnvelope; errors?: { message?: string }[] };
      const gqlError = j.errors?.find((e) => typeof e?.message === "string")?.message;
      if (gqlError) throw new Error(`LeetCode: ${gqlError}`);
      if (!j.data?.matchedUser) throw new Error(`No LeetCode profile for @${username}`);
      return j.data;
    },
    {
      loose: false,
      meta: { kind: "leetcode", label: `profile ${username}` },
      validate: (v) => v !== null && typeof v === "object",
      // A "user does not exist" response is never recorded, so Demo replays real profiles only.
      shouldRecord: (v) => !!v && v.matchedUser != null,
    },
  );
}

/**
 * Reads the public LeetCode numbers for a handle and turns them into evidence. Saves each item to the store. On any
 * LeetCode failure it emits an error-status event and returns the evidence you already have.
 */
export async function syncLeetCodeEvidence(input: { userId: string; handle: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, handle, runId } = input;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "evidence", status, message, data });
  };
  say("started", `Evidence Agent: reading LeetCode for @${handle}`);
  try {
    const { matchedUser, recentAcSubmissionList: recent } = await getJSON(handle);
    const recentList = Array.isArray(recent) ? recent : [];
    const total = problemCounts(matchedUser).all;
    say(
      "progress",
      `read ${recentList.length} recent accepted submissions · ${total ?? 0} problems solved in total`,
      { solved: total ?? 0, recent: recentList.length },
    );
    const items = leetCodeToEvidence(userId, matchedUser, recentList);
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
    const level2 = items.filter((e) => e.level >= 2).length;
    say("done", `found ${items.length} skills from your LeetCode record (${level2} at level 2)`, { skills: items.length, level2 });
    return listEvidence(userId);
  } catch (err) {
    say("error", "LeetCode wasn't available just now: keeping the evidence we already have", { reason: err instanceof Error ? err.message : "unknown" });
    return listEvidence(userId);
  }
}
