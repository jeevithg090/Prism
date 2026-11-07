// Server-side readers for the Bridge Map and Roadmap: fixtures and seed files read at runtime by path (they may
// be written by other areas), the store, and the skills catalogue. Every reader tolerates a missing file.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import skillsJson from "@/data/skills.json";
import { getStore } from "@/lib/store";
import { EvidenceItemZ } from "@/lib/graph/schemas";
import type { BridgeMap, EvidenceItem, Pod, Profile, Programme, RoleDemand, Skill, SkillCategory, TrendSeries } from "@/lib/types";

export const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

/** Reads a JSON file under data/ (paths are given as "data/…"); null if it's missing or invalid. */
export function readData<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", rel.replace(/^data\//, "")), "utf8")) as T;
  } catch {
    return null;
  }
}

const SKILLS = new Map((skillsJson as Skill[]).map((s) => [s.id, s]));
export function skillMeta(id: string): { name: string; category: SkillCategory; prereqs: string[] } {
  const s = SKILLS.get(id);
  return {
    name: s?.name ?? id.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" "),
    category: s?.category ?? "practice",
    prereqs: s?.prereqs ?? [],
  };
}

export function bridgemapFixture(userId: string, roleId: string): BridgeMap | null {
  if (!SAFE_ID.test(userId) || !SAFE_ID.test(roleId)) return null;
  const m = readData<BridgeMap>(`data/fixtures/bridgemap.${userId}.${roleId}.json`);
  return m && Array.isArray(m.nodes) && m.nodes.length ? m : null;
}

/** The programme from P1's fixture or cache, or null (the map then works from node module codes alone). */
export function programmeFixture(programmeId?: string): Programme | null {
  if (!programmeId || !SAFE_ID.test(programmeId)) return null;
  for (const rel of [`data/fixtures/programme.${programmeId}.json`, `data/cache/programme-${programmeId}.json`]) {
    const p = readData<Programme>(rel);
    if (p && Array.isArray(p.modules) && p.modules.length) return p;
  }
  return null;
}

export function marketFixture(roleId: string): RoleDemand | null {
  if (!SAFE_ID.test(roleId)) return null;
  for (const rel of [`data/fixtures/market.${roleId}.json`, `data/cache/market-${roleId}.json`]) {
    const m = readData<RoleDemand>(rel);
    if (m && Array.isArray(m.skills) && m.skills.length) return m;
  }
  return null;
}

export function trendsFixture(): TrendSeries[] | null {
  const t = readData<TrendSeries[] | { series?: TrendSeries[] }>("data/fixtures/trends.json");
  const arr = Array.isArray(t) ? t : Array.isArray(t?.series) ? t.series : null;
  return arr?.length ? arr : null;
}

export function studentSkillsSeed(): Record<string, { proven: string[]; gaps: string[] }> {
  const s = readData<Record<string, { proven?: unknown; gaps?: unknown }>>("data/seed/student-skills.json");
  if (!s || typeof s !== "object") return {};
  const out: Record<string, { proven: string[]; gaps: string[] }> = {};
  for (const [id, v] of Object.entries(s)) {
    out[id] = {
      proven: Array.isArray(v?.proven) ? v.proven.filter((x): x is string => typeof x === "string") : [],
      gaps: Array.isArray(v?.gaps) ? v.gaps.filter((x): x is string => typeof x === "string") : [],
    };
  }
  return out;
}

export function evidenceFixture(userId: string): EvidenceItem[] {
  if (!SAFE_ID.test(userId)) return [];
  const raw = readData<unknown[]>(`data/fixtures/evidence.${userId}.json`);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = EvidenceItemZ.safeParse(r);
    return p.success && p.data.userId === userId ? [p.data] : [];
  });
}

/** Store evidence (proof loop, challenges, GitHub sync) plus the user's fixture evidence; the store wins on id. */
export async function listEvidence(userId: string): Promise<EvidenceItem[]> {
  let stored: EvidenceItem[] = [];
  try {
    stored = (await getStore().list<EvidenceItem>("evidence", { userId })).filter((e) => e && typeof e.skillId === "string");
  } catch { /* store down: fixtures only */ }
  const ids = new Set(stored.map((e) => e.id));
  return [...stored, ...evidenceFixture(userId).filter((e) => !ids.has(e.id))];
}

export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const p = await getStore().get<Profile>("profiles", userId);
    if (p) return p;
  } catch { /* fall through */ }
  if (!SAFE_ID.test(userId)) return null;
  return readData<Profile>(`data/fixtures/profile.${userId}.json`);
}

/** The user's pod (store first, then the seeded demo pod if they're a member). */
export async function podFor(userId: string): Promise<Pod | null> {
  try {
    const pods = await getStore().list<Pod>("pods");
    const mine = pods.filter((p) => p?.members?.some((m) => m.userId === userId));
    const withProject = mine.find((p) => p.project);
    if (withProject ?? mine[0]) return withProject ?? mine[0];
  } catch { /* fall through */ }
  const fx = readData<Pod>("data/fixtures/pod.aisha.json");
  return fx?.members?.some((m) => m.userId === userId) ? fx : null;
}
