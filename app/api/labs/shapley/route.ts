// Readiness Explained · GET /api/labs/shapley?roleId= → { explanation, runId } for the signed-in student (ks_uid
// cookie; the demo student when there is none). Exact Shapley shares of readiness per source and per skill, the
// week-over-week change, and the best next proof per hour, plus the next proof the student already chose (if it's
// still on the plan). The run streams to the Activity panel by runId.
import { z } from "zod";
import { explainForUser, loadCommitment, NoMapError } from "@/lib/labs/shapley/agent";
import { viewerOf } from "@/lib/labs/shapley/viewer";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

const QueryZ = z.object({ roleId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "roleId must be a kebab-case role id").max(40).optional() });

export async function GET(req: Request) {
  try {
    const q = QueryZ.safeParse({ roleId: new URL(req.url).searchParams.get("roleId") || undefined });
    if (!q.success) return badRequest(q.error);
    const userId = viewerOf(req);
    const { explanation, runId } = await explainForUser(userId, { roleId: q.data.roleId });
    const saved = await loadCommitment(userId, explanation.roleId);
    const committed = saved && explanation.next.actions.some((a) => a.id === saved.actionId)
      ? { actionId: saved.actionId, noteText: saved.noteText, committedAt: saved.committedAt }
      : null;
    return ok({ explanation, runId, committed, demo: process.env.DEMO_MODE === "true" });
  } catch (err) {
    if (err instanceof NoMapError) return fail(404, "not_found", err.message);
    return internal();
  }
}
