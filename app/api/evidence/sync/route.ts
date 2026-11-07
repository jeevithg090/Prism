// POST /api/evidence/sync {userId, githubLogin?, leetcodeUser?} → EvidenceItem[] (contract §6).
// DEMO_MODE: the user's fixture evidence, instantly. Live: public GitHub repos → languages → skills.
import { emit, newRunId } from "@/lib/agents/events";
import { evidenceFixture, getProfile, listEvidence } from "@/lib/graph/data";
import { syncGithubEvidence } from "@/lib/graph/evidence";
import { EvidenceSyncReqZ } from "@/lib/graph/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  try {
    let body: unknown;
    try { body = await req.json(); } catch { return badRequest("Send a JSON body with a userId."); }
    const parsed = EvidenceSyncReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const { userId } = parsed.data;
    const profile = await getProfile(userId);
    if (!profile) return fail(404, "not_found", `We couldn't find a profile for ${userId}.`);
    const runId = newRunId();

    if (process.env.DEMO_MODE === "true") {
      const fixture = evidenceFixture(userId);
      const items = fixture.length ? fixture : await listEvidence(userId);
      emit({ runId, agent: "evidence", status: "done", message: `Evidence Agent: ${items.length} evidence items from saved data`, data: { items: items.length, demo: true } });
      return ok(items);
    }
    const login = parsed.data.githubLogin ?? profile.githubLogin;
    if (!login) {
      const items = await listEvidence(userId);
      emit({ runId, agent: "evidence", status: "done", message: `No GitHub username yet: kept your ${items.length} evidence items`, data: { items: items.length } });
      return ok(items);
    }
    return ok(await syncGithubEvidence({ userId, githubLogin: login, runId }));
  } catch {
    return internal();
  }
}
