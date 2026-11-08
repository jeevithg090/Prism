import "server-only";
import { customAlphabet } from "nanoid";
import { loadGraph } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import { emit, newRunId } from "@/lib/agents/events";
import { skillName } from "@/lib/schemas/community";
import {
  CapstoneCreateReqZ,
  CapstoneProjectZ,
  MilestoneZ,
  type CapstoneProject,
  type Milestone,
} from "@/lib/schemas/capstone";
import type { AgentName, BridgeMap, SkillId } from "@/lib/types";

// The capstone agent reuses the Architect identity: it designs a project, just for a
// solo student instead of a pod. Noted in the UC-4 report.
const AGENT: AgentName = "architect";
const COLLECTION = "capstones";
const MAX_TARGET_SKILLS = 4;
const FALLBACK_SKILL: SkillId = "communication";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);
const nowIso = () => new Date().toISOString();

/** Gap skills (status "gap") ranked by market demand, capped at 4. */
function pickGapSkills(map: BridgeMap | null): SkillId[] {
  if (!map) return [];
  return [...map.nodes]
    .filter((n) => n.status === "gap")
    .sort((a, b) => b.demand - a.demand)
    .slice(0, MAX_TARGET_SKILLS)
    .map((n) => n.skillId);
}

function taskFor(skillId: SkillId, phase: "Learn" | "Build" | "Showcase"): string {
  const name = skillName(skillId);
  const byPhase: Record<string, string> = {
    Learn: `Learn the fundamentals of ${name}`,
    Build: `Build a feature using ${name}`,
    Showcase: `Demo the ${name} feature and add it to your CV and LinkedIn`,
  };
  return byPhase[phase];
}

function buildMilestones(skillIds: SkillId[]): Milestone[] {
  const skills = skillIds.length ? skillIds : [FALLBACK_SKILL];
  const phases: { title: string; phase: "Learn" | "Build" | "Showcase" }[] = [
    { title: "Learn the foundations", phase: "Learn" },
    { title: "Build the project", phase: "Build" },
    { title: "Showcase to employers", phase: "Showcase" },
  ];
  return phases.map((p, i) => ({
    id: `capstone_ms_${nanoid()}_${i + 1}`,
    title: p.title,
    skillId: skills[i] ?? skills[skills.length - 1],
    tasks: skills.map((s) => taskFor(s, p.phase)),
    done: false,
  }));
}

export async function createCapstone(input: {
  userId: string;
  title: string;
  pitch?: string;
  roleId?: string;
  targetSkills?: SkillId[];
  runId?: string;
}): Promise<CapstoneProject> {
  const runId = input.runId ?? newRunId();
  const roleId = input.roleId ?? "";
  const parsed = CapstoneCreateReqZ.safeParse({
    userId: input.userId,
    title: input.title,
    pitch: input.pitch,
    roleId: input.roleId,
    targetSkills: input.targetSkills,
  });
  if (!parsed.success) {
    // Never throw: fall back to the validated core fields.
    input.title = input.title.trim() || "My capstone project";
  }

  emit({
    runId,
    agent: AGENT,
    status: "started",
    message: `Creating capstone project "${input.title}"`,
  });

  // Read the Bridge Map to pick the student's biggest gap skills as target skills.
  let map: BridgeMap | null = null;
  try {
    map = await loadGraph(input.userId, roleId);
  } catch {
    map = null;
  }

  let targetSkills: SkillId[] = input.targetSkills?.slice() ?? [];
  if (!targetSkills.length) {
    targetSkills = pickGapSkills(map);
  }
  if (!targetSkills.length) {
    targetSkills = [FALLBACK_SKILL];
  }

  emit({
    runId,
    agent: AGENT,
    status: "progress",
    message: `Picked ${targetSkills.length} target skill(s) from your Bridge Map`,
  });

  const milestones = buildMilestones(targetSkills);
  const project: CapstoneProject = {
    id: `capstone_${nanoid()}`,
    userId: input.userId,
    title: input.title.trim() || "My capstone project",
    pitch:
      input.pitch ??
      `A solo capstone project to practise ${targetSkills.map(skillName).join(", ")} and show employers what you can build.`,
    roleId,
    targetSkills,
    milestones,
    status: "planning",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  let stored: CapstoneProject;
  try {
    stored = await getStore().upsert<CapstoneProject>(COLLECTION, project.id, project, input.userId);
    CapstoneProjectZ.parse(stored);
  } catch {
    // Store failure → graceful: return the in-memory project unchanged.
    stored = project;
  }

  emit({
    runId,
    agent: AGENT,
    status: "done",
    message: `Capstone project "${stored.title}" ready`,
    data: { id: stored.id, milestones: stored.milestones.length },
  });
  return stored;
}

export async function listCapstones(userId: string): Promise<CapstoneProject[]> {
  try {
    return (await getStore().list<CapstoneProject>(COLLECTION, { userId })) as CapstoneProject[];
  } catch {
    return [];
  }
}

export async function updateCapstone(
  id: string,
  userId: string,
  patches: {
    title?: string;
    pitch?: string;
    status?: CapstoneProject["status"];
    showcaseUrl?: string;
  },
): Promise<CapstoneProject | null> {
  try {
    const existing = await getStore().get<CapstoneProject>(COLLECTION, id);
    if (!existing || existing.userId !== userId) return null;

    const updated: CapstoneProject = {
      ...existing,
      ...(patches.title !== undefined ? { title: patches.title } : {}),
      ...(patches.pitch !== undefined ? { pitch: patches.pitch } : {}),
      ...(patches.status !== undefined ? { status: patches.status } : {}),
      ...(patches.showcaseUrl !== undefined ? { showcaseUrl: patches.showcaseUrl } : {}),
      updatedAt: nowIso(),
    };

    const parsed = CapstoneProjectZ.safeParse(updated);
    if (!parsed.success) return null;

    return await getStore().upsert<CapstoneProject>(COLLECTION, id, parsed.data, userId);
  } catch {
    return null;
  }
}

export async function toggleMilestone(
  id: string,
  userId: string,
  milestoneId: string,
  done: boolean,
): Promise<boolean> {
  try {
    const existing = await getStore().get<CapstoneProject>(COLLECTION, id);
    if (!existing || existing.userId !== userId) return false;

    let matched = false;
    const milestones = existing.milestones.map((m) => {
      if (m.id === milestoneId) { matched = true; return { ...m, done }; }
      return m;
    });
    if (!matched) return false;
    const updated: CapstoneProject = { ...existing, milestones, updatedAt: nowIso() };

    const parsed = CapstoneProjectZ.safeParse(updated);
    if (!parsed.success) return false;

    await getStore().upsert<CapstoneProject>(COLLECTION, id, parsed.data, userId);
    return true;
  } catch {
    return false;
  }
}

// Re-export the milestone schema type for consumers that want to validate a milestone.
export { MilestoneZ };
