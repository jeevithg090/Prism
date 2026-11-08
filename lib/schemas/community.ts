// P5 · zod schemas for the Community API boundary (pods, projects, trajectories, help, momentum, guides).
// Mirrors lib/types.ts exactly; the `satisfies`-style checks at the bottom keep them in sync.
import { z } from "zod";
import type {
  BadgeId, GuideSuggestion, HelpRequest, MatchExplanation, MomentumWeek, Pod, PodMember,
  Profile, ProjectBrief, ProjectIssue, Trajectory, TrajectoryStep,
} from "@/lib/types";

export const SkillIdZ = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case skill id");

export const BadgeIdZ = z.enum([
  "new-to-uni", "international", "first-gen", "career-changer", "helper", "shipped", "interview-ready",
]);

export const LearningDNAZ = z.object({
  targetRoles: z.array(z.string()).min(1).max(2),
  timelineLabel: z.string(),
  targetDate: z.string(),
  hoursPerWeek: z.number().min(1).max(40),
  theoryPractice: z.number().min(0).max(100),
  formats: z.array(z.enum(["video", "docs", "projects", "pair"])),
  budget: z.enum(["free", "paid-ok"]),
  constraints: z.array(z.string()),
  accessibility: z.array(z.enum(["dyslexia-friendly", "audio-first", "high-contrast", "reduced-motion"])),
  language: z.string(),
});

export const ProfileZ = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
  githubLogin: z.string().optional(),
  leetcodeUser: z.string().optional(),
  programmeId: z.string(),
  year: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  startedAt: z.string(),
  dna: LearningDNAZ,
  badges: z.array(BadgeIdZ),
  interests: z.array(z.string()),
  availability: z.array(z.string()),
  isDemo: z.boolean().optional(),
});

export const PodMemberZ = z.object({
  userId: z.string().min(1),
  learns: z.array(SkillIdZ),
  teaches: z.array(SkillIdZ),
  role: z.string(),
});

export const MatchExplanationZ = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  text: z.string().min(1),
});

export const ProjectIssueZ = z.object({
  title: z.string().min(1),
  body: z.string(),
  assigneeUserId: z.string(),
  reviewerUserId: z.string(),
  skillId: SkillIdZ,
  milestone: z.string(),
  githubIssueUrl: z.string().url().optional(),
});

export const ProjectBriefZ = z.object({
  title: z.string().min(1),
  pitch: z.string().min(1),
  milestones: z.array(z.string().min(1)),
  issues: z.array(ProjectIssueZ),
  repoUrl: z.string().url().optional(),
});

/** What the Project Architect asks the LLM for (no repoUrl / issue URLs yet). */
export const ProjectBriefDraftZ = z.object({
  title: z.string(),
  pitch: z.string(),
  milestones: z.array(z.string()),
  issues: z.array(ProjectIssueZ.omit({ githubIssueUrl: true })),
});

export const PodZ = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  members: z.array(PodMemberZ).min(1),
  explanations: z.array(MatchExplanationZ),
  score: z.number().min(0).max(1),
  project: ProjectBriefZ.optional(),
  discordChannelUrl: z.string().url().optional(),
  createdAt: z.string(),
});

export const TrajectoryStepZ = z.object({
  year: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  kind: z.enum(["module-choice", "project", "society", "hackathon", "internship", "placement", "first-role"]),
  label: z.string().min(1),
});

export const TrajectoryZ = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  programmeId: z.string(),
  steps: z.array(TrajectoryStepZ).min(1),
  outcomeRole: z.string().min(1),
  advice: z.string().min(1),
  isDemo: z.boolean(),
  openToChat: z.boolean(),
});

export const HelpKindZ = z.enum(["question", "chat-15", "code-review"]);
export const HelpStatusZ = z.enum(["open", "accepted", "done"]);

export const HelpRequestZ = z.object({
  id: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().optional(),
  kind: HelpKindZ,
  message: z.string().min(1),
  status: HelpStatusZ,
  createdAt: z.string(),
});

export const MomentumWeekZ = z.object({
  userId: z.string(),
  week: z.string().regex(/^\d{4}-W\d{2}$/, "ISO week like 2026-W45"),
  score: z.number(),
  baseline: z.number(),
  changePct: z.number(),
  breakdown: z.array(z.object({ kind: z.string(), points: z.number(), count: z.number() })),
});

