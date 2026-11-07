"use client";
// P5 · Keystone Coach chat panel. Every assistant turn shows the agent loop as a step timeline:
// perceive → plan → act → observe → (ask you) → reflect → answer → remember. Side-effecting tools wait for
// the student's decision on an approval card ("You decide").
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  BookmarkPlus, Brain, CheckCircle2, CircleAlert, Eye, Hand, ListChecks, LoaderCircle, ReceiptText, SendHorizontal,
  ShieldAlert, ShieldCheck, Sparkles, XCircle,
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

function EffectPill({ effect }: { effect: ToolEffect }) {
  const e = EFFECT_LABEL[effect];
  return (
    <span
      title={e.explain}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        effect === "read" && "border-border bg-muted text-muted-foreground",
        effect === "write" && "border-status-degree/30 bg-status-degree/10 text-status-degree",
        effect === "external" && "border-status-rising/30 bg-status-rising/10 text-status-rising",
      )}
    >
      {e.label}
      <span className="sr-only">: {e.explain}</span>
    </span>
  );
}

function StepIcon({ step }: { step: CoachStep }) {
  const cls = "size-4";
  switch (step.kind) {
    case "context": return <Brain className={cls} aria-hidden />;
    case "plan": return <ListChecks className={cls} aria-hidden />;
    case "observation": return step.status === "error" ? <CircleAlert className={cn(cls, "text-status-gap")} aria-hidden /> : <Eye className={cls} aria-hidden />;
    case "approval_request": return step.status === "denied" ? <XCircle className={cls} aria-hidden /> : <CheckCircle2 className={cn(cls, "text-status-proven")} aria-hidden />;
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
  return (
    <div role="group" aria-labelledby={titleId} className="rounded-2xl border-2 border-status-rising/40 bg-status-rising/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Hand className="size-4 text-status-rising" aria-hidden />
        <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background">You decide</span>
        <EffectPill effect={pending.effect} />
      </div>
      <p id={titleId} className="mt-2 text-base font-semibold">{pending.title}</p>
      <p className="mt-1 text-sm leading-relaxed">{pending.reason}</p>
      <p className="mt-1 text-xs text-muted-foreground">{EFFECT_LABEL[pending.effect].explain}. Nothing happens unless you approve.</p>
      {actionable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => onDecide("approve")} disabled={busy} className="h-9 rounded-xl px-4">
            <CheckCircle2 aria-hidden /> Approve
          </Button>
          <Button variant="outline" onClick={() => onDecide("deny")} disabled={busy} className="h-9 rounded-xl px-4">
            Not now
          </Button>
        </div>
      ) : decided ? (
        <p className="mt-3 text-sm font-medium">{decided === "approve" ? "You approved this." : "You chose not now. Nothing changed."}</p>
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
      className="relative"
      data-step={step.kind}
    >
      <span className="absolute -left-[25px] top-0.5 flex size-[18px] items-center justify-center rounded-full border bg-background text-muted-foreground">
        {step.kind === "tool_call" ? <span className="size-1.5 rounded-full bg-foreground" aria-hidden /> : <StepIcon step={step} />}
      </span>
      {children ?? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[step.kind]}</span>
            {step.kind === "tool_call" && (
              <>
                <AgentAvatar agent={meta.agent} size={22} />
                <span className="text-sm font-medium">{step.text}</span>
                <EffectPill effect={meta.effect} />
                {step.status === "error" && <span className="rounded-full bg-status-gap/10 px-2 py-0.5 text-[11px] font-medium text-status-gap">Failed</span>}
                {step.durationMs !== undefined && <span className="text-[11px] tabular-nums text-muted-foreground">{step.durationMs} ms</span>}
              </>
            )}
            {step.kind === "guardrail" && step.status === "modified" && (
              <span className="rounded-full bg-status-rising/10 px-2 py-0.5 text-[11px] font-medium text-status-rising">Answer modified</span>
            )}
          </div>
          {step.kind !== "tool_call" && (
            <p className={cn("mt-0.5 text-sm leading-relaxed", step.kind === "observation" && "text-muted-foreground")}>
              {step.text}
              {memoryId && (
                forgotten.has(memoryId)
                  ? <span className="ml-2 text-xs text-muted-foreground">Forgotten.</span>
                  : (
                    <button
                      type="button"
                      onClick={() => onForget(memoryId)}
                      className="ml-2 rounded text-xs font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Forget
                    </button>
                  )
              )}
            </p>
          )}
          {brief && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">What I read</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-muted p-2 font-sans text-xs leading-relaxed">{brief.replace(/<\/?untrusted>/g, "")}</pre>
            </details>
          )}
        </div>
      )}
    </motion.li>
  );
}

