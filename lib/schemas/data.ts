// P1 data area: zod schemas for skills, programmes, market demand and trends (contract §5), plus route inputs (§6).
import { z } from "zod";

const SkillIdZ = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "skill ids are kebab-case");
const LevelZ = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const MonthZ = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "months are YYYY-MM");
const ShareZ = z.number().min(0).max(1);

export const SkillZ = z.object({
  id: SkillIdZ, name: z.string().min(1),
  category: z.enum(["language", "framework", "data", "ml-ai", "cloud-devops", "cs-fundamentals", "practice", "professional"]),
  aliases: z.array(z.string()), prereqs: z.array(SkillIdZ), isEmerging: z.boolean().optional(),
});

export const ModuleZ = z.object({
  code: z.string().min(1), title: z.string().min(1),
  year: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  semester: z.enum(["1", "2", "full-year"]), credits: z.number().optional(), compulsory: z.boolean(),
  topics: z.array(z.string()), learningOutcomes: z.array(z.string()), assessment: z.string().optional(),
  skills: z.array(z.object({ skillId: SkillIdZ, level: LevelZ })), industryNote: z.string().optional(),
});

export const ProgrammeZ = z.object({
  id: z.string().min(1), university: z.string(), name: z.string(), url: z.string(),
  modules: z.array(ModuleZ), extractedAt: z.string(), source: z.enum(["firecrawl", "cache", "manual"]),
});

const TrendLabelZ = z.enum(["rising", "stable", "declining"]);

export const RoleDemandZ = z.object({
  roleId: z.string(), roleName: z.string(), location: z.string(), adsAnalysed: z.number().int().nonnegative(),
  skills: z.array(z.object({ skillId: SkillIdZ, share: ShareZ, trend: TrendLabelZ.optional() })),
  salary: z.object({ p25: z.number(), median: z.number(), p75: z.number(), currency: z.literal("GBP") }).optional(),
  topCompanies: z.array(z.object({ name: z.string(), count: z.number() })),
  sampleAds: z.array(z.object({ title: z.string(), company: z.string(), url: z.string() })),
  snapshotAt: z.string(), source: z.enum(["adzuna", "reed", "cache"]),
});

export const TrendSeriesZ = z.object({
  skillId: SkillIdZ,
  history: z.array(z.object({ month: MonthZ, share: ShareZ })),
  projection: z.array(z.object({ month: MonthZ, share: ShareZ, low: ShareZ, high: ShareZ })),
  growthPerYear: z.number(), label: TrendLabelZ, source: z.literal("hn-whoishiring"),
});

// ---------- route inputs ----------
const flag = z.enum(["1", "true", "0", "false"]).optional().transform((v) => v === "1" || v === "true");
const RunIdZ = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional();

export const ExtractReqZ = z
  .object({
    url: z.url().optional(),
    text: z.string().min(50, "paste at least 50 characters of course text").max(60_000).optional(),
    programmeId: z.string().regex(/^[a-z0-9-]{1,64}$/).default("uom-bsc-cs"),
    runId: RunIdZ,
  })
  .refine((d) => d.url || d.text, { message: "send a programme url or the course text", path: ["url"] });

export const ProgrammeParamZ = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) });
export const RoleParamZ = z.object({ roleId: z.string().regex(/^[a-z0-9-]{1,64}$/) });

export const MarketQueryZ = z.object({
  location: z.string().trim().max(60).optional().transform((v) => (v ? (v.toLowerCase() === "uk" ? "UK" : v) : "UK")),
  refresh: flag, demo: flag, runId: RunIdZ,
});

export const TrendsQueryZ = z.object({
  skills: z
    .string()
    .optional()
    .transform((v) => (v ? [...new Set(v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))] : undefined))
    .pipe(z.array(SkillIdZ).max(50).optional()),
  demo: flag, runId: RunIdZ,
});

export const DemoQueryZ = z.object({ demo: flag });
