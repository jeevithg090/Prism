// STUB (P5 PR1): GET /api/trajectories/similar?userId=&limit= → the first `limit` trajectories, similarity 0.5.
import { getStore } from "@/lib/store";
import { TrajectoriesSimilarQueryZ, badRequest, internal, ok } from "@/lib/schemas/community";
import type { Trajectory } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const parsed = TrajectoriesSimilarQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const all = await getStore().list<Trajectory>("trajectories");
    return ok(all.slice(0, parsed.data.limit).map((trajectory) => ({ trajectory, similarity: 0.5 })));
  } catch {
    return internal();
  }
}
