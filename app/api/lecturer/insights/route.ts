// GET /api/lecturer/insights?programmeId= → { gaps, labIdeas } (contract §6, F14 Teaching pillar).
// Aggregated and anonymous: no user ids, names or per-student rows ever leave this route; < 10 students → nothing shown.
import { buildLecturerInsights } from "@/lib/agents/lecturer";
import { withCache } from "@/lib/cache";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { LecturerInsightsZ, LecturerQueryZ } from "@/lib/schemas/lecturer";

export async function GET(req: Request) {
  try {
    const parsed = LecturerQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const { programmeId } = parsed.data;
    const demo = process.env.DEMO_MODE === "true";
    // DEMO_MODE: a warmed cache / fixture if present, else the deterministic path (no LLM call), so it's instant.
    const raw = await withCache(`lecturer-insights-${programmeId}`, () => buildLecturerInsights(programmeId, { demo }), {
      ttlSec: 300,
      fixture: `lecturer.${programmeId}.json`,
    });
    // Guarantee the exact contract shape even if a cached file drifted.
    const checked = LecturerInsightsZ.safeParse(raw);
    return ok(checked.success ? checked.data : await buildLecturerInsights(programmeId, { demo: true }));
  } catch {
    return internal();
  }
}
