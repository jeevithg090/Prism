// Readiness Explained · POST /api/labs/shapley/commit { actionId, approved: true } → the student's chosen next proof,
// saved as a Coach goal note. This is the human checkpoint: the request must carry the student's explicit approval,
// and the action is recomputed on the server, so the client can't send its own numbers.
import { z } from "zod";
import { commitNextProof, NoMapError, UnknownActionError } from "@/lib/labs/shapley/agent";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { viewerOf } from "@/lib/labs/shapley/viewer";

const BodyZ = z.object({
  actionId: z.string().regex(/^(rm|ch):[a-z0-9]+(-[a-z0-9]+)*$/, "actionId looks like \"rm:docker\" or \"ch:docker\""),
  approved: z.literal(true, { error: "The student must approve this step (approved: true)." }),
  roleId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40).optional(),
});

export async function POST(req: Request) {
  try {
    let body: unknown;
    try { body = await req.json(); } catch { return badRequest("Send a JSON body like { \"actionId\": \"rm:docker\", \"approved\": true }."); }
    const parsed = BodyZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const result = await commitNextProof(viewerOf(req), parsed.data.actionId, { roleId: parsed.data.roleId });
    return ok(result);
  } catch (err) {
    if (err instanceof NoMapError || err instanceof UnknownActionError) return fail(404, "not_found", err.message);
    return internal();
  }
}
