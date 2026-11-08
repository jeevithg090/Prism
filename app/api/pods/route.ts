import { listPodsForUser, readDemoPod } from "@/lib/agents/matchmaker";
import { badRequest, internal, ok, PodsListQueryZ } from "@/lib/schemas/community";

// GET /api/pods?userId= → Pod[] whose members include the user, newest first. Contract §6.
export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId") ?? undefined;
  const parsed = PodsListQueryZ.safeParse({ userId });
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await listPodsForUser(parsed.data.userId));
  } catch {
    if (process.env.DEMO_MODE === "true") {
      const pod = readDemoPod();
      return ok(pod && pod.members.some((m) => m.userId === parsed.data.userId) ? [pod] : []);
    }
    return internal();
  }
}
