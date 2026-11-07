// P5 · GET /api/proof-ladder/[userId]?skillId= → ProofLadder: per skill, rungs Tried it → Built it → Can teach it.
import { z } from "zod";
import { getProofLadder } from "@/lib/agents/ladder";
import { badRequest, internal, ok, UserIdParamZ } from "@/lib/schemas/community";

const SkillQueryZ = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "skillId must be a kebab-case skill id").optional();

export async function GET(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserIdParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const skill = SkillQueryZ.safeParse(new URL(req.url).searchParams.get("skillId") || undefined);
    if (!skill.success) return badRequest(skill.error);
    return ok(await getProofLadder(params.data.userId, skill.data));
  } catch {
    return internal();
  }
}
