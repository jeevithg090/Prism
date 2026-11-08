import "server-only";
// Codeforces public API → conservative evidence. Telemetry only for substantiated facts: a contest rating says
// something about algorithms and data structures (every rated problem uses them), never about specific
// languages or frameworks. Low ratings prove nothing we would claim, so they produce no items at all.
// One item per skill max, levels ≤ 2, confidence ≤ 0.8: re-syncs overwrite the same deterministic ids.
import { emit } from "@/lib/agents/events";
import { listEvidence } from "@/lib/graph/data";
import { replayOrRecord } from "@/lib/replay";
import { getStore } from "@/lib/store";
import type { EvidenceItem, Level, SkillId } from "@/lib/types";

export const RATING_LEVEL_1 = 1200; // from here: aware of both skills
export const RATING_LEVEL_2 = 1600; // from here: applies both
const STRONG_QUOTE_RATING = 1900; // from here: the quote itself says how strong this is
const CONFIDENCE_L1 = 0.6;
const CONFIDENCE_L2 = 0.7;

export type CfUser = { handle: string; rating?: number; rank?: string; maxRating?: number; maxRank?: string };
type CfUserInfo = { status: "OK" | "FAILED"; comment?: string; result?: CfUser[] };
type CfSubmission = { problem?: { name?: string } };

const RATED_SKILLS: SkillId[] = ["data-structures", "algorithms"];

/** A public Codeforces API read (no key needed; anonymous calls work, and heavy use is rate limited). */
function cfGet<T>(op: string, handle: string, path: string): Promise<T> {
  return replayOrRecord<T>(
    "codeforces",
    { op, handle },
    async () => {
      const res = await fetch(`https://codeforces.com/api${path}`, { signal: AbortSignal.timeout(8000) });
      let j: CfUserInfo | null = null;
      try { j = (await res.json()) as CfUserInfo; } catch { /* e.g. an empty body */ }
      if (j?.status !== "OK") throw new Error(j?.comment ? `Codeforces: ${j.comment}` : `Codeforces ${res.status}`);
      return j as T;
    },
    {
      loose: false,
      meta: { kind: "codeforces", label: `${op} @${handle}` },
      validate: (v) => v !== null && typeof v === "object",
      shouldRecord: (v) => (v as CfUserInfo)?.status === "OK" && !!(v as CfUserInfo).result?.length,
    },
  );
}

/** What a Codeforces rating substantiates, conservatively. Unrated or < 1200 → no items. Pure. */
export function ratingToEvidence(userId: string, user: CfUser, now = new Date()): EvidenceItem[] {
  const rating = user.rating ?? 0;
  if (rating < RATING_LEVEL_1) return [];
  const level = (rating >= RATING_LEVEL_2 ? 2 : 1) as Level;
  const confidence = rating >= RATING_LEVEL_2 ? CONFIDENCE_L2 : CONFIDENCE_L1;
  const rank = user.rank ? ` (${user.rank})` : "";
  const max = user.maxRating && user.maxRating > rating ? user.maxRating : undefined;
  const url = `https://codeforces.com/profile/${encodeURIComponent(user.handle)}`;
  const quote =
    rating >= STRONG_QUOTE_RATING
      ? `Codeforces rating ${rating}${rank} — among the top few percent of rated contest programmers`
      : `Codeforces rating ${rating}${rank}${max ? `, max ${max}` : ""} in rated contests`;
  return RATED_SKILLS.map((skillId) => ({
    id: `ev_${userId}_${skillId}_codeforces`, userId, skillId, level, confidence,
    source: "codeforces" as const, url, quote, createdAt: now.toISOString(),
  }));
}

/**
 * Reads the handle's rating (and, best effort, a sample of recent submissions — Codeforces times out often, so
 * that number never blocks the sync). Saves each item to the store. On any failure it emits an error event and
 * returns the evidence you already have; it never throws.
 */
export async function syncCodeforcesEvidence(input: { userId: string; handle: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, handle, runId } = input;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "evidence", status, message, data });
  };
  say("started", `Evidence Agent: reading Codeforces for @${handle}`);
  try {
    const user = (await cfGet<CfUserInfo>("user-info", handle, `/user.info?handles=${encodeURIComponent(handle)}`)).result?.[0];
    if (!user) throw new Error(`No Codeforces user @${handle}`);
    const submissions: CfSubmission[] | null = await cfGet<{ status: "OK"; result?: CfSubmission[] }>("user-status", handle, `/user.status?handle=${encodeURIComponent(handle)}&count=100`)
      .then((j) => j.result ?? [])
      .catch(() => null);
    say(
      "progress",
      `rating ${user.rating ?? "unrated"}${submissions ? ` · ${submissions.length} recent submissions` : ""}`,
      { rating: user.rating ?? null, rank: user.rank ?? null, submissions: submissions?.length ?? null },
    );
    const items = ratingToEvidence(userId, user);
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
    const level2 = items.filter((e) => e.level >= 2).length;
    say("done", `found ${items.length} skills from your contest rating (${level2} at level 2)`, { skills: items.length, level2 });
    return listEvidence(userId);
  } catch (err) {
    say("error", "Codeforces wasn't available just now: keeping the evidence we already have", { reason: err instanceof Error ? err.message : "unknown" });
    return listEvidence(userId);
  }
}
