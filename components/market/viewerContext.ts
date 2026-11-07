import "server-only";
// Server-side context for /market: the viewer's target role, a status per skill (from their Bridge Map, the seed
// skills or their programme) and which roadmap week covers each skill. Every read is guarded: missing data → less tagging.
import fs from "node:fs";
import path from "node:path";
import { getProgramme } from "@/lib/agents/syllabus";
import { isRole } from "@/lib/agents/market";
import { loadGraph } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import type { Profile, Programme, Roadmap, SkillStatus } from "@/lib/types";
import type { RoadmapWeeks, StatusBySkill } from "./summaries";

export type ViewerContext = {
  userId: string;
  primaryRole: string;
  statusBySkill: StatusBySkill;
  roadmapWeeks: RoadmapWeeks | null;
  /** Where the status tags come from, for the honesty line. */
  statusSource: "map" | "seed" | "programme" | "none";
  /** Status for a skill we have no record of: when we know what you've proven and what your degree covers, it's a gap. */
  fallbackStatus: SkillStatus | null;
};

function readJSON<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return null;
  }
}

/** Degree coverage for skills the map doesn't list: done if the unit is in an earlier term than the student's. */
function degreeStatus(programme: Programme | null, year: number): StatusBySkill {
  const out: StatusBySkill = {};
  for (const m of programme?.modules ?? []) {
    const done = m.year < year || (m.year === year && m.semester === "1");
    for (const s of m.skills) {
      if (s.level < 1) continue;
      const prev = out[s.skillId];
      out[s.skillId] = prev === "degree-done" || done ? "degree-done" : "degree-upcoming";
    }
  }
  return out;
}

export function roadmapWeeksOf(roadmap: Pick<Roadmap, "weeks"> | null | undefined): RoadmapWeeks | null {
  if (!roadmap?.weeks?.length) return null;
  const out: RoadmapWeeks = {};
  for (const w of [...roadmap.weeks].sort((a, b) => a.week - b.week)) if (w.focusSkillId && out[w.focusSkillId] === undefined) out[w.focusSkillId] = w.week;
  return out;
}

async function loadRoadmap(userId: string, roleId: string): Promise<Roadmap | null> {
  const store = getStore();
  for (const id of [`${userId}:${roleId}`, userId]) {
    const r = await store.get<Roadmap>("roadmaps", id).catch(() => null);
    if (r?.weeks?.length && (!r.roleId || r.roleId === roleId)) return r;
  }
  return readJSON<Roadmap>(`data/fixtures/roadmap.${userId}.${roleId}.json`);
}

export async function loadViewerContext(userId: string): Promise<ViewerContext> {
  const profile = await getStore().get<Profile>("profiles", userId).catch(() => null);
  const wanted = profile?.dna?.targetRoles?.[0];
  const primaryRole = wanted && isRole(wanted) ? wanted : "ml-engineer";
  const programme = getProgramme(profile?.programmeId ?? "uom-bsc-cs");
  const fromDegree = degreeStatus(programme, profile?.year ?? 1);

  let statusBySkill: StatusBySkill = {};
  let statusSource: ViewerContext["statusSource"] = "none";
  const map = await loadGraph(userId, primaryRole).catch(() => null);
  if (map?.nodes?.length) {
    statusBySkill = { ...fromDegree, ...Object.fromEntries(map.nodes.map((n) => [n.skillId, n.status as SkillStatus])) };
    statusSource = "map";
  } else {
    const seed = readJSON<Record<string, { proven: string[]; gaps: string[] }>>("data/seed/student-skills.json")?.[userId];
    if (seed) {
      statusBySkill = { ...fromDegree };
      for (const g of seed.gaps) statusBySkill[g] ??= "gap";
      for (const p of seed.proven) statusBySkill[p] = "proven";
      statusSource = "seed";
    } else if (programme) {
      statusBySkill = fromDegree;
      statusSource = "programme";
    }
  }
  const roadmapWeeks = roadmapWeeksOf(await loadRoadmap(userId, primaryRole).catch(() => null));
  const fallbackStatus: SkillStatus | null = statusSource === "map" || statusSource === "seed" ? "gap" : null;
  return { userId, primaryRole, statusBySkill, roadmapWeeks, statusSource, fallbackStatus };
}
