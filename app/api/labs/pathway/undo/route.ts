// POST /api/labs/pathway/undo {demo?} → restores the roadmap from before "Add to roadmap" (if nothing changed since).
import { newRunId } from "@/lib/agents/events";
import { PathwayError, undoPathway, viewerFrom } from "@/lib/labs/pathway/agent";
import { UndoReqZ } from "@/lib/labs/pathway/types";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const parsed = UndoReqZ.safeParse(body ?? {});
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await undoPathway(viewerFrom(req, parsed.data.demo), { runId: newRunId() }));
  } catch (e) {
    if (e instanceof PathwayError) return fail(e.code === "not_found" ? 404 : 409, e.code, e.message);
    return internal();
  }
}
