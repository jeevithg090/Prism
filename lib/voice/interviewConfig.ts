import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "@/lib/store";
import type { BridgeMap, BridgeNode, Pod, Profile, Roadmap, RoadmapWeek } from "@/lib/types";
import { getSignedConversationUrl } from "./elevenlabs";
import { roleName, skillLabel } from "./roles";

export type InterviewAgent = "interview" | "onboard";

// Contract §6: GET /api/interview/config response.
export interface InterviewConfig {
  agentId: string;
  signedUrl?: string;
  dynamicVariables: Record<string, string>;
}

export const TEXT_MODE_AGENT = "text-mode";

export class InterviewNotFoundError extends Error {
  readonly code = "not_found";
  constructor(userId: string) {
    super(`No profile for user ${userId}`);
  }
}

// Used piece by piece whenever Aisha's store data or fixtures are missing, so the demo never shows blanks.
const AISHA_DEFAULT = {
  name: "Aisha",
  year: "1",
  roleId: "ml-engineer",
  top_skills: "Python, Git, HTML and CSS",
  gaps: "Docker, PyTorch, SQL",
  project_title: "VisionAid: accessible image captioning API",
  week_focus: "Docker",
};

// Neutral wording for other students, so the interviewer's prompt still reads naturally.
const GENERIC_DEFAULT = {
  top_skills: "the skills from your course so far",
  gaps: "new skills for this role",
  project_title: "a recent coursework or personal project",
  week_focus: "your next roadmap skill",
};

const SAFE_ID = /^[a-z0-9_-]{1,64}$/i;

// Teammates' fixtures may not exist yet, so read them lazily and never throw.
async function readFixture<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data/fixtures", file), "utf8")) as T;
  } catch {
    return null;
  }
}

async function safe<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const fromStore = await safe(getStore().get<Profile>("profiles", userId));
  if (fromStore) return fromStore;
  return SAFE_ID.test(userId) ? readFixture<Profile>(`profile.${userId}.json`) : null;
}

async function loadMap(userId: string, roleId: string): Promise<BridgeMap | null> {
  const fromStore = await safe(getStore().get<BridgeMap>("maps", `${userId}:${roleId}`));
  if (fromStore) return fromStore;
  return SAFE_ID.test(userId) && SAFE_ID.test(roleId) ? readFixture<BridgeMap>(`bridgemap.${userId}.${roleId}.json`) : null;
}

async function loadRoadmap(userId: string, roleId: string): Promise<Roadmap | null> {
  const fromStore = await safe(getStore().get<Roadmap>("roadmaps", userId));
  if (fromStore) return fromStore;
  return SAFE_ID.test(userId) && SAFE_ID.test(roleId) ? readFixture<Roadmap>(`roadmap.${userId}.${roleId}.json`) : null;
}

async function loadPod(userId: string): Promise<Pod | null> {
  const store = getStore();
  const own = (await safe(store.list<Pod>("pods", { userId }))) ?? [];
  if (own[0]) return own[0];
  // A pod is saved under the member who created it, so also look for one this student belongs to.
  const all = (await safe(store.list<Pod>("pods"))) ?? [];
  const member = all.find((p) => p.members?.some((m) => m.userId === userId));
  if (member) return member;
  return SAFE_ID.test(userId) ? readFixture<Pod>(`pod.${userId}.json`) : null;
}

const firstName = (name?: string) => name?.trim().split(/\s+/)[0] || undefined;
const joinNames = (nodes: BridgeNode[]) => (nodes.length ? nodes.slice(0, 3).map((n) => n.name || skillLabel(n.skillId)).join(", ") : undefined);

function topProven(map: BridgeMap | null): string | undefined {
  if (!map?.nodes) return undefined;
  const proven = map.nodes.filter((n) => n.status === "proven").sort((a, b) => b.level - a.level || b.demand - a.demand);
  return joinNames(proven);
}

function topGaps(map: BridgeMap | null): string | undefined {
  if (!map?.nodes) return undefined;
  const gaps = map.nodes.filter((n) => n.status === "gap" && n.demand > 0).sort((a, b) => b.demand - a.demand);
  return joinNames(gaps);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The week containing today; otherwise the first week with unfinished tasks; otherwise week 1.
export function currentWeek(roadmap: Roadmap | null, now = new Date()): RoadmapWeek | undefined {
  const weeks = roadmap?.weeks ?? [];
  const t = now.getTime();
  const inRange = weeks.find((w) => {
    const start = Date.parse(w.startDate);
    return Number.isFinite(start) && t >= start && t < start + WEEK_MS;
  });
  return inRange ?? weeks.find((w) => w.tasks?.some((task) => !task.done)) ?? weeks[0];
}

function weekFocus(roadmap: Roadmap | null, map: BridgeMap | null, now: Date): string | undefined {
  const week = currentWeek(roadmap, now);
  if (!week?.focusSkillId) return undefined;
  const node = map?.nodes?.find((n) => n.skillId === week.focusSkillId);
  return node?.name || skillLabel(week.focusSkillId);
}

async function resolveAgent(agent: InterviewAgent): Promise<{ agentId: string; signedUrl?: string }> {
  const envAgentId = agent === "onboard" ? process.env.ELEVENLABS_ONBOARD_AGENT_ID : process.env.ELEVENLABS_INTERVIEW_AGENT_ID;
  // DEMO_MODE pins the data, not the voice: the live demo still talks when keys are set, and falls back to text on any error.
  if (!process.env.ELEVENLABS_API_KEY || !envAgentId) return { agentId: TEXT_MODE_AGENT };
  try {
    return { agentId: envAgentId, signedUrl: await getSignedConversationUrl(envAgentId) };
  } catch {
    // ElevenLabs down or the key is wrong: the page switches to text mode instead of failing.
    return { agentId: TEXT_MODE_AGENT };
  }
}

export async function buildInterviewConfig(q: {
  userId: string;
  roleId?: string;
  agent?: InterviewAgent;
  now?: Date;
}): Promise<InterviewConfig> {
  const agent = q.agent ?? "interview";
  const isAisha = q.userId === "aisha";
  const profile = await loadProfile(q.userId);
  // New students use the onboarding coach before they have a profile, so only the interview needs one.
  if (!profile && !isAisha && agent === "interview") throw new InterviewNotFoundError(q.userId);

  const roleId = q.roleId ?? profile?.dna?.targetRoles?.[0] ?? AISHA_DEFAULT.roleId;
  const [map, roadmap, pod] = await Promise.all([loadMap(q.userId, roleId), loadRoadmap(q.userId, roleId), loadPod(q.userId)]);

  const d = isAisha ? AISHA_DEFAULT : GENERIC_DEFAULT;
  const dynamicVariables: Record<string, string> = {
    name: firstName(profile?.name) ?? (isAisha ? AISHA_DEFAULT.name : "there"),
    year: String(profile?.year ?? (isAisha ? AISHA_DEFAULT.year : "1")),
    role: roleName(roleId),
    top_skills: topProven(map) ?? d.top_skills,
    gaps: topGaps(map) ?? d.gaps,
    project_title: pod?.project?.title || d.project_title,
    week_focus: weekFocus(roadmap, map, q.now ?? new Date()) ?? d.week_focus,
  };

  return { ...(await resolveAgent(agent)), dynamicVariables };
}
