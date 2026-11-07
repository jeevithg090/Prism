// Pure helpers for the Community page (no React, no network): easy to unit test.
import type { HelpRequest, Profile } from "@/lib/types";

export type ProfilesById = Record<string, Profile | undefined>;

export const KIND_LABEL: Record<HelpRequest["kind"], string> = {
  question: "Question",
  "chat-15": "15-min chat",
  "code-review": "Code review",
};

export const KIND_OPTIONS = (Object.keys(KIND_LABEL) as HelpRequest["kind"][]).map((value) => ({ value, label: KIND_LABEL[value] }));

/** Display name from a profile, falling back to the capitalised user id. */
export function displayName(userId: string, profile?: Profile): string {
  return profile?.name?.trim() || userId.charAt(0).toUpperCase() + userId.slice(1);
}

export function isNewcomer(profile?: Profile): boolean {
  return profile?.badges?.includes("new-to-uni") ?? false;
}

const ts = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Help feed order: requests from 🌱 new-to-uni students first, then newest first. Does not mutate. */
export function sortHelpFeed(requests: HelpRequest[], profilesById: ProfilesById): HelpRequest[] {
  return [...requests].sort((a, b) => {
    const na = isNewcomer(profilesById[a.fromUserId]) ? 1 : 0;
    const nb = isNewcomer(profilesById[b.fromUserId]) ? 1 : 0;
    if (na !== nb) return nb - na;
    return ts(b.createdAt) - ts(a.createdAt);
  });
}

export type HelperCount = { userId: string; count: number };

/**
 * "Helpers this week": accepted or done requests created in the last 7 days, grouped by helper.
 * Top `limit` by count (ties broken by user id so the order is stable).
 */
export function helpersThisWeek(requests: HelpRequest[], now: Date = new Date(), limit = 5): HelperCount[] {
  const since = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();
  for (const r of requests) {
    if (r.status === "open" || !r.toUserId) continue;
    const t = ts(r.createdAt);
    if (t < since || t > now.getTime()) continue;
    counts.set(r.toUserId, (counts.get(r.toUserId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
    .slice(0, limit);
}
