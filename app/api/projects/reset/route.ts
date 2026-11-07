// P5 · POST /api/projects/reset {podId} → {podId, cleared}. Presenter reset for the seeded demo pod: undoes
// every "Mark as merged" so the proof moment can be shown again. Only the demo pod can be reset.
import { z } from "zod";
import { NotFoundError, resetPodProofs } from "@/lib/agents/proof";
import { DEMO_FIXTURE_POD_ID as DEMO_POD_ID } from "@/lib/agents/matchmaker";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

const ReqZ = z.object({ podId: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest(`Body must be JSON like {"podId":"${DEMO_POD_ID}"}`);
  }
  const parsed = ReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  if (parsed.data.podId !== DEMO_POD_ID) {
    return fail(403, "forbidden", `Only the demo pod (${DEMO_POD_ID}) can be reset.`);
  }
  try {
    return ok(await resetPodProofs(parsed.data.podId));
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
