// P5 · GET /api/pods/insights?programmeId= → PodInsights (anonymous peer-teaching stats; n ≥ 10 only).
import { z } from "zod";
import { computePodInsights } from "@/lib/agents/peerInsights";
import { countPods, loadCohort } from "@/lib/agents/cohort";
import { badRequest, internal, ok } from "@/lib/schemas/community";

const QueryZ = z.object({ programmeId: z.string().trim().min(1, "programmeId is required") });

export async function GET(req: Request) {
  try {
    const parsed = QueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const { programmeId } = parsed.data;
    // Same path in DEMO_MODE: the store is seeded from fixtures and this is pure counting, so it's instant.
    const [{ profiles, skills }, podsCount] = await Promise.all([loadCohort(programmeId), countPods()]);
    return ok(computePodInsights({ programmeId, profiles, skills, podsCount }));
  } catch {
    return internal();
  }
}
