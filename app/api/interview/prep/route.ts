// P5 · POST /api/interview/prep {userId, roleId?, runId?} → a gap-tailored interview question bank + prep roadmap.
// GET (query params) is also accepted so the dashboard card can read it directly.
// Follows the app/api/interview/feedback/route.ts idiom: zod, badRequest/internal/ok, wrapped with withReplayInfo.
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { z } from "zod";
import { withReplayInfo } from "@/lib/replay";
import { buildInterviewPrep } from "@/lib/agents/interview-prep";

const PrepReqZ = z.object({
  userId: z.string().min(1, "userId is required"),
  roleId: z.string().optional(),
  runId: z.string().optional(),
});

async function readBody(req: Request): Promise<{ body: unknown; error?: Response }> {
  try {
    return { body: await req.json() };
  } catch {
    return { body: undefined, error: badRequest("Body must be JSON like {\"userId\":\"aisha\",\"roleId\":\"ml-engineer\",\"runId\":\"run_abc\"}") };
  }
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let parsed: ReturnType<typeof PrepReqZ.safeParse>;
  if (req.method === "GET") {
    parsed = PrepReqZ.safeParse({ userId: url.searchParams.get("userId") ?? undefined, roleId: url.searchParams.get("roleId") ?? undefined });
  } else {
    const { body, error } = await readBody(req);
    if (error) return error; // already a Response (e.g. bad JSON body)
    parsed = PrepReqZ.safeParse(body);
  }
  if (!parsed.success) return badRequest(parsed.error);
  const { data } = parsed;

  try {
    const prep = await buildInterviewPrep({
      userId: data.userId,
      ...(data.roleId ? { roleId: data.roleId } : {}),
      ...(data.runId ? { runId: data.runId } : {}),
    });
    return ok(prep);
  } catch {
    return internal();
  }
}

export const POST = withReplayInfo(handle);
export const GET = withReplayInfo(handle);
