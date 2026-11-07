// P5 · Keystone Coach: the student-facing agent loop.
// perceive (context) → plan → act (tools) → observe → reflect (grounding check) → answer → remember,
// with a human checkpoint before any side-effecting tool and escalation to a person after repeated failure.
// Tools are injected (`tools`), so the loop never depends on a particular registry.
import "server-only";
import { emit, newRunId } from "@/lib/agents/events";
import type { AnyTool } from "@/lib/agents/tools/types";
import { CoachResZ, type CoachReq, type CoachRes, type CoachStep } from "@/lib/schemas/coach";
import { buildStudentContext, contextSummary, type StudentContext } from "./context";
import { groundAnswer } from "./grounding";
import { addMemory, extractMemory } from "./memory";
import {
  approvalReason, buildSystemPrompt, buildUserPrompt, composeRulesAnswer, denyAlternative, detectIntent, fitArgs,
  limitWords, llmDecide, observationLine, rulesPlan, suggestionsFor, type Decision, type Observed, type RulesPlan,
} from "./planner";

export const MAX_ITERATIONS = 5;
export const MAX_TOOL_ERRORS = 2;
export const TOOL_TIMEOUT_MS = 20_000;

export interface RunCoachInput {
  userId: string;
  message: string;
  history?: CoachReq["history"];
  approval?: CoachReq["approval"];
  tools: AnyTool[];
  runId?: string;
  /** "auto" (default): the model plans, rules on any failure. DEMO_MODE forces "rules". */
  planner?: "auto" | "rules";
}

type Pending = NonNullable<CoachRes["pendingApproval"]>;

