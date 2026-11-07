// Keystone Labs · Agent Council: the human checkpoint.
//   POST /api/labs/council/decide {userId, sessionId, choice: "accept" | "overrule", reason?} → {session, decision}
// "accept" follows the ruling, "overrule" keeps what the student proposed. Either way the decision, the ruling and
// the kept dissent go into the agent run ledger; a roadmap change is saved as a new roadmap version.
import { CouncilConflictError, CouncilNotFoundError, decideCouncil } from "@/lib/labs/council/council";
import { DecideReqZ } from "@/lib/labs/council/types";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"userId\":\"aisha\",\"sessionId\":\"council_…\",\"choice\":\"accept\"}");
  }
  const parsed = DecideReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await decideCouncil(parsed.data));
  } catch (e) {
    if (e instanceof CouncilNotFoundError) return fail(404, "not_found", e.message);
    if (e instanceof CouncilConflictError) return fail(409, "conflict", e.message);
    return internal();
  }
}
