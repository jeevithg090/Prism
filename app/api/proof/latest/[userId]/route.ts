// P5 · GET /api/proof/latest/[userId] → LatestProof | null: the newest merged pod PR (or, before anything merges,
// the demo pod issue you're working on, flagged isDemo). The voice coach passes `dynamicVariables` to ElevenLabs
// so the mock interview asks about the PR you just merged.
import { getLatestProof } from "@/lib/agents/ladder";
import { badRequest, internal, ok, UserIdParamZ } from "@/lib/schemas/community";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserIdParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    return ok(await getLatestProof(params.data.userId));
  } catch {
    return internal();
  }
}
