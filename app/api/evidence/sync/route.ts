// POST /api/evidence/sync {userId, githubLogin?, leetcodeUser?, codeforcesLogin?, stackoverflowId?, devtoUser?, hackerrankLogin?}
// → EvidenceItem[] (contract §6). DEMO_MODE: the user's fixture evidence, instantly. Live: every source the user has a
// handle for (request body wins over the saved profile), run one after another; each connector degrades instead of
// throwing, so one dead source never sinks the others.
import { emit, newRunId } from "@/lib/agents/events";
import { evidenceFixture, getProfile, listEvidence } from "@/lib/graph/data";
import { syncGithubEvidence } from "@/lib/graph/evidence";
import { syncLeetCodeEvidence } from "@/lib/connectors/leetcode";
import { syncCodeforcesEvidence } from "@/lib/connectors/codeforces";
import { syncStackOverflowEvidence } from "@/lib/connectors/stackoverflow";
import { syncDevtoEvidence } from "@/lib/connectors/devto";
import { syncHackerRankEvidence } from "@/lib/connectors/hackerrank";
import type { EvidenceItem } from "@/lib/types";
import { EvidenceSyncReqZ } from "@/lib/graph/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { withReplayInfo } from "@/lib/replay";

async function handlePOST(req: Request) {
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
    const d = parsed.data;
    const github = d.githubLogin ?? profile.githubLogin;
    const handles: [string | undefined, (h: string) => Promise<EvidenceItem[]>][] = [
      [github, (h) => syncGithubEvidence({ userId, githubLogin: h, runId })],
      [d.leetcodeUser ?? profile.leetcodeUser, (h) => syncLeetCodeEvidence({ userId, handle: h, runId })],
      [d.codeforcesLogin ?? profile.codeforcesLogin, (h) => syncCodeforcesEvidence({ userId, handle: h, runId })],
      [d.stackoverflowId ?? profile.stackoverflowId, (h) => syncStackOverflowEvidence({ userId, handle: h, runId })],
      [d.devtoUser ?? profile.devtoUser, (h) => syncDevtoEvidence({ userId, handle: h, runId })],
      [d.hackerrankLogin ?? profile.hackerrankLogin, (h) => syncHackerRankEvidence({ userId, handle: h, runId })],
    ];
    const todo = handles.filter(([h]) => h);
    if (!todo.length) {
      const items = await listEvidence(userId);
      emit({ runId, agent: "evidence", status: "done", message: `No usernames yet: kept your ${items.length} evidence items`, data: { items: items.length } });
      return ok(items);
    }
    let items: EvidenceItem[] = [];
    for (const [h, sync] of todo) items = await sync(h as string);
    return ok(items);
  } catch {
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const POST = withReplayInfo(handlePOST);
