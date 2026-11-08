import "server-only";
// P4 · What the interviewer knows about you: role skills, your roadmap week and the pod PR you just merged.
// Becomes the ElevenLabs agent's dynamic variables ({{pr_title}} …) and the Practice-mode questions.
import {
  currentRoadmapWeek, DEFAULT_ROLE, firstName, latestPodWork, loadProfile, provenAndGaps, roleName, roleTopSkills,
  type PodWork,
} from "@/lib/voice/data";

export interface InterviewContext {
  userId: string;
  roleId: string;
  roleName: string;
  work: PodWork;
  roleKeywords: string[];
  dynamicVariables: Record<string, string>;
}

const list = (xs: { name: string }[]) => xs.map((x) => x.name).join(", ");

export async function interviewContext(userId: string, roleIdIn?: string): Promise<InterviewContext> {
  const profile = await loadProfile(userId);
  const roleId = roleIdIn || profile?.dna?.targetRoles?.[0] || DEFAULT_ROLE;
  const [top, split, week, work] = await Promise.all([
    roleTopSkills(roleId, userId, 5),
    provenAndGaps(userId, roleId, 3),
    currentRoadmapWeek(userId, roleId),
    latestPodWork(userId),
  ]);
  const role = roleName(roleId);
  const dynamicVariables: Record<string, string> = {
    user_id: userId,
    name: firstName(profile, userId),
    year: String(profile?.year ?? 1),
    role,
    role_id: roleId,
    role_top_skills: top.length ? top.map((s) => `${s.name} (${Math.round(s.share * 100)}% of ads)`).join(", ") : "Python, Docker, SQL",
    top_skills: list(split.proven) || "Python, Git",
    gaps: list(split.gaps) || "Docker, PyTorch, SQL",
    week_number: String(week.week),
    week_focus: week.focusName,
    pod_name: work.podName ?? "your pod",
    project_title: work.projectTitle ?? "your pod project",
    pr_title: work.issueTitle,
    pr_skill: work.skillName,
    pr_skill_id: work.skillId,
    pr_status: work.merged ? "merged" : "in progress",
    reviewer: work.reviewerName ?? "your reviewer",
  };
  return { userId, roleId, roleName: role, work, roleKeywords: top.map((s) => s.name), dynamicVariables };
}
