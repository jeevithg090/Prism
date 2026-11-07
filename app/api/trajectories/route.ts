// P5 · GET /api/trajectories?programmeId= → Trajectory[] (contract §6)
import { loadTrajectories } from "@/lib/agents/trajectories";
import { badRequest, internal, ok, TrajectoriesQueryZ } from "@/lib/schemas/community";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const parsed = TrajectoriesQueryZ.safeParse({ programmeId: sp.get("programmeId") ?? undefined });
    if (!parsed.success) return badRequest(parsed.error);
    const trajectories = await loadTrajectories({ programmeId: parsed.data.programmeId, demo: sp.get("demo") === "1" });
    return ok(trajectories);
  } catch {
    return internal();
  }
}
