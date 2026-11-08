// P5 · "Students like you". Shared by GET /api/trajectories/similar and the `find_students_like_me` tool.
import "server-only";
import { loadTrajectories, similarTrajectories } from "@/lib/agents/trajectories";
import { getStore } from "@/lib/store";
import type { Profile, Trajectory } from "@/lib/types";

export type SimilarJourney = { trajectory: Trajectory; similarity: number };

/** Top `limit` senior journeys most like the user's (never their own), or null when there is no profile. */
export async function similarForUser(
  userId: string,
  opts: { limit?: number; demo?: boolean; runId?: string } = {},
): Promise<SimilarJourney[] | null> {
  const profile = await getStore().get<Profile>("profiles", userId);
  if (!profile) return null;
  const all = await loadTrajectories({ demo: opts.demo });
  // Never suggest a student's own journey back to them.
  const others = all.filter((t) => t.userId !== userId);
  return similarTrajectories(profile, others, opts.limit ?? 5, opts.runId);
}
