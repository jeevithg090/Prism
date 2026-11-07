// STUB (P5 PR1): GET /api/trajectories?programmeId= → seeded trajectories from the store.
import { getStore } from "@/lib/store";
import { TrajectoriesQueryZ, badRequest, internal, ok } from "@/lib/schemas/community";
import type { Trajectory } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const parsed = TrajectoriesQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const { programmeId } = parsed.data;
    const all = await getStore().list<Trajectory>("trajectories");
    return ok(programmeId ? all.filter((t) => t.programmeId === programmeId) : all);
  } catch {
    return internal();
  }
}
