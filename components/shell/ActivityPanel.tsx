"use client";
// The Agent Activity panel (P3 PR2): a right-hand sheet that streams every agent's work for a run.
// `useActivity()` → { runId, events, open, setOpen, start(runId), live, status }. `start` opens an
// EventSource on /api/agents/stream and falls back to polling `?poll=1` after 2 errors.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentAvatar, DemoDataNote, EmptyState } from "@/components/keystone";
import { apiPost } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { AgentEvent, AgentName } from "@/lib/types";

export type RunStatus = "idle" | "connecting" | "live" | "done" | "error";
type Ctx = {
  runId: string | null;
  events: AgentEvent[];
  open: boolean;
  setOpen: (o: boolean) => void;
  start: (runId: string) => void;
  /** True while a run is streaming (the TopBar "Agents" button pulses). */
  live: boolean;
  status: RunStatus;
};

const ActivityContext = React.createContext<Ctx | null>(null);
const noop: Ctx = { runId: null, events: [], open: false, setOpen: () => {}, start: () => {}, live: false, status: "idle" };
export function useActivity(): Ctx {
  return React.useContext(ActivityContext) ?? noop;
}

export const AGENT_LABEL: Record<AgentName, string> = {
  orchestrator: "Orchestrator", syllabus: "Syllabus Agent", skillmap: "Skill Mapper", market: "Market Agent",
  trends: "Trends Agent", evidence: "Evidence Agent", roadmap: "Roadmap Agent", matchmaker: "Matchmaker",
  architect: "Project Architect", techlead: "Tech Lead", trajectories: "Trajectories Agent", guides: "Guides Agent",
  voice: "Voice Coach", n8n: "n8n Automations",
};

const POLL_MS = 1000;
const MAX_POLL_MS = 3 * 60_000;
const ERRORS_BEFORE_POLLING = 2;
const ERROR_SETTLE_MS = 3000;

const keyOf = (e: AgentEvent) => `${e.ts}|${e.agent}|${e.status}|${e.message}`;

/**
 * A run ends with the orchestrator's done/error. Runs without an orchestrator (a pod match, a PR review)
 * end when the agent that started them reports done.
 */
