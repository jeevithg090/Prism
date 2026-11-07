import { after } from "next/server";
import { z } from "zod";
import { ProfileNotFoundError, runOnboarding } from "@/lib/agents/orchestrator";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

// POST /api/onboard/run {userId} → {runId} (contract §6). The pipeline runs after the response is sent;
// watch it on GET /api/agents/stream?runId=. `demo: true` forces the replay (the panel's "Replay demo run").
const OnboardRunReqZ = z.object({
  userId: z.string().trim().min(1).max(64),
  demo: z.boolean().optional(),
  programmeUrl: z.string().url().max(500).optional(),
});

function schedule(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    void work(); // outside a request scope (tests, scripts)
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Send JSON like {"userId":"aisha"}.');
  }
  const parsed = OnboardRunReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { userId, demo, programmeUrl } = parsed.data;
  try {
    const { runId } = await runOnboarding(userId, { demo, programmeUrl, schedule });
    return ok({ runId }, 202);
  } catch (e) {
    if (e instanceof ProfileNotFoundError) return fail(404, "not_found", `We couldn't find a profile for "${userId}". Finish onboarding first.`);
    return internal();
  }
}

// Vercel: the after() pipeline and the SSE stream need longer than the default function timeout.
export const maxDuration = 300;
