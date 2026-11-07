// GET /api/trends?skills=docker,python&demo=1&runId= → TrendSeries[] (contract §6).
// History from HN "Who is hiring?" posts; the projection and label are computed by the forecaster's OLS fit.
import { getTrends } from "@/lib/agents/trends";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { TrendsQueryZ } from "@/lib/schemas/data";
import { withReplayInfo } from "@/lib/replay";

async function handleGET(req: Request) {
  try {
    const query = TrendsQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!query.success) return badRequest(query.error);
    const { skills, runId } = query.data;
    const demo = process.env.DEMO_MODE === "true" || query.data.demo;
    return ok(await getTrends(skills, { runId, demo }));
  } catch {
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const GET = withReplayInfo(handleGET);
