// Test helpers for the Coach (not a test file itself): fake tools injected into runCoach.
import { vi } from "vitest";
import { z } from "zod";
import type { AnyTool, ToolEffect } from "@/lib/agents/tools/types";
import type { AgentName } from "@/lib/types";
import type { Facts } from "./context";

export interface FakeToolOpts {
  title?: string;
  effect?: ToolEffect;
  requiresApproval?: boolean;
  agent?: AgentName;
  input?: z.ZodTypeAny;
  output?: unknown;
  summary?: string;
  fail?: string;
}

export function fakeTool(name: string, o: FakeToolOpts = {}): AnyTool & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => {
    if (o.fail) throw new Error(o.fail);
    return o.output ?? { ok: true, raw: `RAW_${name}` };
  });
  return {
    name,
    title: o.title ?? `Run ${name}`,
    description: `Fake ${name} for tests. Use it when the test says so.`,
    input: o.input ?? z.object({}),
    effect: o.effect ?? "read",
    requiresApproval: o.requiresApproval ?? false,
    agent: o.agent ?? "orchestrator",
    run,
    summarize: () => o.summary ?? `${name} summary.`,
  };
}

/** The canonical tool names, all as harmless fakes (approval flags as in AGENT-PRINCIPLES.md). */
export function canonicalFakes(): Record<string, ReturnType<typeof fakeTool>> {
  return {
    get_student_snapshot: fakeTool("get_student_snapshot"),
    get_bridge_map: fakeTool("get_bridge_map", { summary: "Readiness 38% now, 84% projected. Top gap Docker (41% of ads)." }),
    get_week_plan: fakeTool("get_week_plan", { agent: "roadmap", summary: "Week 1: focus Docker. Proof: Merge a PR that adds Docker to your pod repo." }),
    explain_recommendation: fakeTool("explain_recommendation", { input: z.object({ skillId: z.string() }) }),
    find_pod: fakeTool("find_pod", { effect: "write", agent: "matchmaker", summary: "Pod Orbit: you with Priya, Tom and Mei." }),
    get_my_pod: fakeTool("get_my_pod"),
    start_pod_project: fakeTool("start_pod_project", {
      effect: "external", requiresApproval: true, agent: "architect", title: "Start your pod project",
      input: z.object({ podId: z.string().optional() }), summary: "Created VisionAid with 7 issues.",
    }),
    review_my_pr: fakeTool("review_my_pr", { effect: "external", requiresApproval: true, agent: "techlead", input: z.object({ podId: z.string().optional() }) }),
    record_merged_pr: fakeTool("record_merged_pr", {
      effect: "write", requiresApproval: true, agent: "evidence",
      input: z.object({ podId: z.string().optional(), issueIndex: z.number().int().min(0).optional() }),
    }),
    find_students_like_me: fakeTool("find_students_like_me", { agent: "trajectories" }),
    get_momentum: fakeTool("get_momentum", { agent: "evidence" }),
    ask_for_help: fakeTool("ask_for_help", {
      effect: "write", requiresApproval: true, title: "Ask the Community for help",
      input: z.object({ message: z.string().min(1), kind: z.enum(["question", "chat-15", "code-review"]).default("question") }),
    }),
    find_guides: fakeTool("find_guides", { agent: "guides" }),
  };
}

export const FACTS: Facts = {
  userId: "aisha", name: "Aisha Rahman", firstName: "Aisha", role: "ML engineer", roleId: "ml-engineer", year: 1,
  badges: "new-to-uni,international", readinessNowPct: 38, readinessProjectedPct: 84,
  gap1: "Docker", gap1Id: "docker", gap1DemandPct: 41, gap1Receipt: "Docker: 41% of ML engineer ads; no module covers it; demand is rising",
  gap2: "PyTorch", gap2Id: "pytorch", gap2DemandPct: 38, gap2Receipt: "PyTorch: 38% of ML engineer ads; no module covers it",
  weekNumber: 1, weekFocus: "Docker", weekFocusId: "docker", podId: "pod_1", podName: "Pod Orbit", podMembers: 4, memoryNotes: 0,
};
export const CONTEXT = {
  text: "Student: Aisha Rahman (year 1, ML engineer)\nReadiness for ML engineer: 38% now → 84% projected\nTop gaps: Docker 41% of ads",
  facts: FACTS,
};

/** In-memory store with the same API as @/lib/store (for vi.mock). */
export function memoryStore() {
  const rows = new Map<string, { doc: unknown; userId?: string }>();
  return {
    rows,
    store: {
      get: async (c: string, id: string) => structuredClone((rows.get(`${c}/${id}`)?.doc as never) ?? null),
      list: async (c: string, f?: { userId?: string }) =>
        [...rows.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc as never)),
      upsert: async (c: string, id: string, doc: unknown, userId?: string) => { rows.set(`${c}/${id}`, { doc: structuredClone(doc), userId }); return doc as never; },
      remove: async (c: string, id: string) => { rows.delete(`${c}/${id}`); },
    },
  };
}
