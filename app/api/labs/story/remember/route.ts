// Keystone Labs · Story Mode. POST /api/labs/story/remember {confirm: true, beatsSeen} → MemoryNote.
// The human checkpoint: the signed-in student (from the session cookie, never the body) agrees, and the Coach
// remembers they've watched the story. Without confirm:true nothing is written.
import { rememberStory } from "@/lib/labs/story/remember";
import { RememberReqZ } from "@/lib/labs/story/schema";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { getCurrentUserId } from "@/lib/session";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body must be JSON like {"confirm":true,"beatsSeen":10}');
  }
  const parsed = RememberReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const userId = await getCurrentUserId();
    return ok(await rememberStory(userId, parsed.data.beatsSeen), 201);
  } catch {
    return internal();
  }
}
