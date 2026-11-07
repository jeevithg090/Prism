// P5 · GET /api/trajectories/similar?userId=&limit=5 → { trajectory, similarity }[] (contract §6)
import { newRunId } from "@/lib/agents/events";
import { similarForUser } from "@/lib/community/trajectories";
import { badRequest, fail, internal, ok, TrajectoriesSimilarQueryZ } from "@/lib/schemas/community";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = TrajectoriesSimilarQueryZ.safeParse({ userId: sp.get("userId") ?? undefined, limit: sp.get("limit") ?? undefined });
    if (!parsed.success) return badRequest(parsed.error);
    const { userId, limit } = parsed.data;

    const runId = sp.get("runId") || newRunId();
    const similar = await similarForUser(userId, { limit, demo: sp.get("demo") === "1", runId });
    if (!similar) return fail(404, "not_found", `We couldn't find a profile for ${userId}.`);
    return ok(similar);
  } catch {
    return internal();
  }
}
