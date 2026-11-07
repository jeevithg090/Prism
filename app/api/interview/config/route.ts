// P4 · GET /api/interview/config?userId=&roleId= → {agentId, signedUrl?, dynamicVariables}.
// With ElevenLabs keys: a signed WebSocket URL for the "Keystone Interviewer" agent (the key stays here).
// Without: agentId "practice", and /interview runs Practice mode in the browser from the same variables.
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { interviewContext } from "@/lib/voice/context";
import { conversationConfigured, getSignedConversationUrl } from "@/lib/voice/elevenlabs";
import { InterviewConfigQueryZ, PRACTICE_AGENT_ID, type InterviewConfig } from "@/lib/voice/schemas";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = InterviewConfigQueryZ.safeParse({ userId: sp.get("userId") ?? undefined, roleId: sp.get("roleId") || undefined });
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const ctx = await interviewContext(parsed.data.userId, parsed.data.roleId);
    const base: InterviewConfig = { agentId: PRACTICE_AGENT_ID, dynamicVariables: ctx.dynamicVariables };
    if (!conversationConfigured()) return ok(base);
    const agentId = process.env.ELEVENLABS_INTERVIEW_AGENT_ID!.trim();
    try {
      return ok({ agentId, signedUrl: await getSignedConversationUrl(agentId), dynamicVariables: ctx.dynamicVariables } satisfies InterviewConfig);
    } catch {
      return ok(base); // ElevenLabs is down or the key is wrong: Practice mode still works
    }
  } catch {
    return internal();
  }
}
