// STUB (P5 PR1): POST /api/pods/match → the demo pod fixture. Replaced by the real matchmaker (PR2).
import podFixture from "@/data/fixtures/pod.aisha.json";
import { getStore } from "@/lib/store";
import { PodMatchReqZ, PodZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import type { Profile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const parsed = PodMatchReqZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error);
    const profile = await getStore().get<Profile>("profiles", parsed.data.userId);
    if (!profile) return fail(404, "not_found", `No profile for ${parsed.data.userId}`);
    return ok(PodZ.parse(podFixture));
  } catch {
    return internal();
  }
}
