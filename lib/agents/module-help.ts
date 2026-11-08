// P5 · Module/Concept help (UC-3): route a student's "who can help me with this module concept?"
// ask to podmates who have proven that skill on their Bridge Map.
// Pure-ish: reads the viewer's map, then other students' profiles + maps (their evidence/ladder).
// Never throws; degrades to [] / empty.

import "server-only";
import { nanoid } from "nanoid";
import { loadGraph } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import type { HelpRequest, Profile } from "@/lib/types";
import { createHelpRequest } from "@/lib/community/help";

const PROVEN_LEVEL = 2;
const MAX_CANDIDATES = 4;

export interface HelperCandidate {
  userId: string;
  name: string;
  provenLevel: number;
}

export interface SkillHelp {
  skillId: string;
  skillName: string;
  moduleCode: string;
  helperCandidates: HelperCandidate[];
}

export type ModuleHelpInput = {
  fromUserId: string;
  moduleCode?: string;
  concept?: string;
  skillId?: string;
  message: string;
};

/** Find students (not the viewer) who have proven a skill tied to a module code or concept. */
export async function suggestHelpersForModule(
  userId: string,
  roleId: string,
  moduleCodeOrConcept: string,
): Promise<SkillHelp[]> {
  try {
    if (!userId || !roleId || !moduleCodeOrConcept?.trim()) return [];

    const map = await loadGraph(userId, roleId);
    if (!map) return [];

    const q = moduleCodeOrConcept.trim();
    const qLower = q.toLowerCase();

    // Match nodes whose moduleCodes include the code, or whose skill name matches the concept.
    const matched = map.nodes.filter(
      (n) =>
        n.moduleCodes.some((c) => c.toLowerCase() === qLower) ||
        n.name.toLowerCase().includes(qLower),
    );
    if (!matched.length) return [];

    const skills: { skillId: string; name: string; moduleCode: string }[] = [];
    const seen = new Set<string>();
    for (const n of matched) {
      if (seen.has(n.skillId)) continue;
      seen.add(n.skillId);
      skills.push({
        skillId: n.skillId,
        name: n.name,
        moduleCode: n.moduleCodes[0] ?? q,
      });
    }

    let profiles: Profile[] = [];
    try {
      profiles = (await getStore().list<Profile>("profiles")) ?? [];
    } catch {
      profiles = [];
    }

    const result: SkillHelp[] = [];
    for (const s of skills) {
      const candidates: HelperCandidate[] = [];
      for (const p of profiles) {
        if (!p || p.id === userId) continue;
        try {
          const m = await loadGraph(p.id, roleId);
          const node = m?.nodes.find((n) => n.skillId === s.skillId);
          // Proven = level ≥ 2 on the proof ladder (BridgeMap marks status "proven").
          if (node && node.status === "proven" && (node.level ?? 0) >= PROVEN_LEVEL) {
            candidates.push({ userId: p.id, name: p.name ?? p.id, provenLevel: node.level });
          }
        } catch {
          // Degrade: skip a student whose map can't be loaded.
        }
      }
      candidates.sort((a, b) => b.provenLevel - a.provenLevel || a.userId.localeCompare(b.userId));
      result.push({
        skillId: s.skillId,
        skillName: s.name,
        moduleCode: s.moduleCode,
        helperCandidates: candidates.slice(0, MAX_CANDIDATES),
      });
    }
    return result;
  } catch {
    return [];
  }
}

/** Create an open "question" help request prefixed with the module/concept. Never throws. */
export async function createModuleHelpRequest(input: ModuleHelpInput): Promise<HelpRequest> {
  try {
    const segments: string[] = [];
    if (input.moduleCode) segments.push(`[${input.moduleCode}]`);
    segments.push(input.message.trim());
    if (input.concept) segments.push(`— ${input.concept}`);
    const message = segments.join(" ");

    return await createHelpRequest({
      fromUserId: input.fromUserId,
      kind: "question",
      message,
    });
  } catch {
    // Degrade to an empty unsaved request rather than throwing.
    return {
      id: `help_${nanoid(6)}`,
      fromUserId: input.fromUserId,
      kind: "question",
      message: input.message.trim(),
      status: "open",
      createdAt: new Date().toISOString(),
    };
  }
}
