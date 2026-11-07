// Keystone Labs · Viva Check.
//   GET  /api/labs/viva?userId=aisha[&sessionId=…]  → VivaOverview: your PRs, your vivas, your reviewer queue, one session
//   POST /api/labs/viva {userId, source?}             → VivaSession: up to three questions written from that PR's diff
import { newRunId } from "@/lib/agents/events";
import { getOverview, startViva } from "@/lib/labs/viva/agent";
import { actingAs, readBody, toResponse } from "@/lib/labs/viva/http";
import { OverviewQueryZ, StartReqZ } from "@/lib/labs/viva/model";
import { badRequest, ok } from "@/lib/schemas/community";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = OverviewQueryZ.safeParse({ userId: url.searchParams.get("userId") ?? undefined, sessionId: url.searchParams.get("sessionId") ?? undefined });
  if (!parsed.success) return badRequest(parsed.error);
  const denied = actingAs(req, parsed.data.userId);
  if (denied) return denied;
  try {
    return ok(await getOverview(parsed.data.userId, parsed.data.sessionId));
  } catch (e) {
    return toResponse(e);
  }
}

export async function POST(req: Request) {
  const body = await readBody(req, StartReqZ, `{"userId":"aisha","source":{"kind":"pod-issue","podId":"pod_demo01","issueIndex":0}}`);
  if ("res" in body) return body.res;
  const denied = actingAs(req, body.data.userId);
  if (denied) return denied;
  try {
    return ok(await startViva(body.data.userId, body.data.source, newRunId()), 201);
  } catch (e) {
    return toResponse(e);
  }
}
