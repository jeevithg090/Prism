// P5 · GET /api/trajectories/similar?userId=&limit=5 → { trajectory, similarity }[] (contract §6)
import { newRunId } from "@/lib/agents/events";
import { loadTrajectories, similarTrajectories } from "@/lib/agents/trajectories";
import { badRequest, fail, internal, ok, TrajectoriesSimilarQueryZ } from "@/lib/schemas/community";
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = TrajectoriesSimilarQueryZ.safeParse({ userId: sp.get("userId") ?? undefined, limit: sp.get("limit") ?? undefined });
    if (!parsed.success) return badRequest(parsed.error);
    const { userId, limit } = parsed.data;

    const profile = await getStore().get<Profile>("profiles", userId);
    if (!profile) return fail(404, "not_found", `We couldn't find a profile for ${userId}.`);

    const all = await loadTrajectories({ demo: sp.get("demo") === "1" });
    // Never suggest a student's own journey back to them.
    const others = all.filter((t) => t.userId !== userId);
    const runId = sp.get("runId") || newRunId();
    return ok(await similarTrajectories(profile, others, limit, runId));
  } catch {
    return internal();
  }
}
