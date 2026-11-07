// Story Mode (Keystone Labs "story"): the shared contract for a self-presenting tour of Keystone.
// Pure (no I/O), so the Director (server), the route, the tool and the player (client) all use it.
import { z } from "zod";
import type { AgentName } from "@/lib/types";

const AGENTS = [
  "orchestrator", "syllabus", "skillmap", "market", "trends", "evidence", "roadmap",
  "matchmaker", "architect", "techlead", "trajectories", "guides", "voice", "n8n",
] as const satisfies readonly AgentName[];
export const AgentNameZ = z.enum(AGENTS);

/** A number or quote the narration may use, and the live endpoint it came from. */
export const StoryFactZ = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  /** How it is shown on screen, e.g. "38%". */
  display: z.string(),
  /** The existing Keystone API that serves this value, e.g. "GET /api/graph/aisha". */
  source: z.string(),
});
export type StoryFact = z.infer<typeof StoryFactZ>;

/** A live check the player runs against an existing API when the beat appears ("don't trust the script"). */
export const StoryVerifyZ = z.object({
  /** Same-origin GET path, always under /api/. */
  path: z.string().regex(/^\/api\/[A-Za-z0-9/_?=&.-]+$/, "a same-origin /api/ path"),
  /** Dot path into the envelope's `data` ("readinessNow", "weeks.0.receipt.demandPct", "length"). */
  pick: z.string().regex(/^[A-Za-z0-9_.]+$/),
  expect: z.union([z.number(), z.string()]),
  /** What the check proves, in plain words, e.g. "Readiness today". */
  label: z.string(),
  format: z.enum(["pct", "int", "text"]),
});
export type StoryVerify = z.infer<typeof StoryVerifyZ>;

export const CheckpointKindZ = z.enum(["peer-approval", "student-approval", "lecturer-decision", "student-sends"]);
export const StoryCheckpointZ = z.object({
  kind: CheckpointKindZ,
  /** "A podmate approves" (CHECKPOINT_LABELS). */
  label: z.string(),
  /** The rule, quoted from the agent registry where the agent has one. */
  note: z.string(),
});
export type StoryCheckpoint = z.infer<typeof StoryCheckpointZ>;

const SkillRowZ = z.object({
  name: z.string(), demandPct: z.number(), trend: z.enum(["rising", "stable", "declining"]).optional(),
  status: z.enum(["proven", "degree-done", "degree-upcoming", "gap"]),
});

export const StoryVisualZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sources"), programme: z.string(), modules: z.number(), role: z.string(), ads: z.number(), evidence: z.number(), repos: z.array(z.string()) }),
  z.object({ kind: z.literal("map"), now: z.number(), projected: z.number(), skills: z.number(), byLabel: z.string(), gaps: z.array(SkillRowZ) }),
  z.object({
    kind: z.literal("receipt"), week: z.number(), focus: z.string(), demandPct: z.number(), trend: z.string().optional(), reason: z.string(),
    tasks: z.array(z.object({ title: z.string(), hours: z.number(), type: z.string() })), proof: z.string(),
    skip: z.object({ name: z.string(), message: z.string() }).optional(),
  }),
  z.object({
    kind: z.literal("pod"), name: z.string(), scorePct: z.number(), explanation: z.string(),
    members: z.array(z.object({ name: z.string(), learns: z.array(z.string()), teaches: z.array(z.string()), isSubject: z.boolean() })),
  }),
  z.object({
    kind: z.literal("project"), title: z.string(), repoUrl: z.string(), issues: z.number(), milestones: z.array(z.string()),
    issue: z.object({ number: z.number(), title: z.string(), skill: z.string(), reviewer: z.string() }), weekProof: z.string(),
  }),
  z.object({ kind: z.literal("review"), prNumber: z.number(), prTitle: z.string(), diffLines: z.number(), hints: z.array(z.object({ topic: z.string(), question: z.string() })) }),
  z.object({ kind: z.literal("delta"), skill: z.string(), before: z.number(), after: z.number(), merged: z.boolean(), points: z.number(), reviewer: z.string() }),
  z.object({ kind: z.literal("ladder"), skill: z.string(), level: z.number(), rungs: z.array(z.object({ rung: z.number(), label: z.string(), done: z.boolean(), meaning: z.string() })) }),
  z.object({
    kind: z.literal("cohort"), cohortSize: z.number(), suppressed: z.boolean(), labIdea: z.string(),
    gaps: z.array(z.object({ name: z.string(), demandPct: z.number(), students: z.number(), teachers: z.number() })),
  }),
  z.object({ kind: z.literal("flywheel"), trajectories: z.number(), openToChat: z.number(), loop: z.array(z.string()) }),
]);
export type StoryVisual = z.infer<typeof StoryVisualZ>;

export const StoryBeatZ = z.object({
  id: z.string(),
  index: z.number(),
  /** "Week 0", "Week 2", "Next term". */
  when: z.string(),
  title: z.string(),
  /** The agent that acted in this beat. */
  agent: AgentNameZ,
  /** Other agents that fed it. */
  with: z.array(AgentNameZ),
  /** What is spoken and captioned. Every number in it is grounded in `facts`. */
  narration: z.string(),
  /** Why the agent did it: the receipt, one or two sentences. */
  why: z.string(),
  checkpoint: StoryCheckpointZ.nullable(),
  /** The agent this beat hands its output to, and what crosses the handoff. */
  handoff: z.object({ toAgent: AgentNameZ, carries: z.string() }),
  /** The real Keystone screen for this beat. */
  screen: z.object({ href: z.string().regex(/^\/[A-Za-z0-9/_?=&.-]*$/), label: z.string() }),
  /** The existing endpoint that serves this beat's data. */
  api: z.string(),
  verify: StoryVerifyZ.nullable(),
  facts: z.array(StoryFactZ),
  visual: StoryVisualZ,
  grounding: z.object({ checked: z.array(z.string()), removed: z.array(z.string()) }),
  /** Suggested on-screen time in seconds (autoplay without a voice). */
  seconds: z.number().min(4).max(30),
});
export type StoryBeat = z.infer<typeof StoryBeatZ>;

export const StoryZ = z.object({
  runId: z.string(),
  subject: z.object({ userId: z.string(), name: z.string(), roleId: z.string(), roleName: z.string(), programmeId: z.string() }),
  mode: z.enum(["demo", "live"]),
  beats: z.array(StoryBeatZ),
  /** Beats the Director could not build from live data, and why (never faked). */
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
  grounding: z.object({ checked: z.number(), removed: z.number() }),
  agents: z.array(AgentNameZ),
  totalSeconds: z.number(),
  generatedAt: z.string(),
});
export type Story = z.infer<typeof StoryZ>;

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
export const StoryReqZ = z.object({
  studentId: z.string().regex(SAFE_ID, "studentId must be a plain id like aisha").optional(),
  roleId: z.string().regex(SAFE_ID, "roleId must be a plain id like ml-engineer").optional(),
}).strict();
export type StoryReq = z.infer<typeof StoryReqZ>;

export const RememberReqZ = z.object({
  /** The person must tick it: the Coach only remembers what the student agreed to. */
  confirm: z.literal(true),
  beatsSeen: z.number().int().min(1).max(20),
}).strict();
