"use client";
// P5 · Keystone Coach chat panel. Every assistant turn shows the agent loop as a step timeline:
// perceive → plan → act → observe → (ask you) → reflect → answer → remember. Side-effecting tools wait for
// the student's decision on an approval card ("You decide").
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  BookOpen, BookmarkPlus, Brain, CheckCircle2, CircleAlert, Eye, Globe, Hand, ListChecks, LoaderCircle, PencilLine, ReceiptText,
  SendHorizontal, ShieldAlert, ShieldCheck, Sparkles, Wrench, XCircle,
} from "lucide-react";
import { AgentAvatar, ErrorState } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActivity } from "@/components/shell/ActivityPanel";
import { useViewerId } from "@/components/community/useViewerId";
import { apiPost } from "@/lib/fetcher";
import { EFFECT_LABEL, toolMeta } from "@/lib/agents/coach/toolMeta";
import type { ToolEffect } from "@/lib/agents/tools/types";
import type { CoachRes, CoachStep } from "@/lib/schemas/coach";
import { cn } from "@/lib/utils";

export const STARTER_PROMPTS = ["What should I do this week?", "Why Docker?", "Find me a pod", "Who's been where I want to go?"] as const;

type Decision = "approve" | "deny";
type Approval = { tool: string; args: unknown; decision: Decision };
type Turn =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; res: CoachRes; message: string; decided?: Decision };

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomId(n = 8): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (b, i) => ALPHABET[(b || (Date.now() + i * 7)) % 36]).join("");
}

/** "Planned by the AI model" or "Planned by Keystone rules (…)": shown honestly on every turn. */
export function plannerLabel(res: Pick<CoachRes, "planner" | "steps">): string {
  if (res.planner === "llm") return "Planned by the AI model";
  const reasons = res.steps.map((s) => (s.kind === "plan" ? (s.args as { reason?: string } | undefined)?.reason : undefined));
  if (reasons.includes("demo")) return "Planned by Keystone rules (demo mode)";
  if (reasons.includes("rules")) return "Planned by Keystone rules";
  return "Planned by Keystone rules (AI model unavailable)";
}

// One tag recipe for every small label on this screen: 24px, the tag radius, the label in ink.
const TAG = "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap text-foreground";

// The effect's colour sits on the icon, tint and edge; the label stays ink (DESIGN.md "Status").
const EFFECT_STYLE: Record<ToolEffect, { icon: typeof BookOpen; cls: string; iconCls: string }> = {
  read: { icon: BookOpen, cls: "border-border bg-muted", iconCls: "text-muted-foreground" },
  write: { icon: PencilLine, cls: "border-status-degree/35 bg-status-degree/10", iconCls: "text-status-degree" },
  external: { icon: Globe, cls: "border-status-rising/45 bg-status-rising/12", iconCls: "text-status-rising" },
};

function EffectPill({ effect }: { effect: ToolEffect }) {
  const e = EFFECT_LABEL[effect];
  const style = EFFECT_STYLE[effect];
  const Icon = style.icon;
  return (
    <span title={e.explain} className={cn(TAG, style.cls)}>
      <Icon className={cn("size-3.5", style.iconCls)} aria-hidden />
      {e.label}
      <span className="sr-only">: {e.explain}</span>
    </span>
  );
}

function StepIcon({ step }: { step: CoachStep }) {
  const cls = "size-5";
  switch (step.kind) {
    case "context": return <Brain className={cls} aria-hidden />;
    case "plan": return <ListChecks className={cls} aria-hidden />;
    case "observation": return step.status === "error" ? <CircleAlert className={cn(cls, "text-status-gap")} aria-hidden /> : <Eye className={cls} aria-hidden />;
    case "tool_call": return <Wrench className={cls} aria-hidden />;
    case "approval_request":
      if (step.status === "denied") return <XCircle className={cls} aria-hidden />;
      if (step.status === "needs_approval") return <Hand className={cn(cls, "text-status-rising")} aria-hidden />;
      return <CheckCircle2 className={cn(cls, "text-status-proven")} aria-hidden />;
    case "reflection": return <ShieldCheck className={cn(cls, "text-status-proven")} aria-hidden />;
    case "guardrail": return <ShieldAlert className={cn(cls, step.status === "blocked" ? "text-status-gap" : "text-status-rising")} aria-hidden />;
    case "memory": return <BookmarkPlus className={cls} aria-hidden />;
    default: return <Sparkles className={cls} aria-hidden />;
  }
}

