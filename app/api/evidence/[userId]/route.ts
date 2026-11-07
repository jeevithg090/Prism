// GET /api/evidence/[userId] → EvidenceItem[] (store: pod proofs, challenges, GitHub sync; plus fixture evidence).
import { listEvidence } from "@/lib/graph/data";
import { UserParamZ } from "@/lib/graph/schemas";
import { badRequest, internal, ok } from "@/lib/schemas/community";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const items = await listEvidence(params.data.userId);
    return ok([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch {
    return internal();
  }
}
