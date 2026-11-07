// P5 · POST /api/coach {userId, message, history?, approval?} → CoachRes. The Keystone Coach agent.
// DEMO_MODE (or no model key) uses the deterministic rules planner, so it answers instantly offline.
import { newRunId } from "@/lib/agents/events";
import { runCoach } from "@/lib/agents/coach/loop";
import { TOOLS } from "@/lib/agents/tools/registry";
import { CoachReqZ } from "@/lib/schemas/coach";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { withReplayInfo } from "@/lib/replay";

/** The client may pick the runId so the Activity panel can stream the run live. */
const RUN_ID = /^run_[a-z0-9]{6,16}$/;

async function handlePOST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"userId\":\"aisha\",\"message\":\"What should I do this week?\"}");
  }
  const parsed = CoachReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  const requested = (body as { runId?: unknown }).runId;
  const runId = typeof requested === "string" && RUN_ID.test(requested) ? requested : newRunId();
  try {
    const res = await runCoach({
      ...parsed.data,
      tools: TOOLS,
      runId,
      planner: process.env.DEMO_MODE === "true" ? "rules" : "auto",
    });
    return ok(res);
  } catch {
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const POST = withReplayInfo(handlePOST);