const KIND_LABEL: Record<CoachStep["kind"], string> = {
  context: "Perceive", plan: "Plan", tool_call: "Act", observation: "Observe", approval_request: "Your decision",
  reflection: "Reflect", guardrail: "Guardrail", memory: "Remember", answer: "Answer",
};

/**
 * Display-only copy pass on the loop's server text (DESIGN.md Voice): no middle-dot meta strings, no repeated
 * "Plan:" under the Plan label, no raw tool ids shown to the student. Every fact stays; only joins and wording change.
 */
export function tidyStepText(text: string, kind?: CoachStep["kind"]): string {
  let t = text;
  if (kind === "plan") t = t.replace(/^Plan:\s*/, "");
  t = t
    .replace(/(Year \d+) · (Semester \d+)/g, "$1, $2")
    .replace(/ · /g, "; ")
    .replace(/(\d+%) → (\d+%)/g, "$1 to $2")
    .replace(/Next: start_pod_project sets up the GitHub repo and issues\./g, "Next, I can set up your pod's GitHub repo and issues.")
    .replace(/start_pod_project sets one up\./g, "I can set one up.")
    .replace(/\s*\(ask_for_help, kind chat-15\)/g, "");
  if (kind === "context") t = t.replace(/(^|; )pod (?!yet)/, "$1your pod, ");
  return t;
}

function ApprovalCard({
  pending, actionable, decided, busy, onDecide,
}: {
  pending: NonNullable<CoachRes["pendingApproval"]>;
  actionable: boolean;
  decided?: Decision;
  busy: boolean;
  onDecide: (d: Decision) => void;
}) {
  const titleId = React.useId();
  // The human-in-the-loop moment: a calm well inside the answer, the title large, the effect named, one ink action.
  return (
    <div role="group" aria-labelledby={titleId} className="rounded-xl bg-muted p-4 md:p-5">
      <p id={titleId} className="text-lg font-semibold text-balance text-foreground">{pending.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <EffectPill effect={pending.effect} />
        <span className="text-sm text-muted-foreground">{EFFECT_LABEL[pending.effect].explain}</span>
      </div>
      <p className="mt-3 max-w-[65ch] text-base text-pretty text-foreground">{pending.reason}</p>
      {actionable ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">You decide</span>: nothing happens unless you approve.
          </p>
          <div className="flex gap-2 sm:ml-auto">
            <Button onClick={() => onDecide("approve")} disabled={busy}>
              <CheckCircle2 aria-hidden /> Approve
            </Button>
            <Button variant="outline" onClick={() => onDecide("deny")} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      ) : decided ? (
        <p className="mt-4 flex items-center gap-2 border-t pt-4 text-sm font-medium text-foreground">
          {decided === "approve"
            ? <CheckCircle2 className="size-4 text-status-proven" aria-hidden />
            : <XCircle className="size-4 text-muted-foreground" aria-hidden />}
          {decided === "approve" ? "You approved this." : "You chose not now. Nothing changed."}
        </p>
      ) : null}
    </div>
  );
}

