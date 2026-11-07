// P5 · Badges from stored activity. Shared by GET /api/badges/[userId] and the `get_momentum` tool.
import "server-only";
import { badgeContext, computeBadges } from "@/lib/badges";
import { getStore } from "@/lib/store";
import type { BadgeId, HelpRequest, InterviewFeedback, Pod, Profile } from "@/lib/types";

/** The user's current badges, or null when there is no profile. */
export async function loadBadges(userId: string): Promise<BadgeId[] | null> {
  const store = getStore();
  const profile = await store.get<Profile>("profiles", userId);
  if (!profile) return null;
  const [help, pods, interviews] = await Promise.all([
    store.list<HelpRequest>("help"),
    store.list<Pod>("pods"),
    store.list<InterviewFeedback>("interviews", { userId }),
  ]);
  return computeBadges(profile, badgeContext(userId, { help, pods, interviews }));
}
