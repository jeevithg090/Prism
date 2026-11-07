// GET  /api/labs/changereq?userId=aisha → the plan, the open change request, past requests and versions.
// POST /api/labs/changereq {action: refresh | approve | reject | comment | revert, userId, …} → the result + state.
// Agents propose, the student decides: only approve and revert change the roadmap, and both are student actions.
import { ActionReqZ, StateQueryZ } from "@/lib/labs/changereq/types";
import {
  approveChangeRequest, ChangeReqError, commentOnChangeRequest, getChangeReqState, openChangeRequest, rejectChangeRequest, revertToVersion,
} from "@/lib/labs/changereq/service";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

function failFor(e: unknown): Response {
  if (e instanceof ChangeReqError) return fail(e.status, e.code, e.message);
  return internal();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = StateQueryZ.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!q.success) return badRequest(q.error);
    return ok(await getChangeReqState(q.data.userId));
  } catch (e) {
    return failFor(e);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Send a JSON body with an action and a userId."); }
  const parsed = ActionReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const a = parsed.data;
  try {
    switch (a.action) {
      case "refresh": {
        const r = await openChangeRequest(a.userId, { runId: a.runId });
        return ok({ runId: r.runId, message: r.message, reused: r.reused, state: await getChangeReqState(a.userId) });
      }
      case "approve": {
        const r = await approveChangeRequest(a.userId, a.id, { runId: a.runId });
        return ok({ runId: r.runId, message: `Roadmap v${r.roadmap.version} is live.`, version: r.roadmap.version, state: await getChangeReqState(a.userId) });
      }
      case "reject": {
        const r = await rejectChangeRequest(a.userId, a.id, { reason: a.reason, runId: a.runId });
        return ok({ runId: r.runId, message: `Change request #${r.changeRequest.number} closed. Your roadmap is unchanged.`, state: await getChangeReqState(a.userId) });
      }
      case "comment": {
        const r = await commentOnChangeRequest(a.userId, a.id, a.text, { runId: a.runId });
        return ok({ runId: r.runId, message: r.changeRequest.comments.at(-1)?.text ?? "", state: await getChangeReqState(a.userId) });
      }
      case "revert": {
        const r = await revertToVersion(a.userId, a.toVersion, { runId: a.runId });
        return ok({ runId: r.runId, message: `Roadmap v${r.roadmap.version} restores v${a.toVersion}.`, version: r.roadmap.version, state: await getChangeReqState(a.userId) });
      }
    }
  } catch (e) {
    return failFor(e);
  }
}