function Answer({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="mt-4 space-y-2">
      {lines.map((line, i) =>
        line.startsWith("Receipt · ") ? (
          <p key={i} className="flex items-start gap-2 rounded-xl border bg-muted/50 px-3 py-2 text-sm">
            <ReceiptText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span><span className="font-semibold">Receipt:</span> {line.slice("Receipt · ".length)}</span>
          </p>
        ) : (
          <p key={i} className="text-[15px] leading-relaxed">{line}</p>
        ),
      )}
    </div>
  );
}

function AssistantTurn({
  turn, latest, actionable, busy, reduce, forgotten, onDecide, onSuggest, onForget,
}: {
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
    <ol className="ml-[9px] space-y-3 border-l pl-4" aria-label="What the Coach did">
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
    <article className="rounded-2xl border bg-card p-4 shadow-sm md:p-5" aria-label="Coach answer">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <span className="inline-flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-3.5" aria-hidden /></span>
          Keystone Coach
        </span>
        <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{plannerLabel(res)}</span>
      </div>
      {latest ? timeline : (
        <details>
          <summary className="cursor-pointer rounded text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Show the {steps.length} steps
          </summary>
          <div className="mt-3">{timeline}</div>
        </details>
      )}
      <Answer text={res.answer} />
      {latest && !!res.suggestions?.length && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggested next steps">
          {res.suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" className="h-auto min-h-8 rounded-full px-3 py-1 whitespace-normal" disabled={busy} onClick={() => onSuggest(s)}>
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

  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [turns.length, busy, reduce]);

  const send = async (raw: string, opts: { approval?: Approval; display?: string; asUser?: string; retry?: boolean } = {}) => {
    const message = raw.trim();
    if (!message || busy) return;
    const prior = turns;
    if (!opts.retry) setTurns((ts) => [...ts, { id: randomId(), role: "user", content: opts.display ?? message }]);
    if (!opts.approval) setInput("");
    setBusy(true);
    setFailed(null);
    const runId = `run_${randomId()}`;
    if (streamToActivity) activity.start(runId);
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
    <section className={cn("flex h-full min-h-0 flex-col", className)} aria-label="Keystone Coach">
      <div role="log" aria-label="Conversation with the Coach" className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        {turns.length === 0 && (
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" aria-hidden /></span>
            <h2 className="mt-3 text-xl font-semibold">Ask me what to do next</h2>
            <p className="mt-1 text-muted-foreground">
              I read your Bridge Map, roadmap and pod, ask Keystone&apos;s specialist agents, and show you every step. I always check with you before changing anything.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Starter questions">
              {STARTER_PROMPTS.map((p) => (
                <Button key={p} variant="outline" className="h-auto min-h-9 rounded-full px-4 py-1.5 whitespace-normal" onClick={() => void send(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={t.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2 text-[15px] text-primary-foreground">{t.content}</p>
            </div>
          ) : (
            <AssistantTurn
              key={t.id}
              turn={t}
              latest={i === lastAssistant}
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
          <div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground" aria-busy="true">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
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
        className="mt-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Label htmlFor={inputId} className="text-sm font-medium">Ask the Coach</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id={inputId}
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What should I do this week?"
            autoComplete="off"
            maxLength={2000}
            className="h-10 rounded-xl text-[15px]"
          />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={busy || !input.trim()} className="size-10 rounded-xl">
            <SendHorizontal aria-hidden />
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Every step is shown. Anything that changes data or GitHub waits for your OK.</p>
      </form>
    </section>
  );
}
