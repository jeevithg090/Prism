import { readDemoPod } from "@/lib/agents/matchmaker";
import { badRequest, fail, internal, ok, PodIdParamZ, PodZ } from "@/lib/schemas/community";
import { getStore } from "@/lib/store";

// GET /api/pods/[podId] → Pod, or 404 not_found. Contract §6.
export async function GET(_req: Request, ctx: { params: Promise<{ podId: string }> }) {
  const parsed = PodIdParamZ.safeParse(await ctx.params);
  if (!parsed.success) return badRequest(parsed.error);
  const { podId } = parsed.data;
  const demo = process.env.DEMO_MODE === "true";
  const demoPod = () => {
    const pod = demo ? readDemoPod() : null;
    return pod && pod.id === podId ? pod : null;
  };
  try {
    const found = PodZ.safeParse(await getStore().get("pods", podId));
    if (found.success) return ok(found.data);
    const fallback = demoPod();
    return fallback ? ok(fallback) : fail(404, "not_found", `No pod ${podId}.`);
  } catch {
    const fallback = demoPod();
    return fallback ? ok(fallback) : internal();
  }
}