/** Stable JSON for deep-equal comparison of tool args. */
export function stableKey(tool: string, args: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v;
  return `${tool}:${JSON.stringify(sort(args ?? {}))}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)} s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const errText = (e: unknown) => clip(e instanceof Error ? e.message : String(e), 160);

const STEP_LABEL: Record<CoachStep["kind"], string> = {
  context: "perceive", plan: "plan", tool_call: "act", observation: "observe", approval_request: "ask you",
  reflection: "reflect", guardrail: "guardrail", memory: "remember", answer: "answer",
};

export async function runCoach(input: RunCoachInput): Promise<CoachRes> {
  const { userId, message, history, approval, tools } = input;
  const runId = input.runId ?? newRunId();
  const demo = process.env.DEMO_MODE === "true";
  let mode: "auto" | "rules" = demo ? "rules" : input.planner ?? "auto";
  const byName = new Map(tools.map((t) => [t.name, t]));
  const steps: CoachStep[] = [];
  const push = (s: CoachStep) => {
    steps.push(s);
    emit({
      runId, agent: "orchestrator", status: "progress",
      message: clip(`Coach · ${STEP_LABEL[s.kind]}: ${s.text}`, 200),
      data: { kind: s.kind, ...(s.tool ? { tool: s.tool } : {}), ...(s.status ? { status: s.status } : {}) },
    });
  };

  emit({ runId, agent: "orchestrator", status: "started", message: "Coach: reading your context" });

  // ---------- perceive ----------
  const ctx: StudentContext = await buildStudentContext(userId).catch(() => ({ text: `Student: ${userId}`, facts: { userId, firstName: userId } }));
  push({ kind: "context", text: contextSummary(ctx.facts), args: { brief: ctx.text } });

  const observed: Observed[] = [];
  const doneKeys = new Map<string, string>(); // stableKey → observation
  // mutable loop state (an object, so TypeScript doesn't narrow it across the async closures below)
  const st = { errors: 0, pending: undefined as Pending | undefined, draft: null as string | null, plannerUsed: "rules" as CoachRes["planner"], escalated: false };
  const intent = detectIntent(message).intent;

  const act = async (tool: AnyTool, args: Record<string, unknown>, approved: boolean): Promise<string> => {
    const t0 = Date.now();
    try {
      const out = await withTimeout(Promise.resolve(tool.run(args, { userId, runId, approved })), TOOL_TIMEOUT_MS);
      let obs: string;
      try { obs = clip(tool.summarize(out) || "Done.", 400); } catch { obs = "Done (no summary available)."; }
      push({ kind: "tool_call", text: tool.title, tool: tool.name, args, status: "ok", durationMs: Date.now() - t0 });
      push({ kind: "observation", text: obs, tool: tool.name, status: "ok" });
      observed.push({ tool: tool.name, text: obs, ok: true });
      doneKeys.set(stableKey(tool.name, args), obs);
      return obs;
    } catch (e) {
      st.errors++;
      const obs = `${tool.title} failed: ${errText(e)}`;
      push({ kind: "tool_call", text: tool.title, tool: tool.name, args, status: "error", durationMs: Date.now() - t0 });
      push({ kind: "observation", text: obs, tool: tool.name, status: "error" });
      observed.push({ tool: tool.name, text: obs, ok: false });
      doneKeys.set(stableKey(tool.name, args), obs);
      return `ERROR: ${obs}`;
    }
  };

  const askApproval = (tool: AnyTool, args: Record<string, unknown>, reason?: string) => {
    const why = reason ?? approvalReason(tool, args, ctx.facts);
    st.pending = { tool: tool.name, title: tool.title, args, reason: why, effect: tool.effect === "external" ? "external" : "write" };
    push({ kind: "approval_request", text: `${tool.title}: ${why}`, tool: tool.name, args, status: "needs_approval" });
    st.draft = `I need your OK first. ${why} You decide: Approve to go ahead, or Not now and nothing changes.`;
  };

  const escalate = () => {
    st.escalated = true;
    push({ kind: "guardrail", text: `${st.errors} tool calls failed, so I stopped instead of guessing. A person can help with this.`, status: "blocked" });
    const help = byName.get("ask_for_help");
    const args = help ? fitArgs(help, { message: `I asked the Keystone Coach "${clip(message, 300)}" and it couldn't finish. Could someone help me with this?`, kind: "question" }, userId) : null;
    if (help && args) {
      askApproval(help, args, "Two things went wrong on my side. This posts your question in the Community help feed (inside Keystone only) so a student mentor can help.");
      st.draft = "Sorry, two things went wrong on my side, so I stopped rather than guess. Would you like a person to help instead? I can post your question in the Community help feed. You decide.";
    } else {
      st.draft = "Sorry, two things went wrong on my side, so I stopped rather than guess. You can ask a student mentor in the Community help feed, or try me again in a moment.";
    }
  };

  // ---------- resume after a human decision ----------
  let approvedKey: string | null = null;
  let finished = false;
  if (approval) {
    const tool = byName.get(approval.tool);
    if (!tool) {
      push({ kind: "guardrail", text: `There's no tool called "${clip(approval.tool, 40)}", so nothing ran.`, status: "blocked" });
      st.draft = "That action isn't available any more, so nothing changed. What would you like to do next?";
      finished = true;
    } else if (approval.decision === "deny") {
      push({ kind: "approval_request", text: `You chose Not now, so "${tool.title}" did not run. Nothing changed.`, tool: tool.name, args: approval.args, status: "denied" });
      st.draft = `No problem, I won't do that. ${denyAlternative(tool.name)}`;
      finished = true;
    } else {
      const parsed = tool.input.safeParse(approval.args ?? {});
      if (!parsed.success) {
        push({ kind: "guardrail", text: `The approved request for "${tool.title}" had invalid details, so nothing ran.`, status: "blocked" });
        st.draft = "Something didn't match the request you approved, so I didn't run it. Ask me again and I'll prepare a fresh one.";
        finished = true;
      } else {
        const args = (parsed.data ?? {}) as Record<string, unknown>;
        push({ kind: "approval_request", text: `You approved "${tool.title}". Running exactly what you approved.`, tool: tool.name, args, status: "ok" });
        push({
          kind: "plan",
          text: `Resume: run "${tool.title}" with the details you approved, then check every number and answer.`,
          args: { planner: mode === "rules" ? "rules" : "llm", reason: demo ? "demo" : "resume" },
        });
        approvedKey = stableKey(tool.name, args);
        await act(tool, args, true);
      }
    }
  }

  // ---------- plan → act → observe ----------
  const runRules = async () => {
    const plan: RulesPlan = rulesPlan(message, { tools, facts: ctx.facts });
    let calls = plan.calls;
    if (approval) {
      const i = calls.findIndex((c) => c.tool === approval.tool);
      calls = i >= 0 ? calls.slice(i + 1) : [];
    }
    const reason = demo ? "demo" : input.planner === "rules" ? "rules" : "fallback";
    if (!approval) push({ kind: "plan", text: plan.text, args: { planner: "rules", reason, intent: plan.intent } });
    else if (calls.length) push({ kind: "plan", text: `Next: ${calls.map((c) => c.why).join(" · ")}`, args: { planner: "rules", reason, intent: plan.intent } });
    for (const c of calls) {
      const tool = byName.get(c.tool);
      if (!tool) continue;
      const args = fitArgs(tool, c.args, userId);
      if (!args) {
        st.errors++;
        const obs = `${tool.title} needs details I don't have yet.`;
        push({ kind: "observation", text: obs, tool: tool.name, status: "error" });
        observed.push({ tool: tool.name, text: obs, ok: false });
      } else if (doneKeys.has(stableKey(tool.name, args))) {
        continue;
      } else if (tool.requiresApproval) {
        askApproval(tool, args);
        return;
      } else {
        await act(tool, args, false);
      }
      if (st.errors >= MAX_TOOL_ERRORS) { escalate(); return; }
    }
    st.draft = composeRulesAnswer({ plan, observed, facts: ctx.facts, history });
  };

  const runLlm = async (): Promise<"done" | "fallback"> => {
    const system = buildSystemPrompt(tools, ctx.text);
    const scratch: string[] = [];
    if (approval && approvedKey) {
      scratch.push(`Action (approved by the student): ${approval.tool}(${JSON.stringify(approval.args ?? {})})`, observationLine(doneKeys.get(approvedKey) ?? ""));
    }
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      let d: Decision;
      try {
        d = await llmDecide({ system, user: buildUserPrompt(message, history, scratch), runId });
      } catch {
        if (i === 0) return "fallback";
        push({ kind: "plan", text: "The AI model stopped responding, so Keystone's rules wrote the answer from what the tools returned.", args: { planner: "rules", reason: "fallback" } });
        break;
      }
      st.plannerUsed = "llm";
      push({ kind: "plan", text: clip(d.thought || (d.action ? `Use ${d.action.tool}` : "Answer"), 300), args: { planner: "llm", iteration: i + 1 } });
      if (!d.action) { st.draft = d.answer ?? null; break; }
      scratch.push(`Thought: ${clip(d.thought, 300)}`);
      const tool = byName.get(d.action.tool);
      if (!tool) {
        st.errors++;
        const obs = `There is no tool called "${clip(d.action.tool, 40)}". Use one from the TOOLS list.`;
        push({ kind: "observation", text: obs, status: "error" });
        observed.push({ tool: d.action.tool, text: obs, ok: false });
        scratch.push(`Action: ${d.action.tool}`, observationLine(obs));
        if (st.errors >= MAX_TOOL_ERRORS) { escalate(); return "done"; }
        continue;
      }
      const parsed = tool.input.safeParse(d.action.args ?? {});
      if (!parsed.success) {
        st.errors++;
        const obs = `Invalid input for ${tool.name}: ${clip(parsed.error.issues.map((x) => `${x.path.join(".") || "input"} ${x.message}`).join("; "), 200)}`;
        push({ kind: "observation", text: obs, tool: tool.name, status: "error" });
        observed.push({ tool: tool.name, text: obs, ok: false });
        scratch.push(`Action: ${tool.name}(${JSON.stringify(d.action.args)})`, observationLine(obs));
        if (st.errors >= MAX_TOOL_ERRORS) { escalate(); return "done"; }
        continue;
      }
      const args = (parsed.data ?? {}) as Record<string, unknown>;
      const key = stableKey(tool.name, args);
      scratch.push(`Action: ${tool.name}(${JSON.stringify(args)})`);
      if (doneKeys.has(key)) { scratch.push(observationLine(`Already done this turn: ${doneKeys.get(key)}`)); continue; }
      if (tool.requiresApproval) { askApproval(tool, args); return "done"; }
      scratch.push(observationLine(await act(tool, args, false)));
      if (st.errors >= MAX_TOOL_ERRORS) { escalate(); return "done"; }
    }
    if (!st.draft) st.draft = composeRulesAnswer({ plan: rulesPlan(message, { tools, facts: ctx.facts }), observed, facts: ctx.facts, history });
    return "done";
  };

  if (!finished && !(st.errors >= MAX_TOOL_ERRORS)) {
    if (mode === "auto") {
      const r = await runLlm();
      if (r === "fallback") mode = "rules";
    }
    if (mode === "rules") await runRules();
  }

  // ---------- reflect: grounding check ----------
  const raw = st.draft ?? "I'm not sure how to help with that yet. Try asking what to do this week.";
  const g = groundAnswer(raw, { facts: ctx.facts, sources: [ctx.text, message, ...observed.map((o) => o.text), st.pending?.reason ?? ""] });
  if (g.removed.length) {
    push({
      kind: "guardrail",
      text: `Grounding check: I couldn't trace ${g.removed.join(", ")} to your data or a tool result, so I rewrote that sentence without ${g.removed.length === 1 ? "it" : "them"}.`,
      status: "modified",
    });
  } else {
    push({
      kind: "reflection",
      text: g.checked.length
        ? `Grounding check: every number (${g.checked.slice(0, 5).join(", ")}) comes from your data or a tool result.`
        : "Grounding check: no numbers to verify; the answer only uses your data and tool results.",
      status: "ok",
    });
  }
  const answer = limitWords(g.answer);
  push({ kind: "answer", text: answer });

  // ---------- remember ----------
  if (!approval) {
    for (const m of extractMemory(message)) {
      try {
        const note = await addMemory({ userId, kind: m.kind, text: m.text, source: "coach chat" });
        push({ kind: "memory", text: `Noted: ${note.text}. You can delete this anytime.`, args: { id: note.id, kind: note.kind }, status: "ok" });
      } catch {
        /* memory is best-effort */
      }
    }
  }

  const suggestions = st.pending ? [] : st.escalated ? ["What should I do this week?"] : suggestionsFor(intent, ctx.facts);
  emit({
    runId, agent: "orchestrator", status: "done",
    message: `Coach answered in ${steps.length} steps (${st.plannerUsed === "llm" ? "AI model" : "Keystone rules"} planner)${st.pending ? " · waiting for your approval" : ""}`,
    data: { steps: steps.length, planner: st.plannerUsed, toolCalls: observed.length, errors: st.errors, pendingApproval: st.pending?.tool ?? null },
  });

  return CoachResZ.parse({
    runId, steps, answer, planner: st.plannerUsed,
    ...(st.pending ? { pendingApproval: st.pending } : {}),
    ...(suggestions.length ? { suggestions } : {}),
  });
}