export function isRunEnd(e: AgentEvent, lead: AgentEvent | undefined): boolean {
  if (e.agent === "orchestrator") return e.status === "done" || e.status === "error";
  return !!lead && lead.agent !== "orchestrator" && e.agent === lead.agent && e.status === "done";
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [runId, setRunId] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<AgentEvent[]>([]);
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<RunStatus>("idle");
  const conn = React.useRef<{ id: string | null; es: EventSource | null; poll: ReturnType<typeof setInterval> | null; settle: ReturnType<typeof setTimeout> | null; log: AgentEvent[] }>({ id: null, es: null, poll: null, settle: null, log: [] });

  const stop = React.useCallback(() => {
    const c = conn.current;
    c.es?.close();
    c.es = null;
    if (c.poll) clearInterval(c.poll);
    c.poll = null;
    if (c.settle) clearTimeout(c.settle);
    c.settle = null;
  }, []);

  React.useEffect(() => stop, [stop]);

  const start = React.useCallback((id: string) => {
    stop();
    const c = conn.current;
    c.id = id;
    c.log = [];
    setRunId(id);
    setEvents([]);
    setOpen(true);
    setStatus("connecting");

    const finish = (s: "done" | "error") => {
      if (c.id !== id) return;
      stop();
      setStatus(s);
    };
    // Merge new events (EventSource reconnects and polling both resend history), then check for the end.
    const ingest = (incoming: AgentEvent[]) => {
      if (c.id !== id) return;
      const seen = new Set(c.log.map(keyOf));
      const fresh = incoming.filter((e) => e && e.runId === id && !seen.has(keyOf(e)));
      if (!fresh.length) return;
      c.log = [...c.log, ...fresh];
      setEvents(c.log);
      setStatus((s) => (s === "connecting" ? "live" : s));
      if (c.settle) { clearTimeout(c.settle); c.settle = null; }
      const lead = c.log[0];
      const end = fresh.find((e) => isRunEnd(e, lead));
      if (end) return finish(end.status === "error" ? "error" : "done");
      const last = fresh[fresh.length - 1];
      if (lead.agent !== "orchestrator" && last.agent === lead.agent && last.status === "error") {
        c.settle = setTimeout(() => finish("error"), ERROR_SETTLE_MS);
      }
    };

    const startPolling = () => {
      c.es?.close();
      c.es = null;
      const began = Date.now();
      const tick = async () => {
        if (c.id !== id) return;
        if (Date.now() - began > MAX_POLL_MS) return finish("error");
        try {
          const res = await fetch(`/api/agents/stream?runId=${encodeURIComponent(id)}&poll=1`);
          const json = (await res.json()) as { ok: boolean; data?: AgentEvent[] };
          if (json.ok && Array.isArray(json.data)) ingest(json.data);
        } catch { /* try again next tick */ }
      };
      void tick();
      c.poll = setInterval(() => void tick(), POLL_MS);
    };

    if (typeof EventSource === "undefined") return startPolling();
    let errors = 0;
    const es = new EventSource(`/api/agents/stream?runId=${encodeURIComponent(id)}`);
    c.es = es;
    es.addEventListener("agent", (m) => {
      try {
        ingest([JSON.parse((m as MessageEvent<string>).data) as AgentEvent]);
      } catch { /* ignore a malformed frame */ }
    });
    es.onerror = () => {
      if (c.es !== es) return;
      errors += 1;
      if (errors >= ERRORS_BEFORE_POLLING) startPolling();
    };
  }, [stop]);

  const live = status === "connecting" || status === "live";
  const value = React.useMemo<Ctx>(() => ({ runId, events, open, setOpen, start, live, status }), [runId, events, open, start, live, status]);
  return (
    <ActivityContext.Provider value={value}>
      {children}
      <ActivityPanel />
    </ActivityContext.Provider>
  );
}

/** The "Agents" button for the TopBar: opens the panel and pulses while a run is live. */
export function AgentsButton({ className }: { className?: string }) {
  const { setOpen, live } = useActivity();
  return (
    <Button variant="outline" className={cn("relative h-10 gap-2 rounded-xl px-3 text-sm", className)} onClick={() => setOpen(true)} aria-label={live ? "Agents, a run is live" : "Agents"}>
      <Sparkles className="size-4" aria-hidden />
      Agents
      {live && (
        <span className="absolute -top-1 -right-1 flex size-3" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-3 rounded-full bg-primary" />
        </span>
      )}
    </Button>
  );
}

// ---------------------------------------------------------------- relative time (no Date.now() during render)

