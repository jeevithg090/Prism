// PATCH /api/roadmap/[userId]/tasks/[taskId] {done} → RoadmapTask. Finishing a week records a momentum milestone.
import { setTaskDone, TaskNotFoundError } from "@/lib/agents/roadmap";
import { TaskParamZ, TaskPatchReqZ } from "@/lib/graph/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string; taskId: string }> }) {
  try {
    const params = TaskParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    let body: unknown;
    try { body = await req.json(); } catch { return badRequest("Send a JSON body like {\"done\": true}."); }
    const parsed = TaskPatchReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const result = await setTaskDone(params.data.userId, params.data.taskId, parsed.data.done);
    if (!result) return fail(404, "not_found", "No roadmap yet. Build one from your Bridge Map.");
    return ok(result.task);
  } catch (e) {
    if (e instanceof TaskNotFoundError) return fail(404, "not_found", "That task isn't in your roadmap any more. Refresh to see the latest plan.");
    return internal();
  }
}
