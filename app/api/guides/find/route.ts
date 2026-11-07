// P5 · POST /api/guides/find {userId} → GuideSuggestion[] ("learn from practitioners").
// Limit: 3 drafts a day per user (store collection `guides_usage`, doc `${userId}:${YYYY-MM-DD}`).
// DEMO_MODE (or ?demo=1) returns data/fixtures/guides.aisha.json, still counting usage.
// We only draft messages: the student sends them themselves.
import fs from "node:fs";
import path from "node:path";
import { findGuides } from "@/lib/agents/guides";
import { loadGraph } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import type { BridgeMap, GuideSuggestion, Profile } from "@/lib/types";
import { GuideSuggestionZ, GuidesFindReqZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";

const DAILY_LIMIT = 3;
const SAFE_ID = /^[a-z0-9_-]+$/i;

type Usage = { id: string; userId: string; day: string; count: number };

function readJSON(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  } catch {
    return undefined;
  }
}

function fixtureGuides(): GuideSuggestion[] {
  const raw = readJSON("data/fixtures/guides.aisha.json");
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    const r = GuideSuggestionZ.safeParse(g);
    return r.success ? [r.data] : [];
  });
}

const hasNodes = (m: BridgeMap | null | undefined): m is BridgeMap => Array.isArray(m?.nodes) && m.nodes.length > 0;

/** The user's map: cached in the store → built by P2's loadGraph → the fixture file. */
async function loadMap(userId: string, roleId: string): Promise<BridgeMap | null> {
  const cached = await getStore().get<BridgeMap>("maps", `${userId}:${roleId}`).catch(() => null);
  if (hasNodes(cached)) return cached;
  const built = await loadGraph(userId, roleId).catch(() => null);
  if (hasNodes(built)) return built;
  const own = SAFE_ID.test(userId) && SAFE_ID.test(roleId) ? (readJSON(`data/fixtures/bridgemap.${userId}.${roleId}.json`) as BridgeMap | undefined) : undefined;
  if (hasNodes(own)) return own;
  const demo = readJSON("data/fixtures/bridgemap.aisha.ml-engineer.json") as BridgeMap | undefined;
  return hasNodes(demo) ? demo : null;
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Body must be JSON.");
    }
    const parsed = GuidesFindReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const { userId } = parsed.data;

    const store = getStore();
    const profile = await store.get<Profile>("profiles", userId);
    if (!profile) return fail(404, "not_found", `We couldn't find a profile for ${userId}.`);

    const day = new Date().toISOString().slice(0, 10);
    const usageId = `${userId}:${day}`;
    const used = (await store.get<Usage>("guides_usage", usageId))?.count ?? 0;
    if (used >= DAILY_LIMIT) {
      return fail(429, "daily_limit", `You've used today's ${DAILY_LIMIT} drafts. Come back tomorrow for fresh suggestions.`);
    }
    await store.upsert<Usage>("guides_usage", usageId, { id: usageId, userId, day, count: used + 1 }, userId);

    const demo = process.env.DEMO_MODE === "true" || new URL(req.url).searchParams.get("demo") === "1";
    if (demo) return ok(fixtureGuides());

    const roleId = profile.dna?.targetRoles?.[0] ?? "ml-engineer";
    const map = await loadMap(userId, roleId);
    let guides: GuideSuggestion[] = [];
    if (map) {
      try {
        guides = await findGuides(profile, map);
      } catch {
        guides = [];
      }
    }
    return ok(guides.length > 0 ? guides : fixtureGuides());
  } catch {
    return internal();
  }
}
