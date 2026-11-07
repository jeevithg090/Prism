// P5 · POST /api/guides/find {userId} → GuideSuggestion[] ("learn from practitioners").
// Limit: 3 drafts a day per user (store collection `guides_usage`, doc `${userId}:${YYYY-MM-DD}`).
// DEMO_MODE (or ?demo=1) returns data/fixtures/guides.aisha.json, still counting usage.
// We only draft messages: the student sends them themselves. Logic: lib/community/guides.ts.
import { findGuidesForUser, GuidesError } from "@/lib/community/guides";
import { GuidesFindReqZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { withReplayInfo } from "@/lib/replay";

async function handlePOST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Body must be JSON.");
    }
    const parsed = GuidesFindReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);

    const demo = new URL(req.url).searchParams.get("demo") === "1";
    const { guides } = await findGuidesForUser(parsed.data.userId, { demo });
    return ok(guides);
  } catch (e) {
    if (e instanceof GuidesError) return fail(e.code === "not_found" ? 404 : 429, e.code, e.message);
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const POST = withReplayInfo(handlePOST);
