// STUB (P5 PR1): POST /api/guides/find → Aisha's guide suggestions fixture ([] for other users).
import guidesFixture from "@/data/fixtures/guides.aisha.json";
import { GuideSuggestionZ, GuidesFindReqZ, badRequest, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  try {
    const parsed = GuidesFindReqZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error);
    return ok(parsed.data.userId === "aisha" ? GuideSuggestionZ.array().parse(guidesFixture) : []);
  } catch {
    return internal();
  }
}
