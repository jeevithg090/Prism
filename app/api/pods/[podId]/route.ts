// STUB (P5 PR1): GET /api/pods/[podId] → a stored pod, or the demo fixture for its id.
import podFixture from "@/data/fixtures/pod.aisha.json";
import { getStore } from "@/lib/store";
import { PodIdParamZ, PodZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import type { Pod } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ podId: string }> }) {
  try {
    const parsed = PodIdParamZ.safeParse(await ctx.params);
    if (!parsed.success) return badRequest(parsed.error);
    const { podId } = parsed.data;
    const fixture = PodZ.parse(podFixture);
    const pod = (await getStore().get<Pod>("pods", podId)) ?? (podId === fixture.id ? fixture : null);
    if (!pod) return fail(404, "not_found", `No pod ${podId}`);
    return ok(pod);
  } catch {
    return internal();
  }
}
