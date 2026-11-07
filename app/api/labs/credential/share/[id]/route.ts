// GET    /api/labs/credential/share/[id] → SkillShare (public, by an unguessable id): what the link reveals.
// DELETE /api/labs/credential/share/[id] → ShareSummary: the student revokes their own link.
import { z } from "zod";
import { credentialFailure, viewerId } from "@/lib/labs/credential/http";
import { getShare, revokeShare } from "@/lib/labs/credential/service";
import { badRequest, ok } from "@/lib/schemas/community";

const ShareIdZ = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, "a share id is 24 hex characters") });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = ShareIdZ.safeParse(await ctx.params);
  if (!params.success) return badRequest(params.error);
  try {
    return ok(await getShare(params.data.id));
  } catch (e) {
    return credentialFailure(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = ShareIdZ.safeParse(await ctx.params);
  if (!params.success) return badRequest(params.error);
  try {
    return ok(await revokeShare(viewerId(req), params.data.id));
  } catch (e) {
    return credentialFailure(e);
  }
}
