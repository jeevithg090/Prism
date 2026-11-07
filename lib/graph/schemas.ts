// Zod schemas for the Bridge Map, evidence and roadmap (contract §5) plus the request schemas for their routes.
import { z } from "zod";
import type { BridgeMap, EvidenceItem, Roadmap, RoadmapTask } from "@/lib/types";

const LevelZ = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const TrendZ = z.enum(["rising", "stable", "declining"]);
const CategoryZ = z.enum(["language", "framework", "data", "ml-ai", "cloud-devops", "cs-fundamentals", "practice", "professional"]);

export const EvidenceItemZ = z.object({
  id: z.string().min(1), userId: z.string().min(1), skillId: z.string().min(1), level: LevelZ,
  confidence: z.number().min(0).max(1),
  source: z.enum(["github", "leetcode", "codeforces", "stackoverflow", "kaggle", "linkedin-pdf", "certificate", "keystone-pod", "keystone-interview", "micro-challenge"]),
  url: z.string(), quote: z.string().optional(), createdAt: z.string(),
});

export const BridgeNodeZ = z.object({
  skillId: z.string().min(1), name: z.string(), category: CategoryZ,
  status: z.enum(["proven", "degree-done", "degree-upcoming", "gap"]),
  demand: z.number().min(0).max(1), trend: TrendZ.optional(), level: LevelZ,
  evidenceIds: z.array(z.string()), moduleCodes: z.array(z.string()), upcomingLabel: z.string().optional(),
});
export const BridgeMapZ = z.object({
  userId: z.string(), roleId: z.string(), nodes: z.array(BridgeNodeZ),
  edges: z.array(z.object({ from: z.string(), to: z.string(), kind: z.enum(["prereq", "co-occurs"]) })),
  readinessNow: z.number().min(0).max(1), readinessProjected: z.number().min(0).max(1), generatedAt: z.string(),
});

export const ReceiptZ = z.object({
  demandPct: z.number(), trend: TrendZ.optional(), growthPerYear: z.number().optional(),
  coveredByDegree: z.enum(["no", "done", "upcoming"]), moduleCode: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(), reason: z.string().min(1),
});
export const RoadmapTaskZ = z.object({
  id: z.string().min(1), type: z.enum(["learn", "practice", "build", "primer"]), title: z.string().min(1),
  resourceUrl: z.string().optional(), free: z.boolean(), hours: z.number().min(0), done: z.boolean().optional(),
});
export const RoadmapWeekZ = z.object({
  week: z.number().int().min(1), startDate: z.string(), focusSkillId: z.string().min(1), isExamWeek: z.boolean(),
  tasks: z.array(RoadmapTaskZ), proof: z.string().min(1), degreeLink: z.string().optional(), receipt: ReceiptZ,
});
export const RoadmapZ = z.object({
  userId: z.string(), roleId: z.string(), version: z.number().int().min(1),
  readinessNow: z.number().min(0).max(1), readinessProjected: z.number().min(0).max(1),
  weeks: z.array(RoadmapWeekZ),
  skipped: z.array(z.object({ skillId: z.string(), moduleCode: z.string(), message: z.string() })),
  generatedAt: z.string(),
});

// ---------- requests ----------
const Id = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/i, "letters, numbers, - and _ only");
export const UserParamZ = z.object({ userId: Id });
export const TaskParamZ = z.object({ userId: Id, taskId: z.string().min(1).max(64) });
export const GraphQueryZ = z.object({ roleId: Id.optional(), demo: z.enum(["1", "true"]).optional() });
export const EvidenceSyncReqZ = z.object({
  userId: Id,
  githubLogin: z.string().trim().regex(/^[a-z\d](?:[a-z\d-]{0,38})$/i, "a GitHub username").optional(),
  leetcodeUser: z.string().trim().min(1).max(64).optional(),
});
export const RoadmapGenerateReqZ = z.object({
  userId: Id,
  roleId: Id.optional(),
  /** Optional: the client can pick the run id first, so the Activity panel opens before the plan exists. */
  runId: z.string().regex(/^run_[A-Za-z0-9_-]{4,40}$/).optional(),
});
export const TaskPatchReqZ = z.object({ done: z.boolean() });

// ---------- compile-time sync with lib/types.ts ----------
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <T extends true>(t?: T) => t;
assertTrue<Same<z.infer<typeof EvidenceItemZ>, EvidenceItem>>();
assertTrue<Same<z.infer<typeof BridgeMapZ>, BridgeMap>>();
assertTrue<Same<z.infer<typeof RoadmapTaskZ>, RoadmapTask>>();
assertTrue<Same<z.infer<typeof RoadmapZ>, Roadmap>>();
