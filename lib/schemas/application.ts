// P5 · zod schemas for the Application Tracker (UC-2). Mirrors the application domain
// kept in lib/agents/application-tracker.ts; the store collection is "applications".
import { z } from "zod";
import { SkillIdZ } from "@/lib/schemas/community";

export const ApplicationStatusZ = z.enum([
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
]);

export const ApplicationZ = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  company: z.string().min(1),
  roleTitle: z.string().min(1),
  roleUrl: z.string().url().optional(),
  status: ApplicationStatusZ,
  appliedAt: z.string(),
  source: z.string().optional(),
  notes: z.string().optional(),
  matchedSkills: z.array(SkillIdZ),
  matchScore: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Body of POST /api/applications. userId comes from the session/cookie or the body. */
export const ApplicationCreateReqZ = z.object({
  userId: z.string().min(1).optional(),
  company: z.string().min(1),
  roleTitle: z.string().min(1),
  roleUrl: z.string().url().optional(),
  status: ApplicationStatusZ.optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

/** Body of PATCH /api/applications (id and userId are validated by the route). */
export const ApplicationUpdateReqZ = z.object({
  status: ApplicationStatusZ.optional(),
  notes: z.string().optional(),
});

/** Query of GET /api/applications. */
export const ApplicationListQueryZ = z.object({
  userId: z.string().min(1),
  status: ApplicationStatusZ.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type Application = z.infer<typeof ApplicationZ>;
export type ApplicationCreateReq = z.infer<typeof ApplicationCreateReqZ>;
export type ApplicationUpdateReq = z.infer<typeof ApplicationUpdateReqZ>;
export type ApplicationListQuery = z.infer<typeof ApplicationListQueryZ>;
