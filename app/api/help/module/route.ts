// P5 · POST /api/help/module: ask for help with a module concept, routed to helpers who proved that skill.
// Body: { fromUserId, moduleCode?, concept?, skillId?, message }. Contract §6 / UC-3.
import { z } from "zod";
import { createModuleHelpRequest } from "@/lib/agents/module-help";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { withReplayInfo } from "@/lib/replay";

const ModuleHelpReqZ = z.object({
  fromUserId: z.string().min(1),
  moduleCode: z.string().optional(),
  concept: z.string().optional(),
  skillId: z.string().optional(),
  message: z.string().trim().min(1, "message is required").max(1000),
});

async function handlePOST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"fromUserId\":\"aisha\",\"message\":\"...\"}.");
  }
  const parsed = ModuleHelpReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const request = await createModuleHelpRequest(parsed.data);
    return ok(request);
  } catch {
    return internal();
  }
}

/** Demo toggle: the envelope says whether its values were replayed from a real run (lib/replay.ts). */
export const POST = withReplayInfo(handlePOST);
