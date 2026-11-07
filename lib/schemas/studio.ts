// P5 · Project Studio "proof loop" + peer-teaching insights: shared request/response shapes.
// Additive P5 routes (not in contract §6 yet): POST /api/projects/review, POST /api/projects/merge, GET /api/pods/insights.
import { z } from "zod";
import { BadgeIdZ, SkillIdZ } from "@/lib/schemas/community";

/** POST /api/projects/review: "Review my PR now" (AI Tech Lead without needing a webhook). */
export const ProjectReviewReqZ = z.object({
  podId: z.string().min(1),
  prNumber: z.number().int().positive().optional(), // default: latest open PR in the pod repo
});
export const PRReviewZ = z.object({
  prUrl: z.string(),
  prTitle: z.string(),
  /** Socratic review markdown (≤ 6 bullets, guiding questions, no long code blocks). */
  comment: z.string(),
  /** The same bullets as plain strings, for the UI. */
  hints: z.array(z.string()),
  /** true when the comment was actually posted on GitHub. */
  posted: z.boolean(),
  source: z.enum(["live", "demo"]),
  runId: z.string().optional(),
});
export type PRReview = z.infer<typeof PRReviewZ>;

/** POST /api/projects/merge: a pod PR for issue #issueIndex merged → proof of skill (also called by the webhook). */
export const ProjectMergeReqZ = z.object({
  podId: z.string().min(1),
  issueIndex: z.number().int().min(0),
  prUrl: z.string().optional(),
});
export const ProofResultZ = z.object({
  podId: z.string(),
  issueIndex: z.number(),
  userId: z.string(),
  skillId: SkillIdZ,
  skillName: z.string(),
  reviewerUserId: z.string(),
  /** Evidence ids written: learner's skill proof + reviewer's code-review proof. */
  evidenceIds: z.array(z.string()),
  /** Learner's readiness for their primary role, 0..1, before and after the skill became proven. */
  readinessBefore: z.number(),
  readinessAfter: z.number(),
  badgesEarned: z.array(BadgeIdZ),
  momentumPoints: z.number(),
  /** e.g. "Docker is now proven on Aisha's Bridge Map · readiness 38% → 41%". */
  message: z.string(),
  runId: z.string().optional(),
});
export type ProofResult = z.infer<typeof ProofResultZ>;

/** GET /api/pods/insights?programmeId=: anonymous peer-teaching stats for the Teaching pillar (n ≥ 10 only). */
export const PodInsightsZ = z.object({
  programmeId: z.string(),
  cohortSize: z.number(),
  /** Below the anonymity threshold (10) the lists are empty and `suppressed` is true. */
  suppressed: z.boolean(),
  podsCount: z.number(),
  /** Skills students can teach each other (proven by ≥1 peer and a gap for ≥1 other). */
  peerTeachable: z.array(z.object({ skillId: SkillIdZ, teachers: z.number(), learners: z.number() })),
  /** Gaps that nobody in the cohort has proven: where staff teaching matters most. */
  unteachableGaps: z.array(z.object({ skillId: SkillIdZ, studentsWithGap: z.number() })),
});
export type PodInsights = z.infer<typeof PodInsightsZ>;
