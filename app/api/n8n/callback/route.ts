import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { emit } from "@/lib/agents/events";
import { verifySecret } from "@/lib/n8n";
import { CallbackReqZ } from "@/lib/schemas/voice";
import { getStore } from "@/lib/store";
import type { Profile, RoleDemand } from "@/lib/types";
import { badRequest, internal, ok, unauthorized } from "@/lib/voice/http";


const MovedZ = z.array(z.string().min(1)).max(500);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", rel.replace(/^data\//, "")), "utf8")) as T;
  } catch {
    return null;
  }
}

// The skill ids P1's market data lists for a role, or null when there is no market data for it yet.
async function roleSkillIds(roleId: string): Promise<Set<string> | null> {
  if (!SAFE_ID.test(roleId)) return null;
  for (const rel of [`data/fixtures/market.${roleId}.json`, `data/cache/market-${roleId}-uk.json`]) {
    const demand = await readJson<Partial<RoleDemand>>(rel);
    if (demand && Array.isArray(demand.skills)) {
      return new Set(demand.skills.map((s) => s?.skillId).filter((id): id is string => typeof id === "string"));
    }
  }
  return null;
}

async function replanForMovedSkills(moved: Set<string>): Promise<number> {
  const profiles = await getStore().list<Profile>("profiles");
  const skillsByRole = new Map<string, Set<string> | null>();
  const targets = new Map<string, { userId: string; roleId: string }>();

  for (const p of profiles) {
    const userId = p?.id;
    const roleId = p?.dna?.targetRoles?.[0];
    if (!userId || !roleId || targets.has(userId)) continue;
    if (!skillsByRole.has(roleId)) skillsByRole.set(roleId, await roleSkillIds(roleId));
    const roleSkills = skillsByRole.get(roleId);
    // No market data for the role: treat every moved skill as relevant rather than silently skipping the student.
    const relevant = roleSkills ? [...moved].some((s) => roleSkills.has(s)) : true;
    if (relevant) targets.set(userId, { userId, roleId });
  }

  const app = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const results = await Promise.allSettled(
    [...targets.values()].map((t) =>
      fetch(`${app}/api/roadmap/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(t),
        signal: AbortSignal.timeout(60_000),
      }),
    ),
  );
  return results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
}

// n8n W1 (market-refresh) posts { workflow, result: { moved: SkillId[] } } here when demand shifts > 10%.
export async function POST(req: Request) {
  try {
    if (!verifySecret(req)) return unauthorized();

    const body: unknown = await req.json().catch(() => null);
    const parsed = CallbackReqZ.safeParse(body);
    if (!parsed.success) return badRequest("Expected { workflow, result }");
    const { workflow, result } = parsed.data;

    if (workflow !== "market-refresh") return ok({ ok: true, replanned: 0 });

    const moved = MovedZ.safeParse(result.moved ?? []);
    if (!moved.success) return badRequest("result.moved must be a list of skill ids");
    if (moved.data.length === 0) return ok({ ok: true, replanned: 0 });

    const n = await replanForMovedSkills(new Set(moved.data));
    emit({ runId: `n8n_${Date.now()}`, agent: "n8n", status: "done", message: `market moved: re-planned ${n} roadmaps` });
    return ok({ ok: true, replanned: n });
  } catch {
    return internal();
  }
}
