// GET /api/labs/halflife?programmeId=&horizonYears= → HalfLifeReport (Skill Half-life Radar).
// Programme-level and anonymous: the cohort only appears as a role mix, and only for groups of 10 or more.
import { buildHalfLifeReport, HalfLifeError } from "@/lib/labs/halflife/agent";
import { HalfLifeQueryZ } from "@/lib/labs/halflife/schema";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(req: Request) {
  try {
    const parsed = HalfLifeQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const { demo, ...q } = parsed.data;
    const { report } = await buildHalfLifeReport(q, demo ? { demo: true } : {});
    return ok(report);
  } catch (e) {
    if (e instanceof HalfLifeError) return fail(e.code === "not_found" ? 404 : 400, e.code, e.message);
    return internal();
  }
}
