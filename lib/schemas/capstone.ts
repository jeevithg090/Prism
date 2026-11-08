// P5 · zod schemas for the solo capstone/portfolio project (UC-4).
// Mirrors the capstone project shape: a milestone roadmap built from the student's
// biggest skill gaps, with build tasks, deployment steps and a "ready to showcase" checklist.
import { z } from "zod";
import { SkillIdZ } from "@/lib/schemas/community";

export const MilestoneZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  skillId: SkillIdZ,
  tasks: z.array(z.string().min(1)),
  done: z.boolean(),
  dueAt: z.string().datetime().optional(),
});

export const CapstoneProjectZ = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  pitch: z.string().min(1),
  roleId: z.string(),
  targetSkills: z.array(SkillIdZ),
  milestones: z.array(MilestoneZ),
  status: z.enum(["planning", "in-progress", "showcasing", "completed"]),
  showcaseUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CapstoneCreateReqZ = z.object({
  userId: z.string().min(1),
  title: z.string().min(1),
  pitch: z.string().optional(),
  roleId: z.string().optional(),
  targetSkills: z.array(SkillIdZ).optional(),
});

export const CapstoneUpdateReqZ = z.object({
  title: z.string().min(1).optional(),
  pitch: z.string().optional(),
  status: z.enum(["planning", "in-progress", "showcasing", "completed"]).optional(),
  showcaseUrl: z.string().url().optional(),
});

export const MilestoneUpdateReqZ = z.object({
  milestoneId: z.string().min(1),
  done: z.boolean(),
});

export type CapstoneProject = z.infer<typeof CapstoneProjectZ>;
export type Milestone = z.infer<typeof MilestoneZ>;
export type CapstoneCreateReq = z.infer<typeof CapstoneCreateReqZ>;
export type CapstoneUpdateReq = z.infer<typeof CapstoneUpdateReqZ>;
export type MilestoneUpdateReq = z.infer<typeof MilestoneUpdateReqZ>;