function StepRow({
  step, index, reduce, children, forgotten, onForget,
}: {
  step: CoachStep;
  index: number;
  reduce: boolean;
  children?: React.ReactNode;
  forgotten: Set<string>;
  onForget: (id: string) => void;
}) {
  const meta = toolMeta(step.tool);
  const memoryId = step.kind === "memory" ? (step.args as { id?: string } | undefined)?.id : undefined;
  const brief = step.kind === "context" ? (step.args as { brief?: string } | undefined)?.brief : undefined;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { delay: index * 0.06, duration: 0.2 }}
      className="group relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
      data-step={step.kind}
    >
      {/* One hairline joins the marks, the same line the "How the Coach works" rail draws. */}
      <span aria-hidden className="absolute top-7 bottom-1 left-2.5 w-px bg-border group-last:hidden" />
      <span className="mt-0.5 flex h-5 items-center justify-center text-muted-foreground">
        <StepIcon step={step} />
      </span>
      <div className="min-w-0">
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-base font-semibold text-foreground">{KIND_LABEL[step.kind]}</span>
          {step.kind === "tool_call" && (
            <>
              <AgentAvatar agent={meta.agent} size={24} />
              <span className="text-base font-medium text-foreground">{tidyStepText(step.text, step.kind)}</span>
              <EffectPill effect={meta.effect} />
              {step.status === "error" && (
                <span className={cn(TAG, "border-status-gap/35 bg-status-gap/10")}>
                  <CircleAlert className="size-3.5 text-status-gap" aria-hidden />Failed
                </span>
              )}
              {step.durationMs !== undefined && <span className="text-sm text-muted-foreground"><span className="font-mono tabular-nums">{step.durationMs}</span>&nbsp;ms</span>}
            </>
          )}
          {step.kind === "guardrail" && step.status === "modified" && (
            <span className={cn(TAG, "border-status-rising/45 bg-status-rising/12")}>
              <ShieldAlert className="size-3.5 text-status-rising" aria-hidden />Answer modified
            </span>
          )}
        </div>
        {children ? <div className="mt-2">{children}</div> : step.kind !== "tool_call" && (
          <p className="mt-0.5 max-w-[70ch] text-base text-pretty text-foreground">
            {tidyStepText(step.text, step.kind)}
            {memoryId && (
              forgotten.has(memoryId)
                ? <span className="ml-2 text-muted-foreground">Forgotten.</span>
                : (
                  <button
                    type="button"
                    onClick={() => onForget(memoryId)}
                    className="ml-2 rounded-sm font-medium text-primary underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Forget
                  </button>
                )
            )}
          </p>
        )}
        {brief && (
          <details className="mt-1.5 text-sm">
            <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground underline decoration-1 underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">What I read</summary>
            <pre className="mt-2 rounded-xl bg-muted p-3 font-sans text-sm whitespace-pre-wrap text-foreground">{brief.replace(/<\/?untrusted>/g, "")}</pre>
          </details>
        )}
      </div>
    </motion.li>
  );
}

function Answer({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="mt-5 space-y-3 border-t pt-5">
      {lines.map((line, i) =>
        line.startsWith("Receipt · ") ? (
          <p key={i} className="flex items-start gap-2.5 rounded-xl bg-muted px-4 py-3 text-sm text-foreground">
            <ReceiptText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span><span className="font-semibold">Receipt:</span> {tidyStepText(line.slice("Receipt · ".length))}</span>
          </p>
        ) : (
          <p key={i} className="max-w-[65ch] text-lg text-pretty text-foreground">{tidyStepText(line)}</p>
        ),
      )}
    </div>
  );
}

