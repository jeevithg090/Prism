// GET /api/programmes/[id] → Programme (contract §6): the warmed cache or the committed fixture (instant in every mode).
import { getProgramme } from "@/lib/agents/syllabus";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { ProgrammeParamZ } from "@/lib/schemas/data";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const parsed = ProgrammeParamZ.safeParse(await ctx.params);
    if (!parsed.success) return badRequest(parsed.error);
    const programme = getProgramme(parsed.data.id);
    if (!programme) return fail(404, "not_found", "We don't have that programme yet. Paste its course page on the onboarding screen.");
    return ok(programme);
  } catch {
    return internal();
  }
}
