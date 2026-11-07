// P5 · "Learn from practitioners" with the daily draft limit. Shared by POST /api/guides/find and the `find_guides` tool.
// Limit: 3 drafts a day per user (store collection `guides_usage`, doc `${userId}:${YYYY-MM-DD}`).
// Demo returns data/fixtures/guides.aisha.json, still counting usage. We only draft messages: students send them.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { findGuides } from "@/lib/agents/guides";
import { loadGraph } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import { GuideSuggestionZ } from "@/lib/schemas/community";
import type { BridgeMap, GuideSuggestion, Profile } from "@/lib/types";

export const GUIDES_DAILY_LIMIT = 3;
const SAFE_ID = /^[a-z0-9_-]+$/i;

type Usage = { id: string; userId: string; day: string; count: number };

/** `not_found` → no profile (404) · `daily_limit` → today's drafts are used up (429). */
export class GuidesError extends Error {
  constructor(readonly code: "not_found" | "daily_limit", message: string) {
    super(message);
    this.name = "GuidesError";
  }
}

function readJSON(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  } catch {
    return undefined;
  }
}

export function fixtureGuides(): GuideSuggestion[] {
  const raw = readJSON("data/fixtures/guides.aisha.json");
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((g) => {
    const r = GuideSuggestionZ.safeParse(g);
    return r.success ? [r.data] : [];
  });
}

const hasNodes = (m: BridgeMap | null | undefined): m is BridgeMap => Array.isArray(m?.nodes) && m.nodes.length > 0;

/** The user's map: cached in the store → built by P2's loadGraph → the fixture file → Aisha's demo map. */
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

export interface GuidesResult {
  guides: GuideSuggestion[];
  /** Drafts used today, including this call. */
  usedToday: number;
  remainingToday: number;
}

/**
 * Up to 4 practitioners for the user's top gap, counting one of today's 3 drafts.
 * Throws GuidesError("not_found") without a profile and GuidesError("daily_limit") when today's drafts are used.
 */
export async function findGuidesForUser(userId: string, opts: { demo?: boolean } = {}): Promise<GuidesResult> {
  const store = getStore();
  const profile = await store.get<Profile>("profiles", userId);
  if (!profile) throw new GuidesError("not_found", `We couldn't find a profile for ${userId}.`);

  const day = new Date().toISOString().slice(0, 10);
  const usageId = `${userId}:${day}`;
  const used = (await store.get<Usage>("guides_usage", usageId))?.count ?? 0;
  if (used >= GUIDES_DAILY_LIMIT) {
    throw new GuidesError("daily_limit", `You've used today's ${GUIDES_DAILY_LIMIT} drafts. Come back tomorrow for fresh suggestions.`);
  }
  await store.upsert<Usage>("guides_usage", usageId, { id: usageId, userId, day, count: used + 1 }, userId);
  const usage = { usedToday: used + 1, remainingToday: GUIDES_DAILY_LIMIT - used - 1 };

  const demo = opts.demo || process.env.DEMO_MODE === "true";
  if (demo) return { guides: fixtureGuides(), ...usage };

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
  return { guides: guides.length > 0 ? guides : fixtureGuides(), ...usage };
}