export const GuideSuggestionZ = z.object({
  name: z.string().min(1),
  whyRelevant: z.string().min(1),
  publicUrl: z.string().url(),
  source: z.enum(["github", "web"]),
  suggestedQuestion: z.string().min(1),
  draftMessage: z.string().min(1),
});

/** data/seed/student-skills.json */
export const StudentSkillsZ = z.record(
  z.string(),
  z.object({ proven: z.array(SkillIdZ), gaps: z.array(SkillIdZ) }),
);

export const MomentumEventZ = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  kind: z.enum(["pr-merged", "roadmap-milestone", "helped-newcomer", "mock-interview", "problem-solved"]),
  ts: z.string(),
  label: z.string().optional(),
  url: z.string().optional(),
});

// ---------- Request schemas ----------
export const PodMatchReqZ = z.object({ userId: z.string().min(1) });
export const PodsListQueryZ = z.object({ userId: z.string().min(1) });
export const ProjectCreateReqZ = z.object({ podId: z.string().min(1) });
export const TrajectoriesQueryZ = z.object({ programmeId: z.string().min(1).optional() });
export const TrajectoriesSimilarQueryZ = z.object({
  userId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
/** POST /api/help: create (contract §6) */
export const HelpCreateReqZ = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1).optional(),
  kind: HelpKindZ,
  message: z.string().trim().min(1, "message is required").max(1000),
});
/** POST /api/help with an id: PATCH-like status update (P5 PR7) */
export const HelpUpdateReqZ = z.object({
  id: z.string().min(1),
  status: HelpStatusZ,
  toUserId: z.string().min(1).optional(),
});
export const GuidesFindReqZ = z.object({ userId: z.string().min(1) });
export const UserIdParamZ = z.object({ userId: z.string().min(1) });
export const PodIdParamZ = z.object({ podId: z.string().min(1) });

// ---------- compile-time sync with lib/types.ts ----------
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <T extends true>(t?: T) => t;
assertTrue<Same<z.infer<typeof BadgeIdZ>, BadgeId>>();
assertTrue<Same<z.infer<typeof PodMemberZ>, PodMember>>();
assertTrue<Same<z.infer<typeof MatchExplanationZ>, MatchExplanation>>();
assertTrue<Same<z.infer<typeof ProjectIssueZ>, ProjectIssue>>();
assertTrue<Same<z.infer<typeof ProjectBriefZ>, ProjectBrief>>();
assertTrue<Same<z.infer<typeof PodZ>, Pod>>();
assertTrue<Same<z.infer<typeof TrajectoryStepZ>, TrajectoryStep>>();
assertTrue<Same<z.infer<typeof TrajectoryZ>, Trajectory>>();
assertTrue<Same<z.infer<typeof HelpRequestZ>, HelpRequest>>();
assertTrue<Same<z.infer<typeof MomentumWeekZ>, MomentumWeek>>();
assertTrue<Same<z.infer<typeof GuideSuggestionZ>, GuideSuggestion>>();
assertTrue<Same<z.infer<typeof ProfileZ>, Profile>>();

export type MomentumEvent = z.infer<typeof MomentumEventZ>;
export type StudentSkills = z.infer<typeof StudentSkillsZ>;

/** Contract §5 core skill ids: fixtures may only use these. */
export const CORE_SKILL_IDS = [
  "python", "java", "javascript", "typescript", "c", "cpp", "sql", "html-css", "react", "nodejs", "rest-apis", "git", "linux",
  "docker", "kubernetes", "aws", "cloud-computing", "ci-cd", "testing", "data-structures", "algorithms", "databases",
  "postgresql", "system-design", "security-basics", "statistics", "linear-algebra", "machine-learning", "deep-learning",
  "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "data-visualisation", "llm-apps", "llm-evaluation",
  "vector-databases", "mlops", "code-review", "communication", "teamwork", "agile",
] as const;

// ---------- envelope helpers for P5 routes (contract §6) ----------
export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
export function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}
export function badRequest(err: z.ZodError | string): Response {
  return fail(400, "bad_request", typeof err === "string" ? err : err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
}
export function internal(): Response {
  return fail(500, "internal", "Something went wrong on our side.");
}

// ---------- skill display names (data/skills.json, contract core ids) ----------
import skillsJson from "@/data/skills.json";
const SKILL_NAME = new Map((skillsJson as { id: string; name: string }[]).map((s) => [s.id, s.name]));
/** "docker" → "Docker". Unknown ids are title-cased. */
export function skillName(id: string): string {
  return SKILL_NAME.get(id) ?? id.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}
