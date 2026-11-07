// P4 · POST /api/n8n/callback {workflow, result} (header x-keystone-secret) → {ok:true, …}.
// n8n reports back here: market-refresh re-plans affected roadmaps; pod-kickoff stores the Discord channel URL.
import { z } from "zod";
import { emit, newRunId } from "@/lib/agents/events";
import { verifySecret } from "@/lib/n8n";
import { getStore } from "@/lib/store";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import type { Pod, Profile } from "@/lib/types";
import { roleTopSkills } from "@/lib/voice/data";
import { CallbackReqZ } from "@/lib/voice/schemas";

const MovedZ = z.array(z.string().min(1)).max(50);

async function replanFor(moved: string[], runId: string): Promise<number> {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const profiles = await getStore().list<Profile>("profiles");
  let n = 0;
  for (const p of profiles) {
    const roleId = p?.dna?.targetRoles?.[0];
    if (!roleId) continue;
    const skills = (await roleTopSkills(roleId, p.id, 10)).map((s) => s.skillId);
    if (!skills.some((s) => moved.includes(s))) continue;
    try {
      const r = await fetch(`${app}/api/roadmap/generate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: p.id, roleId }), signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) n++;
    } catch {
      // one failed re-plan doesn't stop the others
    }
  }
  emit({ runId, agent: "n8n", status: "done", message: `market moved (${moved.join(", ")}): re-planned ${n} roadmap${n === 1 ? "" : "s"}`, data: { replanned: n } });
  return n;
}

export async function POST(req: Request) {
  if (!verifySecret(req)) return fail(401, "unauthorized", "Missing or wrong x-keystone-secret header.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"workflow\":\"market-refresh\",\"result\":{}}");
  }
  const parsed = CallbackReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { workflow, result } = parsed.data;
    const runId = newRunId();
    const store = getStore();
    const runKey = `${workflow}_${Date.now()}`;
    await store.upsert("n8n_runs", runKey, { id: runKey, workflow, result, receivedAt: new Date().toISOString() });

    if (workflow === "market-refresh") {
      const moved = MovedZ.safeParse(result.moved);
      const replanned = moved.success && moved.data.length ? await replanFor(moved.data, runId) : 0;
      return ok({ ok: true, workflow, replanned });
    }
    if (workflow === "pod-kickoff" && typeof result.podId === "string" && typeof result.discordChannelUrl === "string"
      && /^https:\/\//.test(result.discordChannelUrl)) {
      const pod = await store.get<Pod>("pods", result.podId);
      if (pod) {
        await store.upsert("pods", pod.id, { ...pod, discordChannelUrl: result.discordChannelUrl }, pod.members?.[0]?.userId);
        emit({ runId, agent: "n8n", status: "done", message: `${pod.name} kickoff posted to Discord` });
      }
      return ok({ ok: true, workflow, updated: !!pod });
    }
    return ok({ ok: true, workflow, replanned: 0 });
  } catch {
    return internal();
  }
}
