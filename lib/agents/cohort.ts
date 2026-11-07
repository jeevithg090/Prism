import "server-only";
// Loads a programme's cohort for the Teaching pillar views (peer-teaching insights + Lecturer Insights).
// Reads the store plus seed/fixture files by path (they may not exist on every branch, so every read is guarded).
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@/lib/store";
import type { BridgeMap, EvidenceItem, Profile, Programme, RoleDemand } from "@/lib/types";
import type { SkillSets } from "@/lib/agents/peerInsights";

export function readJSON<T>(rel: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** A student's Bridge Map: the store's cached map first (it reflects merged pod PRs), then the fixture. */
export async function loadMap(userId: string, roleId: string): Promise<BridgeMap | undefined> {
  const cached = await getStore().get<BridgeMap>("maps", `${userId}:${roleId}`).catch(() => null);
  return cached ?? readJSON<BridgeMap>(`data/fixtures/bridgemap.${userId}.${roleId}.json`);
}

export type Cohort = { profiles: Profile[]; skills: Record<string, SkillSets> };

/**
 * Everyone on the programme, with their proven skills and gaps:
 * seeded students from data/seed/student-skills.json, everyone else (Aisha) from their Bridge Map,
 * plus any evidence in the store (e.g. a merged pod PR) that turns a gap into a proven skill.
 */
export async function loadCohort(programmeId: string): Promise<Cohort> {
  const store = getStore();
  const profiles = (await store.list<Profile>("profiles")).filter((p) => p.programmeId === programmeId);
  const seeded = readJSON<Record<string, SkillSets>>("data/seed/student-skills.json") ?? {};
  const skills: Record<string, SkillSets> = {};
  for (const p of profiles) {
    let s: SkillSets | undefined = seeded[p.id];
    if (!s) {
      const roleId = p.dna?.targetRoles?.[0];
      const map = roleId ? await loadMap(p.id, roleId) : undefined;
      if (map) {
        s = {
          proven: map.nodes.filter((n) => n.status === "proven").map((n) => n.skillId),
          gaps: map.nodes.filter((n) => n.status === "gap").map((n) => n.skillId),
        };
      }
    }
    const evidence = await store.list<EvidenceItem>("evidence", { userId: p.id }).catch(() => [] as EvidenceItem[]);
    const evidenced = evidence.filter((e) => e.level >= 2 && e.confidence >= 0.5).map((e) => e.skillId);
    if (s || evidenced.length) {
      const proven = [...new Set([...(s?.proven ?? []), ...evidenced])];
      skills[p.id] = { proven, gaps: (s?.gaps ?? []).filter((g) => !proven.includes(g)) };
    }
  }
  return { profiles, skills };
}

export async function countPods(): Promise<number> {
  return (await getStore().list("pods")).length;
}

/** P1's market fixture for a role, if it exists yet. */
export function loadRoleDemand(roleId: string): RoleDemand | undefined {
  const d = readJSON<RoleDemand>(`data/fixtures/market.${roleId}.json`);
  return d && Array.isArray(d.skills) ? d : undefined;
}

/** P1's programme fixture, if it exists yet. */
export function loadProgramme(programmeId: string): Programme | undefined {
  const p = readJSON<Programme>(`data/fixtures/programme.${programmeId}.json`);
  return p && Array.isArray(p.modules) ? p : undefined;
}
