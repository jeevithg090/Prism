import { z } from "zod";

// ---- API envelope helpers ----
export const ok = <T>(data: T, init?: ResponseInit) => Response.json({ ok: true, data }, init);
export const fail = (status: number, code: string, message: string) =>
  Response.json({ ok: false, error: { code, message } }, { status });

// ---- Contract schemas ----
const Level = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const Trend = z.enum(["rising", "stable", "declining"]);

export const LearningDNAZ = z.object({
  targetRoles: z.array(z.string()).min(1).max(2),
  timelineLabel: z.string(), targetDate: z.string(),
  hoursPerWeek: z.number().min(1).max(40), theoryPractice: z.number().min(0).max(100),
  formats: z.array(z.enum(["video", "docs", "projects", "pair"])),
  budget: z.enum(["free", "paid-ok"]), constraints: z.array(z.string()),
  accessibility: z.array(z.enum(["dyslexia-friendly", "audio-first", "high-contrast", "reduced-motion"])),
  language: z.string(),
});
export const ProfileZ = z.object({
  id: z.string(), name: z.string().min(1), avatarUrl: z.string().optional(),
  githubLogin: z.string().optional(), leetcodeUser: z.string().optional(),
  programmeId: z.string(), year: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  startedAt: z.string(), dna: LearningDNAZ,
  badges: z.array(z.enum(["new-to-uni", "international", "first-gen", "career-changer", "helper", "shipped", "interview-ready"])),
  interests: z.array(z.string()), availability: z.array(z.string()), isDemo: z.boolean().optional(),
});
export const EvidenceItemZ = z.object({
  id: z.string(), userId: z.string(), skillId: z.string(), level: Level, confidence: z.number().min(0).max(1),
  source: z.enum(["github", "leetcode", "codeforces", "stackoverflow", "kaggle", "linkedin-pdf", "certificate", "keystone-pod", "keystone-interview", "micro-challenge"]),
  url: z.string(), quote: z.string().optional(), createdAt: z.string(),
});
const Category = z.enum(["language", "framework", "data", "ml-ai", "cloud-devops", "cs-fundamentals", "practice", "professional"]);
export const BridgeMapZ = z.object({
  userId: z.string(), roleId: z.string(),
  nodes: z.array(z.object({
    skillId: z.string(), name: z.string(), category: Category,
    status: z.enum(["proven", "degree-done", "degree-upcoming", "gap"]),
    demand: z.number().min(0).max(1), trend: Trend.optional(), level: Level,
    evidenceIds: z.array(z.string()), moduleCodes: z.array(z.string()), upcomingLabel: z.string().optional(),
  })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), kind: z.enum(["prereq", "co-occurs"]) })),
  readinessNow: z.number().min(0).max(1), readinessProjected: z.number().min(0).max(1), generatedAt: z.string(),
});
export const RoadmapTaskZ = z.object({
  id: z.string(), type: z.enum(["learn", "practice", "build", "primer"]), title: z.string(),
  resourceUrl: z.string().optional(), free: z.boolean(), hours: z.number(), done: z.boolean().optional(),
});
export const RoadmapZ = z.object({
  userId: z.string(), roleId: z.string(), version: z.number(),
  readinessNow: z.number(), readinessProjected: z.number(),
  weeks: z.array(z.object({
    week: z.number(), startDate: z.string(), focusSkillId: z.string(), isExamWeek: z.boolean(),
    tasks: z.array(RoadmapTaskZ), proof: z.string(), degreeLink: z.string().optional(),
    receipt: z.object({
      demandPct: z.number(), trend: Trend.optional(), growthPerYear: z.number().optional(),
      coveredByDegree: z.enum(["no", "done", "upcoming"]), moduleCode: z.string().optional(),
      evidenceIds: z.array(z.string()).optional(), reason: z.string(),
    }),
  })),
  skipped: z.array(z.object({ skillId: z.string(), moduleCode: z.string(), message: z.string() })),
  generatedAt: z.string(),
});
export const AgentEventZ = z.object({
  runId: z.string(),
  agent: z.enum(["orchestrator", "syllabus", "skillmap", "market", "trends", "evidence", "roadmap", "matchmaker", "architect", "techlead", "trajectories", "guides", "voice", "n8n"]),
  status: z.enum(["started", "progress", "done", "error"]), message: z.string(), ts: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

// ---- Request schemas ----
export const ProfileCreateZ = ProfileZ.omit({ id: true }).extend({ id: z.string().optional() });
export const ProfileUpdateZ = ProfileZ.partial().extend({ dna: LearningDNAZ.partial().optional() });
export const OnboardRunZ = z.object({ userId: z.string().min(1) });
export const EvidenceSyncZ = z.object({ userId: z.string().min(1), githubLogin: z.string().optional(), leetcodeUser: z.string().optional() });
export const RoadmapGenerateZ = z.object({ userId: z.string().min(1), roleId: z.string().min(1) });
export const TaskPatchZ = z.object({ done: z.boolean() });
