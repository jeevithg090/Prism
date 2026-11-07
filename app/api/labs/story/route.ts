// Keystone Labs · Story Mode. POST /api/labs/story {studentId?, roleId?} → Story: the Director agent reads every
// Keystone module for one student (Aisha by default) and returns the grounded, beat-by-beat presentation.
import { compileStory, SubjectNotFoundError } from "@/lib/labs/story/director";
import { StoryReqZ } from "@/lib/labs/story/schema";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown = {};
  const text = await req.text().catch(() => "");
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return badRequest('Body must be JSON like {"studentId":"aisha"}');
    }
  }
  const parsed = StoryReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await compileStory(parsed.data));
  } catch (e) {
    if (e instanceof SubjectNotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
