import "server-only";
// P5 · Trajectories agent: rank seniors' journeys by how similar they are to a student (near-peer mentoring).
import fs from "node:fs";
import path from "node:path";
import { cosine, embed } from "@/lib/llm";
import { emit } from "@/lib/agents/events";
import { getStore } from "@/lib/store";
import { TrajectoryZ } from "@/lib/schemas/community";
import type { Profile, Trajectory } from "@/lib/types";

/** data/seed/trajectories.json, read at runtime (never a static import), keeping only valid rows. */
export function readSeedTrajectories(): Trajectory[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/seed/trajectories.json"), "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r) => {
      const p = TrajectoryZ.safeParse(r);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  }
}

/** Trajectories from the store (seed file when the store is empty, or always in demo mode). */
export async function loadTrajectories(opts: { programmeId?: string; demo?: boolean } = {}): Promise<Trajectory[]> {
  const demo = opts.demo || process.env.DEMO_MODE === "true";
  let all = demo ? [] : await getStore().list<Trajectory>("trajectories");
  if (!all.length) all = readSeedTrajectories();
  return opts.programmeId ? all.filter((t) => t.programmeId === opts.programmeId) : all;
}

/** Display names for the target roles students pick in their Learning DNA. */
export const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer",
  "software-engineer": "Software engineer",
  "data-analyst": "Data analyst",
};

/** Which trajectory outcomes count as "reached the role you want". */
const ROLE_OUTCOME_RE: Record<string, RegExp> = {
  "ml-engineer": /\bml\b|machine learning|phd in ml/i,
  "software-engineer": /software|sre|engineer at a bank/i,
  "data-analyst": /data analyst|analytics/i,
};

export const OUTCOME_BONUS = 0.15;

export function roleName(roleId: string | undefined): string {
  if (!roleId) return "";
  return ROLE_NAMES[roleId] ?? roleId.split("-").join(" ");
}

export function outcomeMatchesRole(outcomeRole: string, roleId: string | undefined): boolean {
  const re = roleId ? ROLE_OUTCOME_RE[roleId] : undefined;
  return !!re && re.test(outcomeRole);
}

export function profileText(profile: Profile): string {
  return [...profile.interests, roleName(profile.dna.targetRoles[0]), `year ${profile.year}`].filter(Boolean).join(" ");
}

export function trajectoryText(t: Trajectory): string {
  return [...t.steps.map((s) => s.label), t.outcomeRole].join(" ");
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/** Jaccard similarity of lowercase word sets (the fallback when embeddings are unavailable). */
export function jaccard(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function similarTrajectories(
  profile: Profile,
  all: Trajectory[],
  limit = 5,
  runId?: string,
): Promise<{ trajectory: Trajectory; similarity: number }[]> {
  const targetRole = profile.dna.targetRoles[0];
  if (runId) {
    emit({ runId, agent: "trajectories", status: "started", message: `Comparing your path with ${all.length} seniors' journeys`, data: { candidates: all.length } });
  }
  if (!all.length) {
    if (runId) emit({ runId, agent: "trajectories", status: "done", message: "No journeys to compare yet", data: { candidates: 0, returned: 0 } });
    return [];
  }

  const pText = profileText(profile);
  const tTexts = all.map(trajectoryText);
  let base: number[];
  let method: "embedding" | "jaccard" = "embedding";
  try {
    const vecs = await embed([pText, ...tTexts]);
    const [pv, ...tv] = vecs;
    if (!pv || tv.length !== all.length) throw new Error("embedding count mismatch");
    base = tv.map((v) => cosine(pv, v));
  } catch {
    method = "jaccard";
    base = tTexts.map((t) => jaccard(pText, t));
  }

  let bonusCount = 0;
  const scored = all.map((trajectory, i) => {
    const bonus = outcomeMatchesRole(trajectory.outcomeRole, targetRole) ? OUTCOME_BONUS : 0;
    if (bonus) bonusCount++;
    return { trajectory, score: (base[i] ?? 0) + bonus };
  });
  scored.sort((a, b) => b.score - a.score || a.trajectory.id.localeCompare(b.trajectory.id));
  const top = scored.slice(0, Math.max(0, limit)).map(({ trajectory, score }) => ({
    trajectory,
    similarity: round3(Math.max(0, Math.min(1, score))),
  }));

  if (runId) {
    emit({
      runId, agent: "trajectories", status: "done",
      message: `Found ${top.length} journeys like yours (${bonusCount} reached ${roleName(targetRole) || "your target role"})`,
      data: { candidates: all.length, returned: top.length, roleMatches: bonusCount, method, topSimilarity: top[0]?.similarity ?? 0 },
    });
  }
  return top;
}
