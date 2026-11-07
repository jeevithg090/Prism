// P4 · POST /api/voice/tools/[tool] (header x-keystone-secret): ElevenLabs agent server tools.
//   get_profile {userId}          → who you're talking to + what the interview is about
//   get_role_skills {roleId}      → the role's most-demanded skills with their share of ads
//   log_interview {userId, roleId, transcript, durationSec} → scores + saves it (same as /api/interview/feedback)
//   save_dna {userId, …}          → a Learning DNA *draft* (dna_drafts/<userId>); the student applies it in the form
import { z } from "zod";
import { verifySecret } from "@/lib/n8n";
import { getStore } from "@/lib/store";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { interviewContext } from "@/lib/voice/context";
import { DEFAULT_ROLE, loadProfile, roleName, roleTopSkills } from "@/lib/voice/data";
import { scoreInterview } from "@/lib/voice/interviewScoring";
import { FeedbackReqZ, SaveDnaReqZ, VoiceToolZ, VOICE_TOOLS } from "@/lib/voice/schemas";

const UserZ = z.object({ userId: z.string().min(1) });
const RoleZ = z.object({ roleId: z.string().min(1).default(DEFAULT_ROLE), userId: z.string().min(1).optional() });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  if (!verifySecret(req)) return fail(401, "unauthorized", "Missing or wrong x-keystone-secret header.");
  const tool = VoiceToolZ.safeParse((await ctx.params).tool);
  if (!tool.success) return fail(404, "not_found", `Unknown tool. Use one of: ${VOICE_TOOLS.join(", ")}.`);
  let body: unknown;
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return badRequest("Body must be JSON.");
  }
  try {
    switch (tool.data) {
      case "get_profile": {
        const p = UserZ.safeParse(body);
        if (!p.success) return badRequest(p.error);
        const profile = await loadProfile(p.data.userId);
        if (!profile) return fail(404, "not_found", `No profile for "${p.data.userId}".`);
        const ic = await interviewContext(profile.id);
        return ok({
          ...ic.dynamicVariables, userId: profile.id, name: profile.name, firstName: ic.dynamicVariables.name, year: profile.year,
          programmeId: profile.programmeId, targetRole: ic.roleName, badges: profile.badges, interests: profile.interests,
        });
      }
      case "get_role_skills": {
        const p = RoleZ.safeParse(body);
        if (!p.success) return badRequest(p.error);
        const skills = await roleTopSkills(p.data.roleId, p.data.userId, 8);
        return ok({
          roleId: p.data.roleId, roleName: roleName(p.data.roleId),
          skills: skills.map((s) => ({ skillId: s.skillId, name: s.name, sharePct: Math.round(s.share * 100) })),
        });
      }
      case "log_interview": {
        const p = FeedbackReqZ.safeParse(body);
        if (!p.success) return badRequest(p.error);
        const ic = await interviewContext(p.data.userId, p.data.roleId);
        const skillId = p.data.skillId ?? ic.work.skillId;
        const r = await scoreInterview({
          ...p.data, roleName: ic.roleName, skillId, roleKeywords: ic.roleKeywords,
          prTitle: skillId === ic.work.skillId ? ic.work.issueTitle : undefined,
        });
        return ok({ saved: true, id: r.id, scores: r.scores, fillerWordsPerMin: r.fillerWordsPerMin, proof: r.evidence.map((e) => e.label) });
      }
      case "save_dna": {
        const p = SaveDnaReqZ.safeParse(body);
        if (!p.success) return badRequest(p.error);
        const { userId, hoursPerWeek, theoryPractice, ...rest } = p.data;
        const draft = {
          ...rest,
          ...(hoursPerWeek !== undefined ? { hoursPerWeek: clamp(hoursPerWeek, 1, 40) } : {}),
          ...(theoryPractice !== undefined ? { theoryPractice: clamp(theoryPractice, 0, 100) } : {}),
        };
        await getStore().upsert("dna_drafts", userId, { id: userId, userId, dna: draft, createdAt: new Date().toISOString() }, userId);
        return ok({ saved: true, pending: true, dna: draft, message: "Saved as a draft. The student checks it and taps Continue." });
      }
    }
    return fail(404, "not_found", "Unknown tool.");
  } catch {
    return internal();
  }
}
