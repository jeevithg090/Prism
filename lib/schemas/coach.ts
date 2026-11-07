// P5 · Keystone Coach: the student-facing agent that plans, calls Keystone's specialist agents as tools,
// asks before acting, reflects on the result, and remembers what matters. Additive route: POST /api/coach.
import { z } from "zod";

export const ChatTurnZ = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });

export const CoachReqZ = z.object({
  userId: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
  history: z.array(ChatTurnZ).max(20).optional(),
  /** Present when the human approves (or denies) a pending side-effecting tool call. */
  approval: z
    .object({ tool: z.string().min(1), args: z.unknown(), decision: z.enum(["approve", "deny"]) })
    .optional(),
});
export type CoachReq = z.infer<typeof CoachReqZ>;

/** One visible step of the agent loop: perceive → plan → act → observe → reflect → answer. */
export const CoachStepZ = z.object({
  kind: z.enum(["context", "plan", "tool_call", "observation", "approval_request", "reflection", "guardrail", "memory", "answer"]),
  text: z.string(),
  tool: z.string().optional(),
  args: z.unknown().optional(),
  status: z.enum(["ok", "error", "needs_approval", "denied", "blocked", "modified"]).optional(),
  durationMs: z.number().optional(),
});
export type CoachStep = z.infer<typeof CoachStepZ>;

export const CoachResZ = z.object({
  runId: z.string(),
  steps: z.array(CoachStepZ),
  answer: z.string(),
  /** Set when the agent wants to run a side-effecting tool and needs the human to decide. */
  pendingApproval: z
    .object({ tool: z.string(), title: z.string(), args: z.unknown(), reason: z.string(), effect: z.enum(["write", "external"]) })
    .optional(),
  /** Short follow-up buttons the UI can show, e.g. "Start our project", "Review my PR". */
  suggestions: z.array(z.string()).max(4).optional(),
  /** "llm" when the model planned the steps, "rules" when the deterministic planner did (no key / demo / failure). */
  planner: z.enum(["llm", "rules"]),
});
export type CoachRes = z.infer<typeof CoachResZ>;

/** Long-term memory note about a student (collection `coach_memory`, id `${userId}:${n}`). Opt-in, visible, deletable. */
export const MemoryNoteZ = z.object({
  id: z.string(),
  userId: z.string(),
  kind: z.enum(["preference", "goal", "struggle", "win"]),
  text: z.string().max(240),
  source: z.string(), // e.g. "coach chat", "proof engine", "mock interview"
  createdAt: z.string(),
});
export type MemoryNote = z.infer<typeof MemoryNoteZ>;
