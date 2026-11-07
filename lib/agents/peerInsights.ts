// P5 · Peer-teaching insights for the Teaching pillar (pure; no I/O).
// Which skills can students in a cohort already teach each other, and which gaps can nobody teach yet?
// Anonymous by construction: only counts leave this function, and only for cohorts of ANONYMITY_MIN or more.
import type { PodInsights } from "@/lib/schemas/studio";
import type { Profile } from "@/lib/types";

/** Groups smaller than this are never shown (contract F14: "groups of 10 or more students only"). */
export const ANONYMITY_MIN = 10;
const TOP_TEACHABLE = 8;

export type SkillSets = { proven: string[]; gaps: string[] };

export function computePodInsights(input: {
  programmeId: string;
  profiles: Pick<Profile, "id" | "programmeId">[];
  skills: Record<string, SkillSets>;
  podsCount: number;
}): PodInsights {
  const cohort = input.profiles.filter((p) => p.programmeId === input.programmeId);
  const base = { programmeId: input.programmeId, cohortSize: cohort.length, podsCount: input.podsCount };
  if (cohort.length < ANONYMITY_MIN) return { ...base, suppressed: true, peerTeachable: [], unteachableGaps: [] };

  const teachers = new Map<string, Set<string>>();
  const learners = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, skillId: string, userId: string) => {
    let s = m.get(skillId);
    if (!s) m.set(skillId, (s = new Set()));
    s.add(userId);
  };
  for (const p of cohort) {
    const s = input.skills[p.id];
    if (!s) continue;
    const proven = new Set(s.proven);
    proven.forEach((k) => add(teachers, k, p.id));
    // A skill the student has already proven is not a gap for them, whatever an older list says.
    s.gaps.filter((k) => !proven.has(k)).forEach((k) => add(learners, k, p.id));
  }

  const peerTeachable = [...learners.entries()]
    .filter(([skillId, who]) => (teachers.get(skillId)?.size ?? 0) > 0 && who.size > 0)
    .map(([skillId, who]) => ({ skillId, teachers: teachers.get(skillId)!.size, learners: who.size }))
    .sort((a, b) => b.learners - a.learners || b.teachers - a.teachers || a.skillId.localeCompare(b.skillId))
    .slice(0, TOP_TEACHABLE);

  const unteachableGaps = [...learners.entries()]
    .filter(([skillId]) => !teachers.has(skillId))
    .map(([skillId, who]) => ({ skillId, studentsWithGap: who.size }))
    .sort((a, b) => b.studentsWithGap - a.studentsWithGap || a.skillId.localeCompare(b.skillId));

  return { ...base, suppressed: false, peerTeachable, unteachableGaps };
}
