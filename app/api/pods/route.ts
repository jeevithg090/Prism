// STUB (P5 PR1): GET /api/pods?userId= → pods in the store that contain the user.
import { getStore } from "@/lib/store";
import { PodsListQueryZ, badRequest, internal, ok } from "@/lib/schemas/community";
import type { Pod } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const parsed = PodsListQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const { userId } = parsed.data;
    const pods = await getStore().list<Pod>("pods");
    return ok(pods.filter((p) => p.members.some((m) => m.userId === userId)));
  } catch {
    return internal();
  }
}
