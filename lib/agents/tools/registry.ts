// STUB (p5/coach branch only): the smallest registry that lets POST /api/coach work and typecheck.
// The canonical registry (all 13 tools from AGENT-PRINCIPLES.md) is built by the tools agent and REPLACES this
// file at merge with the same exports: `TOOLS: AnyTool[]` and `getTool(name)`. The Coach takes tools by
// dependency injection, so nothing else depends on this stub.
import "server-only";
import { z } from "zod";
import { buildStudentContext, getWeekPlan, type StudentContext, type WeekPlan } from "@/lib/agents/coach/context";
import { matchPod } from "@/lib/agents/matchmaker";
import { getStore } from "@/lib/store";
import { skillName } from "@/lib/schemas/community";
import type { Pod, Profile } from "@/lib/types";
import type { AnyTool, KeystoneTool } from "./types";

const NoInput = z.object({});
const define = <O>(t: KeystoneTool<typeof NoInput, O>) => t as unknown as AnyTool;
const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const getStudentSnapshot = define<StudentContext>({
  name: "get_student_snapshot",
  title: "Read your student snapshot",
  description:
    "Use first when the student asks a general question about where they stand. Returns a compact brief: readiness now and projected, top 3 gaps with demand %, the current roadmap week, pod status and latest proof.",
  input: NoInput,
  effect: "read",
  requiresApproval: false,
  agent: "orchestrator",
  run: (_input, ctx) => buildStudentContext(ctx.userId),
  summarize: (out) => clip(out.text.split("\n").filter((l) => !l.startsWith("Memory:")).slice(0, 5).join(". ")),
});

const getWeekPlanTool = define<WeekPlan | null>({
  name: "get_week_plan",
  title: "Read this week's roadmap plan",
  description:
    "Use when the student asks what to do this week or next. Returns the current roadmap week: focus skill, open tasks and the proof that completes the week. Read-only.",
  input: NoInput,
  effect: "read",
  requiresApproval: false,
  agent: "roadmap",
  run: (_input, ctx) => getWeekPlan(ctx.userId),
  summarize: (w) => {
    if (!w) return "No roadmap week yet: the Bridge Map has no gaps to plan for.";
    const tasks = w.tasks.filter((t) => !t.done).slice(0, 3).map((t) => `${t.title} (${t.hours} h)`);
    return clip(`Week ${w.week}: focus ${w.skill}. Proof: ${w.proof}.${tasks.length ? ` Tasks: ${tasks.join("; ")}.` : ""}`);
  },
});

type PodOut = Pod & { names: Record<string, string>; me: string };
const findPod = define<PodOut>({
  name: "find_pod",
  title: "Find your pod",
  description:
    "Use when the student wants a team or study group. Runs the Matchmaker (skills and availability only, never demographics) and returns a new pod: members, who learns and teaches what, and why they were matched.",
  input: NoInput,
  effect: "write",
  requiresApproval: false,
  agent: "matchmaker",
  run: async (_input, ctx) => {
    const pod = await matchPod({ userId: ctx.userId, runId: ctx.runId });
    const names: Record<string, string> = {};
    for (const m of pod.members) {
      const p = await getStore().get<Profile>("profiles", m.userId).catch(() => null);
      names[m.userId] = p?.name?.split(" ")[0] ?? m.userId[0].toUpperCase() + m.userId.slice(1);
    }
    return { ...pod, names, me: ctx.userId };
  },
  summarize: (p) => {
    const others = p.members.filter((m) => m.userId !== p.me).map((m) => `${p.names[m.userId]} (teaches ${m.teaches.map(skillName).join(", ") || "-"})`);
    const why = p.explanations.filter((e) => e.fromUserId === p.me).slice(0, 2).map((e) => e.text).join(" ");
    return clip(`${p.name} (match score ${p.score.toFixed(2)}): you with ${others.join(", ")}. ${why}`);
  },
});

export const TOOLS: AnyTool[] = [getStudentSnapshot, getWeekPlanTool, findPod];

export function getTool(name: string): AnyTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