let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockSubs = new Set<() => void>();
function subscribeClock(cb: () => void) {
  clockSubs.add(cb);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => { clockNow = Date.now(); clockSubs.forEach((f) => f()); }, 1000);
  }
  return () => {
    clockSubs.delete(cb);
    if (!clockSubs.size && clockTimer) { clearInterval(clockTimer); clockTimer = undefined; }
  };
}
function useNow() {
  return React.useSyncExternalStore(subscribeClock, () => clockNow, () => 0);
}
export function relativeTime(ts: string, now: number): string {
  const t = Date.parse(ts);
  if (!now || Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Wraps every number (and its % sign) so the agents' real numbers stand out. */
export function HighlightNumbers({ text }: { text: string }) {
  const parts = text.split(/(\d+%?)/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="font-mono font-semibold tabular-nums text-foreground">{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </>
  );
}

// ---------------------------------------------------------------- the panel

type Group = { agent: AgentName; events: AgentEvent[]; state: "working" | "done" | "error" };

function groupByAgent(events: AgentEvent[], finished: boolean): Group[] {
  const groups = new Map<AgentName, AgentEvent[]>();
  for (const e of events) groups.set(e.agent, [...(groups.get(e.agent) ?? []), e]);
  return [...groups].map(([agent, evs]) => {
    const last = evs[evs.length - 1];
    const state = last.status === "error" ? "error" : last.status === "done" || finished ? "done" : "working";
    return { agent, events: evs, state };
  });
}

const STATE_LABEL = { working: "Working", done: "Done", error: "Needs a fallback" } as const;

function StateBadge({ state }: { state: Group["state"] }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
      {state === "working" && <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />}
      {state === "done" && <CheckCircle2 className="size-3.5 text-status-proven" aria-hidden />}
      {state === "error" && <AlertTriangle className="size-3.5 text-status-rising" aria-hidden />}
      {STATE_LABEL[state]}
    </span>
  );
}

function RowIcon({ e, latest, working }: { e: AgentEvent; latest: boolean; working: boolean }) {
  const cls = "mt-1 size-4 shrink-0";
  if (e.status === "error") return <><AlertTriangle className={cn(cls, "text-status-rising")} aria-hidden /><span className="sr-only">Problem: </span></>;
  if (e.status === "done") return <><CheckCircle2 className={cn(cls, "text-status-proven")} aria-hidden /><span className="sr-only">Done: </span></>;
  if (latest && working) return <><Loader2 className={cn(cls, "animate-spin text-primary")} aria-hidden /><span className="sr-only">In progress: </span></>;
  return <Check className={cn(cls, "text-muted-foreground")} aria-hidden />;
}

function ActivityPanel() {
  const { open, setOpen, events, runId, status, start } = useActivity();
  const reduce = useReducedMotion();
  const now = useNow();
  const [replaying, setReplaying] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const finished = status === "done" || status === "error";
  const groups = React.useMemo(() => groupByAgent(events, finished), [events, finished]);
  const workers = groups.filter((g) => g.agent !== "orchestrator");
  const doneCount = workers.filter((g) => g.state !== "working").length;
  const lead = events[0];
  const end = finished ? [...events].reverse().find((e) => isRunEnd(e, lead) || (e.agent === lead?.agent && e.status === "error")) : undefined;
  const isDemo = events.some((e) => e.data?.demo === true);
  const latestKey = events.length ? keyOf(events[events.length - 1]) : "";

  // Keep the newest row in view while the run streams.
  React.useEffect(() => {
    if (!latestKey) return;
    listRef.current?.querySelector('[data-latest="true"]')?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [latestKey, reduce]);

  const replay = async () => {
    setReplaying(true);
    try {
      const { runId: id } = await apiPost<{ runId: string }>("/api/onboard/run", { userId: "aisha", demo: true });
      start(id);
    } catch {
      toast.error("Couldn't start the demo run", { description: "That's on us, not you. Try again in a moment." });
    } finally {
      setReplaying(false);
    }
  };

  const readiness = end?.status === "done" && typeof end.data?.readinessNow === "number" && typeof end.data?.readinessProjected === "number"
    ? { now: Math.round((end.data.readinessNow as number) * 100), projected: Math.round((end.data.readinessProjected as number) * 100) }
    : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" showCloseButton={false} className="w-full! gap-0 p-0 sm:max-w-[420px]!" data-testid="activity-panel">
        <div className="flex items-start justify-between gap-4 border-b px-6 pt-6 pb-4">
          <div className="min-w-0 space-y-1">
            <SheetTitle className="text-xl font-semibold">Agents at work</SheetTitle>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", status === "live" || status === "connecting" ? "animate-pulse bg-status-proven" : finished ? "bg-muted-foreground" : "bg-border")} aria-hidden />
                {status === "connecting" ? "Connecting" : status === "live" ? "Live" : finished ? "Finished" : "Idle"}
              </span>
              <span aria-hidden>·</span>
              <span><span className="font-mono font-semibold tabular-nums text-foreground">{workers.length}</span> {workers.length === 1 ? "agent" : "agents"}</span>
              {isDemo && <DemoDataNote />}
            </p>
            <SheetDescription className="text-sm text-muted-foreground">Each agent reports what it read and what it found, with real numbers.</SheetDescription>
          </div>
          <Button variant="ghost" className="size-10 shrink-0 rounded-xl" onClick={() => setOpen(false)} aria-label="Close the agent panel">
            <X className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Pinned above the timeline so the result and its next step are always in view. */}
        {(end || (!finished && workers.length > 0)) && (
          <div className="space-y-3 border-b px-6 py-4">
            {readiness && (
              <div className="rounded-xl border border-status-proven/25 bg-status-proven/10 p-4" data-testid="bridge-ready">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <CheckCircle2 className="size-5 text-status-proven" aria-hidden />
                  <span>Bridge ready · <span className="font-mono tabular-nums">{readiness.now}%</span> → <span className="font-mono tabular-nums">{readiness.projected}%</span></span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">You&apos;re {readiness.now}% of the way to your target role today, and {readiness.projected}% if you follow your plan.</p>
                <Link href="/map" onClick={() => setOpen(false)} className={cn(buttonVariants(), "mt-3 h-11 w-full rounded-xl px-5 text-base hover:bg-primary/90")}>See my Bridge Map</Link>
              </div>
            )}
            {end?.status === "done" && !readiness && (
              <div className="rounded-xl border border-status-proven/25 bg-status-proven/10 p-4 text-sm text-foreground" data-testid="run-done">
                <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-status-proven" aria-hidden /><HighlightNumbers text={end.message} /></p>
              </div>
            )}
            {end?.status === "error" && (
              <div className="rounded-xl border border-status-rising/30 bg-status-rising/10 p-4 text-sm text-foreground" role="alert">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-status-rising" aria-hidden />{end.message}</p>
                {end.agent === "orchestrator" && <Link href="/map" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "outline" }), "mt-3 h-10 w-full rounded-xl")}>See the demo Bridge Map</Link>}
              </div>
            )}
            {!finished && workers.length > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="run-progress"><span className="font-mono font-semibold tabular-nums text-foreground">{doneCount}</span> of <span className="font-mono font-semibold tabular-nums text-foreground">{workers.length}</span> agents finished</p>
            )}
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4" role="region" tabIndex={0} aria-label="Agent timeline">
          {!runId && (
            <EmptyState
              icon={Sparkles}
              title="No agents running"
              body="Start onboarding, or replay Aisha's demo run to watch the agents read her syllabus, job ads and GitHub."
              action={<Button className="h-11 rounded-xl px-5 text-base hover:bg-primary/90" onClick={replay} disabled={replaying}>{replaying ? <><Loader2 className="size-4 animate-spin" aria-hidden />Starting…</> : "Replay demo run"}</Button>}
            />
          )}
          {runId && !events.length && (
            <div className="space-y-3" aria-busy="true">
              <p className="text-sm text-muted-foreground">Starting your agents…</p>
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          )}

          {/* The live region: new rows are announced politely. */}
          <ol className="space-y-3" aria-live="polite" aria-relevant="additions text" data-testid="agent-timeline">
            {groups.map((g) => (
              <li key={g.agent} className="rounded-xl bg-muted/60 p-4" data-agent={g.agent}>
                <div className="flex items-center gap-3">
                  <span aria-hidden><AgentAvatar agent={g.agent} /></span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{AGENT_LABEL[g.agent] ?? g.agent}</span>
                  <StateBadge state={g.state} />
                </div>
                <ol className="mt-3 space-y-2">
                  {g.events.map((e, i) => {
                    const latest = i === g.events.length - 1;
                    return (
                      <motion.li
                        key={keyOf(e)}
                        data-latest={keyOf(e) === latestKey ? "true" : undefined}
                        data-testid="agent-row"
                        className="flex items-start gap-2 text-sm text-foreground"
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      >
                        <RowIcon e={e} latest={latest} working={g.state === "working"} />
                        <span className="min-w-0 flex-1 break-words"><HighlightNumbers text={e.message} /></span>
                        <time dateTime={e.ts} className="shrink-0 text-xs text-muted-foreground tabular-nums">{relativeTime(e.ts, now)}</time>
                      </motion.li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
