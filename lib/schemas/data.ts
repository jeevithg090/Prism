import { z } from "zod";
import type { Module, Programme, RoleDemand, Skill, TrendSeries } from "@/lib/types";

const Level = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const Year = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const TrendLabel = z.enum(["rising", "stable", "declining"]);
const Share = z.number().min(0).max(1);
const Month = z.string().regex(/^\d{4}-\d{2}$/);

export const SkillZ: z.ZodType<Skill> = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    "language", "framework", "data", "ml-ai", "cloud-devops",
    "cs-fundamentals", "practice", "professional",
  ]),
  aliases: z.array(z.string()),
  prereqs: z.array(z.string()),
  isEmerging: z.boolean().optional(),
});

export const ModuleZ: z.ZodType<Module> = z.object({
  code: z.string(),
  title: z.string(),
  year: Year,
  semester: z.enum(["1", "2", "full-year"]),
  credits: z.number().optional(),
  compulsory: z.boolean(),
  topics: z.array(z.string()),
  learningOutcomes: z.array(z.string()),
  assessment: z.string().optional(),
  skills: z.array(z.object({ skillId: z.string(), level: Level })),
  industryNote: z.string().optional(),
});

export const ProgrammeZ: z.ZodType<Programme> = z.object({
  id: z.string(),
  university: z.string(),
  name: z.string(),
  url: z.string(),
  modules: z.array(ModuleZ),
  extractedAt: z.string(),
  source: z.enum(["firecrawl", "cache", "manual"]),
});

export const RoleDemandZ: z.ZodType<RoleDemand> = z.object({
  roleId: z.string(),
  roleName: z.string(),
  location: z.string(),
  adsAnalysed: z.number(),
  skills: z.array(z.object({ skillId: z.string(), share: Share, trend: TrendLabel.optional() })),
  salary: z
    .object({ p25: z.number(), median: z.number(), p75: z.number(), currency: z.literal("GBP") })
    .optional(),
  topCompanies: z.array(z.object({ name: z.string(), count: z.number() })),
  sampleAds: z.array(z.object({ title: z.string(), company: z.string(), url: z.string() })),
  snapshotAt: z.string(),
  source: z.enum(["adzuna", "reed", "cache"]),
});

export const TrendSeriesZ: z.ZodType<TrendSeries> = z.object({
  skillId: z.string(),
  history: z.array(z.object({ month: Month, share: Share })),
  projection: z.array(z.object({ month: Month, share: Share, low: Share, high: Share })),
  growthPerYear: z.number(),
  label: TrendLabel,
  source: z.literal("hn-whoishiring"),
});

export const ExtractReqZ = z
  .object({
    url: z.string().url().optional(),
    text: z.string().min(50).optional(),
    programmeId: z.string().default("uom-bsc-cs"),
  })
  .refine((d) => d.url || d.text);
