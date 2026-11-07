// GET /api/labs/pathway[?demo=1] → PathwayResult: every open placement and internship, ranked by the shortest
// learning path from the viewer's Bridge Map (the `ks_uid` cookie; `demo=1` is the demo student). Read-only.
import { newRunId } from "@/lib/agents/events";
import { findPathways, PathwayError, viewerFrom } from "@/lib/labs/pathway/agent";
import { PathwayQueryZ } from "@/lib/labs/pathway/types";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(req: Request) {
  const parsed = PathwayQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const userId = viewerFrom(req, !!parsed.data.demo);
    return ok(await findPathways(userId, { runId: newRunId(), live: true }));
  } catch (e) {
    if (e instanceof PathwayError) return fail(e.code === "not_found" ? 404 : 409, e.code, e.message);
    return internal();
  }
}
