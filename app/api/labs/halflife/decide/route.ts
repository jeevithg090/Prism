// POST /api/labs/halflife/decide { programmeId, moduleCode, decision: "adopted" | "dismissed", note? } → Decision.
// The human checkpoint: the module lead adopts (optionally edited) or dismisses a drafted refresh note.
// Saved in the `curriculum_refresh` collection; nothing is sent, published or changed in the syllabus.
import { decideRefresh, HalfLifeError } from "@/lib/labs/halflife/agent";
import { DecideReqZ } from "@/lib/labs/halflife/schema";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("body: send JSON");
  }
  try {
    const parsed = DecideReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    return ok(await decideRefresh(parsed.data), 201);
  } catch (e) {
    if (e instanceof HalfLifeError) return fail(e.code === "not_found" ? 404 : 400, e.code, e.message);
    return internal();
  }
}
