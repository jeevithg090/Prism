// Keystone Labs · Agent Council.
//   GET  /api/labs/council?userId=aisha[&session=council_…] → CouncilOverview (motions to debate, past sessions, current one)
//   POST /api/labs/council {userId, skillId?, week?, question?, runId?} → CouncilSession (three advocates, rebuttals, ruling)
// The council only advises: nothing in the roadmap changes here (see ./decide for the student's decision).
import { conveneCouncil, CouncilNotFoundError, getCouncilOverview } from "@/lib/labs/council/council";
import { ConveneReqZ, OverviewQueryZ } from "@/lib/labs/council/types";
import { newRunId } from "@/lib/agents/events";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = OverviewQueryZ.safeParse(params);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await getCouncilOverview(parsed.data.userId, parsed.data.session));
  } catch (e) {
    if (e instanceof CouncilNotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"userId\":\"aisha\",\"skillId\":\"docker\",\"week\":1}");
  }
  const parsed = ConveneReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await conveneCouncil({ ...parsed.data, runId: parsed.data.runId ?? newRunId() }));
  } catch (e) {
    if (e instanceof CouncilNotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
