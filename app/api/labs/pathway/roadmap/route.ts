// POST /api/labs/pathway/roadmap {opportunityId, approved?, rememberGoal?, demo?}
// approved false (the default) → a preview of the roadmap change; nothing is written.
// approved true → the student pressed "Approve and add": the path's skills move to the front of their roadmap.
import { newRunId } from "@/lib/agents/events";
import { addPathToRoadmap, PathwayError, viewerFrom } from "@/lib/labs/pathway/agent";
import { AddToRoadmapReqZ } from "@/lib/labs/pathway/types";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Send a JSON body with an opportunityId."); }
  const parsed = AddToRoadmapReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { opportunityId, approved, rememberGoal, demo } = parsed.data;
    const userId = viewerFrom(req, demo);
    return ok(await addPathToRoadmap(userId, { opportunityId, approved, rememberGoal, runId: approved ? newRunId() : undefined }));
  } catch (e) {
    if (e instanceof PathwayError) return fail(e.code === "not_found" ? 404 : 409, e.code, e.message);
    return internal();
  }
}
