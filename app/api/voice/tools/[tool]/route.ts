import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { verifySecret } from "@/lib/n8n";
import { FeedbackReqZ } from "@/lib/schemas/voice";
import { getStore } from "@/lib/store";
import type { LearningDNA, Profile, RoleDemand } from "@/lib/types";
import { scoreInterview } from "@/lib/voice/interviewScoring";
import { roleName } from "@/lib/voice/roles";
import { badRequest, fail, internal, ok, unauthorized } from "@/lib/voice/http";


// ElevenLabs server-tool webhooks. Each tool is configured in the agent with header x-keystone-secret and a JSON
// body holding its parameters (top level, or under `parameters`).

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const Id = z.string().trim().min(1).max(64).regex(SAFE_ID);
// Role ids are kebab-case slugs (market fixtures, /api/n8n/callback); "ML-Engineer" is stored as "ml-engineer".
const RoleId = z.string().trim().toLowerCase().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
// Same limits as /api/interview/feedback.
const MAX_TRANSCRIPT_CHARS = 50_000;
// LLM tool calls sometimes send numbers as strings ("10"); accept both.
const Num = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite());

const GetProfileZ = z.object({ userId: Id });
const GetRoleSkillsZ = z.object({ roleId: RoleId });
const SaveDnaZ = z.object({
  userId: Id,
  targetRoles: z.array(RoleId).min(1).max(2).optional(),
  timelineLabel: z.string().max(120).optional(),
  targetDate: z.string().max(40).optional(),
  hoursPerWeek: Num.optional(),
  theoryPractice: Num.optional(),
  formats: z.array(z.enum(["video", "docs", "projects", "pair"])).optional(),
  budget: z.enum(["free", "paid-ok"]).optional(),
  constraints: z.array(z.string().max(80)).max(10).optional(),
  accessibility: z.array(z.enum(["dyslexia-friendly", "audio-first", "high-contrast", "reduced-motion"])).optional(),
  language: z.string().min(2).max(20).optional(),
});
const LogInterviewZ = FeedbackReqZ.extend({
  transcript: z
    .string()
    .max(MAX_TRANSCRIPT_CHARS)
    .refine((t) => t.trim().length > 0),
  durationSec: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite().positive()),
});

const ML_ENGINEER_DEFAULT = [
  { skill: "python", pct: 86 },
  { skill: "machine-learning", pct: 78 },
  { skill: "pytorch", pct: 52 },
  { skill: "sql", pct: 48 },
  { skill: "docker", pct: 41 },
];

const AISHA_DEFAULT: Profile = {
  id: "aisha",
  name: "Aisha",
  programmeId: "uom-bsc-cs",
  year: 1,
  startedAt: "2026-09-21",
  dna: {
    targetRoles: ["ml-engineer"],
    timelineLabel: "Placement applications Sept 2027",
    targetDate: "2027-09-01",
    hoursPerWeek: 8,
    theoryPractice: 70,
    formats: ["projects", "docs"],
    budget: "free",
    constraints: ["part-time job"],
    accessibility: [],
    language: "en",
  },
  badges: ["new-to-uni", "international"],
  interests: ["machine learning"],
  availability: ["sat-am"],
  isDemo: true,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", rel.replace(/^data\//, "")), "utf8")) as T;
  } catch {
    return null;
  }
}

// Store first, then P2's fixture, then the built-in Aisha.
async function loadProfile(userId: string): Promise<Profile | null> {
  const stored = await getStore().get<Profile>("profiles", userId);
  if (stored) return stored;
  const fixture = await readJson<Profile>(`data/fixtures/profile.${userId}.json`);
  if (fixture?.dna) return { ...fixture, id: fixture.id ?? userId };
  return userId === "aisha" ? structuredClone(AISHA_DEFAULT) : null;
}

async function loadRoleDemand(roleId: string): Promise<Partial<RoleDemand> | null> {
  for (const rel of [`data/fixtures/market.${roleId}.json`, `data/cache/market-${roleId}-uk.json`]) {
    const d = await readJson<Partial<RoleDemand>>(rel);
    if (d && Array.isArray(d.skills)) return d;
  }
  return null;
}

const notFound = (what: string) => fail("not_found", `${what} not found`, 404);

async function getProfile(params: unknown) {
  const p = GetProfileZ.safeParse(params);
  if (!p.success) return badRequest("Expected { userId }");
  const profile = await loadProfile(p.data.userId);
  if (!profile) return notFound("Profile");
  return ok({ name: profile.name, year: profile.year, targetRoles: profile.dna?.targetRoles ?? [], badges: profile.badges ?? [] });
}

async function getRoleSkills(params: unknown) {
  const p = GetRoleSkillsZ.safeParse(params);
  if (!p.success) return badRequest("Expected { roleId }");
  const { roleId } = p.data;
  const demand = await loadRoleDemand(roleId);
  const topSkills = demand?.skills
    ? [...demand.skills]
        .filter((s) => typeof s?.skillId === "string" && typeof s?.share === "number")
        .sort((a, b) => b.share - a.share)
        .slice(0, 5)
        .map((s) => ({ skill: s.skillId, pct: Math.round(s.share * 100) }))
    : roleId === "ml-engineer"
      ? ML_ENGINEER_DEFAULT
      : [];
  return ok({ role: demand?.roleName ?? roleName(roleId), topSkills });
}

async function saveDna(params: unknown) {
  const p = SaveDnaZ.safeParse(params);
  if (!p.success) return badRequest("Expected { userId, ...learning DNA fields }");
  const { userId, hoursPerWeek, theoryPractice, ...rest } = p.data;
  const profile = await loadProfile(userId);
  if (!profile) return notFound("Profile");

  const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<LearningDNA>;
  if (hoursPerWeek !== undefined) patch.hoursPerWeek = clamp(hoursPerWeek, 1, 40);
  if (theoryPractice !== undefined) patch.theoryPractice = clamp(theoryPractice, 0, 100);

  const next: Profile = { ...profile, id: profile.id ?? userId, dna: { ...profile.dna, ...patch } };
  await getStore().upsert("profiles", next.id, next, next.id);
  return ok({ saved: true });
}

async function logInterview(params: unknown) {
  const p = LogInterviewZ.safeParse(params);
  if (!p.success) return badRequest("Expected { userId, roleId, transcript (not empty, max 50,000 chars), durationSec > 0 }");
  const feedback = await scoreInterview(p.data);
  return ok({ scores: feedback.scores });
}

const TOOLS: Record<string, (params: unknown) => Promise<Response>> = {
  get_profile: getProfile,
  get_role_skills: getRoleSkills,
  save_dna: saveDna,
  log_interview: logInterview,
};

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  try {
    if (!verifySecret(req)) return unauthorized();
    const { tool } = await ctx.params;
    const handler = Object.hasOwn(TOOLS, tool) ? TOOLS[tool] : undefined;
    if (!handler) return fail("not_found", "Unknown tool", 404);

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Body must be a JSON object");
    const nested = (body as { parameters?: unknown }).parameters;
    const params = nested && typeof nested === "object" && !Array.isArray(nested) ? nested : body;
    return await handler(params);
  } catch {
    return internal();
  }
}