function AssistantTurn({
  turn, latest, actionable, busy, reduce, forgotten, onDecide, onSuggest, onForget, articleRef,
}: {
  articleRef?: React.Ref<HTMLElement>;
  turn: Extract<Turn, { role: "assistant" }>;
  latest: boolean;
  actionable: boolean;
  busy: boolean;
  reduce: boolean;
  forgotten: Set<string>;
  onDecide: (d: Decision) => void;
  onSuggest: (s: string) => void;
  onForget: (id: string) => void;
}) {
  const { res } = turn;
  const steps = res.steps.filter((s) => s.kind !== "answer");
  const timeline = (
    <ol aria-label="What the Coach did">
      {steps.map((s, i) => (
        <StepRow key={i} step={s} index={i} reduce={reduce} forgotten={forgotten} onForget={onForget}>
          {s.kind === "approval_request" && s.status === "needs_approval" && res.pendingApproval ? (
            <ApprovalCard pending={res.pendingApproval} actionable={actionable} decided={turn.decided} busy={busy} onDecide={onDecide} />
          ) : undefined}
        </StepRow>
      ))}
    </ol>
  );
  return (
    <article ref={articleRef} className="rounded-2xl border bg-card p-5 shadow-sm md:p-6" aria-label="Coach answer">
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          Keystone Coach
        </span>
        <span className={cn(TAG, "h-auto min-h-6 border-border bg-muted py-0.5 whitespace-normal text-muted-foreground")}>{plannerLabel(res)}</span>
      </div>
      {latest ? timeline : (
        <details>
          <summary className="w-fit cursor-pointer rounded-sm text-sm text-muted-foreground underline decoration-1 underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Show the {steps.length} steps
          </summary>
          <div className="mt-4">{timeline}</div>
        </details>
      )}
      <Answer text={res.answer} />
      {latest && !!res.suggestions?.length && (
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Suggested next steps">
          {res.suggestions.map((s) => (
            <Button key={s} variant="outline" disabled={busy} onClick={() => onSuggest(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

export interface CoachPanelProps {
  /** Defaults to the viewer from the ks_uid cookie. */
  userId?: string;
  className?: string;
  /** Also stream the run into the Activity panel (full-page coach). */
  streamToActivity?: boolean;
}

export function CoachPanel({ userId: userIdProp, className, streamToActivity = false }: CoachPanelProps) {
  const viewer = useViewerId();
  const userId = userIdProp ?? viewer;
  const activity = useActivity();
  const reduce = !!useReducedMotion();
  const inputId = React.useId();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<null | { message: string; approval?: Approval }>(null);
  const [forgotten, setForgotten] = React.useState<Set<string>>(() => new Set());
  const [live, setLive] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const logRef = React.useRef<HTMLDivElement>(null);
  const latestRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!turns.length) return;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const article = latestRef.current;
    if (!busy && turns[turns.length - 1]?.role === "assistant" && article) {
      // A new answer lands at its top, so the loop reads Perceive first, top-down.
      const log = logRef.current;
      if (log && log.scrollHeight > log.clientHeight + 1) {
        log.scrollTo?.({ top: log.scrollTop + article.getBoundingClientRect().top - log.getBoundingClientRect().top - 4, behavior });
      } else {
        article.scrollIntoView?.({ block: "start", behavior });
      }
      return;
    }
    endRef.current?.scrollIntoView?.({ block: "end", behavior });
  }, [turns, busy, reduce]);

  const send = async (raw: string, opts: { approval?: Approval; display?: string; asUser?: string; retry?: boolean } = {}) => {
    const message = raw.trim();
    if (!message || busy) return;
    const prior = turns;
    if (!opts.retry) setTurns((ts) => [...ts, { id: randomId(), role: "user", content: opts.display ?? message }]);
    if (!opts.approval) setInput("");
    setBusy(true);
    setFailed(null);
    const runId = `run_${randomId()}`;
    if (streamToActivity) {
      // Stream into the Agents panel without opening it over the answer: the Agents button shows the run is live.
      const wasOpen = activity.open;
      activity.start(runId);
      if (!wasOpen) activity.setOpen(false);
    }
    try {
      const history = prior.slice(-10).map((t) =>
        t.role === "user" ? { role: "user" as const, content: t.content.slice(0, 4000) } : { role: "assistant" as const, content: t.res.answer.slice(0, 4000) },
      );
      const res = await apiPost<CoachRes>("/api/coach", { userId: opts.asUser ?? userId, message, history, approval: opts.approval, runId });
      setTurns((ts) => [...ts, { id: randomId(), role: "assistant", res, message }]);
      setLive(`Coach: ${res.answer}`);
      if (opts.approval?.decision === "approve") {
        const failedTool = res.steps.some((s) => s.kind === "tool_call" && s.status === "error");
        if (failedTool) toast.error("That didn't work", { description: "Nothing was changed. The Coach explains what happened." });
        else toast.success("Done", { description: res.steps.find((s) => s.kind === "tool_call")?.text });
      }
    } catch (e) {
      setFailed({ message, approval: opts.approval });
      toast.error("The Coach couldn't answer just now", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const decide = (turnId: string, d: Decision) => {
    const turn = turns.find((t): t is Extract<Turn, { role: "assistant" }> => t.id === turnId && t.role === "assistant");
    const pending = turn?.res.pendingApproval;
    if (!turn || !pending) return;
    setTurns((ts) => ts.map((t) => (t.id === turnId && t.role === "assistant" ? { ...t, decided: d } : t)));
    void send(turn.message, {
      approval: { tool: pending.tool, args: pending.args, decision: d },
      display: d === "approve" ? `Approve: ${pending.title}` : `Not now: ${pending.title}`,
    });
  };

  const forget = async (id: string) => {
    try {
      const res = await fetch(`/api/coach/memory?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message ?? "Couldn't delete that note");
      setForgotten((s) => new Set(s).add(id));
      toast.success("Forgotten", { description: "The Coach won't use that note any more." });
    } catch (e) {
      toast.error("Couldn't forget that note", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const lastAssistant = turns.reduce((idx, t, i) => (t.role === "assistant" ? i : idx), -1);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col",
        // Full page: bounded to the screen only once there is a conversation to scroll; in the sheet it fills the sheet.
        streamToActivity ? turns.length > 0 && "lg:h-[calc(100dvh-15rem)] lg:min-h-[560px]" : "h-full",
        className,
      )}
      aria-label="Keystone Coach"
    >
      <div ref={logRef} role="log" aria-label="Conversation with the Coach" className="-mx-1 -mt-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pt-1 pb-2">
        {turns.length === 0 && (
          <div className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
            <h2 className="text-xl font-semibold text-balance text-foreground">Ask me what to do next</h2>
            <p className="mt-2 max-w-[60ch] text-pretty text-muted-foreground">
              I read your Bridge Map, roadmap and pod, ask Keystone&apos;s specialist agents, and show you every step. I ask you first before anything touches GitHub or acts outside Keystone.
            </p>
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))] gap-2" aria-label="Starter questions">
              {STARTER_PROMPTS.map((p, i) => (
                // The first starter is the page's one ink action: the question the subtitle promises.
                <Button key={p} variant={i === 0 ? "default" : "outline"} size="lg" className="justify-start" onClick={() => void send(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={t.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-xl bg-paper-3 px-4 py-2.5 text-base text-pretty text-foreground">{t.content}</p>
            </div>
          ) : (
            <AssistantTurn
              key={t.id}
              turn={t}
              latest={i === lastAssistant}
              articleRef={i === lastAssistant ? latestRef : undefined}
              actionable={i === lastAssistant && !t.decided && !busy}
              busy={busy}
              reduce={reduce}
              forgotten={forgotten}
              onDecide={(d) => decide(t.id, d)}
              onSuggest={(s) => void send(s)}
              onForget={(id) => void forget(id)}
            />
          ),
        )}
        {busy && (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-5 text-base text-muted-foreground shadow-sm md:px-6" aria-busy="true">
            <LoaderCircle className="size-5 shrink-0 motion-safe:animate-spin" aria-hidden />
            The Coach is reading your context and planning…
          </div>
        )}
        {failed && !busy && (
          <ErrorState
            title="The Coach couldn't answer"
            body="Something went wrong on our side. Your message is safe; try again."
            onRetry={() => void send(failed.message, { approval: failed.approval, retry: true })}
            onUseDemo={() => void send(failed.message, { asUser: "aisha", retry: true })}
          />
        )}
        <div ref={endRef} />
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{live}</p>
      <form
        className="mt-4 rounded-2xl border bg-card p-4 shadow-sm md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Label htmlFor={inputId} className="text-sm font-medium text-foreground">Ask the Coach</Label>
        <div className="mt-2 flex gap-2">
          <Input
            id={inputId}
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What should I do this week?"
            autoComplete="off"
            maxLength={2000}
            className="h-11 md:text-base"
          />
          <Button type="submit" variant="outline" size="icon-lg" aria-label="Send" disabled={busy || !input.trim()}>
            <SendHorizontal aria-hidden />
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Every step is shown. Anything that touches GitHub or acts outside Keystone waits for your Approve.</p>
      </form>
    </section>
  );
}
