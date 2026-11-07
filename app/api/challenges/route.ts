// P5 · GET /api/challenges?userId= → ChallengeMenu: skills with a 20-minute micro-challenge, this week's focus first.
import { getChallengeMenu } from "@/lib/agents/challenges";
import { badRequest, internal, ok, UserIdParamZ } from "@/lib/schemas/community";

export async function GET(req: Request) {
  try {
    const q = UserIdParamZ.safeParse({ userId: new URL(req.url).searchParams.get("userId") ?? "" });
    if (!q.success) return badRequest("userId is required, e.g. /api/challenges?userId=aisha");
    return ok(await getChallengeMenu(q.data.userId));
  } catch {
    return internal();
  }
}
