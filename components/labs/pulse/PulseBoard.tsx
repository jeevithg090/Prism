"use client";
// Live Lab Pulse: the lecturer's projector board. Starts a session, ticks the lab clock (simulated labs replay the
// seeded cohort; live labs poll real submissions), and hands the lecturer each suggested intervention to decide.
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Activity, Pause, Play, RotateCcw, ShieldCheck, WifiOff } from "lucide-react";
import { DemoDataNote, EmptyState, ErrorState, SectionCard } from "@/components/keystone";
import { useActivity } from "@/components/shell/ActivityPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_LABEL, PULSE_ANONYMITY_MIN, STUCK_CHECKS, type Explainer, type PulseSession, type PulseSnapshot, type PulseSource, type Suggestion, type InterventionKind } from "@/lib/labs/pulse/model";
import { cn } from "@/lib/utils";
import { decide, fetchSnapshot, PULSE_CHALLENGES, startSession } from "./api";
import { CriteriaBoard } from "./CriteriaBoard";
import { ExplainerDialog } from "./ExplainerDialog";
import { PulseTimeline } from "./PulseTimeline";
import { SuggestionPanel } from "./SuggestionPanel";
import { TimeOnTask } from "./TimeOnTask";

/** Simulated clock: half a lab minute every 0.8 s, so a 20-minute lab plays in 32 seconds. */
export const TICK_MS = 800;
export const STEP_MINUTES = 0.5;
const LIVE_POLL_MS = 5000;
const MAX_TICK_ERRORS = 4;

type Phase = "idle" | "starting" | "running" | "paused" | "ended" | "error";
/** An actionable suggestion stays on screen this long while the board moves on, so it never changes under the lecturer's cursor. */
export const PIN_MINUTES = 2;
export type Pinned = { s: Suggestion; minute: number } | null;
type Actionable = Suggestion & { kind: InterventionKind; criterionId: string };
const actionable = (s: Suggestion | null | undefined): s is Actionable => !!s && !!s.criterionId && (s.kind === "explain" || s.kind === "peer" || s.kind === "nudge");

/** Keep the pinned suggestion for PIN_MINUTES; otherwise pin the snapshot's new actionable suggestion, if any. */
export function nextPinned(p: Pinned, snap: PulseSnapshot): Pinned {
  if (p && snap.minute >= p.minute && snap.minute - p.minute < PIN_MINUTES && snap.suggestion?.kind !== "watch") return p;
  return actionable(snap.suggestion) ? { s: snap.suggestion, minute: snap.minute } : null;
}
const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1));

function BoardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Starting the lab board">
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}

function LabClock({ snap, phase, onToggle }: { snap: PulseSnapshot; phase: Phase; onToggle: () => void }) {
  const n = snap.cohortSize;
  const progress = Math.round((snap.minute / Math.max(1, snap.labMinutes)) * 100);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Lab clock</p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-5xl font-semibold tracking-tight tabular-nums">{fmt(snap.minute)}</span>
          <span className="text-lg text-muted-foreground">of {snap.labMinutes} minutes</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Lab time used">
          <span className="block h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div><dt className="text-muted-foreground">In the room</dt><dd className="font-mono text-2xl font-semibold tabular-nums">{n}</dd></div>
        <div><dt className="text-muted-foreground">Passed</dt><dd className="font-mono text-2xl font-semibold tabular-nums">{snap.passed} <span className="text-base font-normal text-muted-foreground">of {n}</span></dd></div>
        <div><dt className="text-muted-foreground">Checks pressed</dt><dd className="font-mono text-2xl font-semibold tabular-nums">{snap.submissions}</dd></div>
        <div><dt className="text-muted-foreground">Median time to pass</dt><dd className="font-mono text-2xl font-semibold tabular-nums">{snap.medianPassMinutes !== null ? `${fmt(snap.medianPassMinutes)} min` : "None yet"}</dd></div>
      </dl>
      {snap.effects.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <p className="font-semibold">What your interventions did</p>
          <ul className="space-y-1.5 text-sm">
            {snap.effects.map((e) => (
              <li key={e.interventionId}>
                <span className="font-medium">{e.concept}:</span>{" "}
                <span className="tabular-nums">{e.metBefore} → {e.metNow} of {n}</span> have it, {fmt(e.minutesSince)} min after your {KIND_LABEL[e.kind]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {snap.context?.gapRank && (
        <p className="border-t pt-4 text-sm text-muted-foreground">
          Why this lab: {snap.skillName} is gap #{snap.context.gapRank} that no module covers
          {snap.context.demandPct !== null && snap.context.roleName ? `, asked for in ${snap.context.demandPct}% of ${snap.context.roleName} ads` : ""}.{" "}
          <Link href="/lecturer" className="rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">Lecturer Insights</Link>
        </p>
      )}
      {snap.source === "simulated" && phase !== "ended" && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button variant="outline" className="h-10 rounded-xl px-4" onClick={onToggle}>
            {phase === "paused" ? <><Play aria-hidden />Resume</> : <><Pause aria-hidden />Pause</>}
          </Button>
          <span className="text-sm text-muted-foreground">Simulated clock: 1 lab minute every {(TICK_MS / STEP_MINUTES / 1000).toFixed(1)} seconds</span>
        </div>
      )}
    </div>
  );
}

export function PulseBoard({ demo }: { demo: boolean }) {
  const activity = useActivity();
  const [challengeId, setChallengeId] = useState<string>(PULSE_CHALLENGES[0].id);
  const [phase, setPhase] = useState<Phase>("idle");
  const [startError, setStartError] = useState<string | null>(null);
  const [session, setSession] = useState<PulseSession | null>(null);
  const [snap, setSnapState] = useState<PulseSnapshot | null>(null);
  const [pinned, setPinned] = useState<Pinned>(null);
  const setSnap = (s: PulseSnapshot | null) => {
    setSnapState(s);
    setPinned((p) => (s ? nextPinned(p, s) : null));
  };
  const [tickErrors, setTickErrors] = useState(0);
  const [busy, setBusy] = useState(false);
  /** The newest agent run (session start or a decision), opened on demand so the panel never covers the board. */
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [explainer, setExplainer] = useState<Explainer | null>(null);

  // The lab clock: one snapshot per tick while running.
  useEffect(() => {
    if (phase !== "running" || !session || tickErrors >= MAX_TICK_ERRORS) return;
    const simulated = session.source === "simulated";
    let cancelled = false;
    const id = setTimeout(async () => {
      const next = simulated ? Math.min(session.labMinutes, (snap?.minute ?? 0) + STEP_MINUTES) : undefined;
      try {
        const s = await fetchSnapshot(session.id, next);
        if (cancelled) return;
        setSnap(s);
        setTickErrors(0);
        if (s.minute >= session.labMinutes) setPhase("ended");
      } catch {
        if (!cancelled) setTickErrors((n) => n + 1);
      }
    }, simulated ? TICK_MS : LIVE_POLL_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [phase, session, snap, tickErrors]);

  async function start(source?: PulseSource) {
    setPhase("starting");
    setStartError(null);
    setSnap(null);
    setTickErrors(0);
    try {
      const r = await startSession({ challengeId, ...(source ? { source } : {}) });
      setSession(r.session);
      setSnap(r.snapshot);
      setPhase("running");
      setLastRunId(r.runId);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "The board didn't start.");
      setPhase("error");
    }
  }

  function reset() {
    setLastRunId(null);
    setPhase("idle");
    setSession(null);
    setSnap(null);
    setExplainer(null);
  }

  async function act(decision: "run" | "skip") {
    const s = pinned?.s ?? snap?.suggestion;
    if (!session || !snap || !actionable(s)) return;
    setBusy(true);
    try {
      const r = await decide({ sessionId: session.id, minute: snap.minute, criterionId: s.criterionId, kind: s.kind, decision });
      setLastRunId(r.runId);
      const fresh = await fetchSnapshot(session.id, session.source === "simulated" ? snap.minute : undefined);
      setPinned(null);
      setSnapState(fresh);
      if (decision === "skip") setPinned(nextPinned(null, fresh));
      if (decision === "run" && r.explainer) {
        if (phase === "running") setPhase("paused");
        setExplainer(r.explainer);
      } else {
        toast(`Skipped the ${KIND_LABEL[s.kind]}`, { description: `Lab Pulse won't suggest ${r.intervention.concept} again for 3 minutes.` });
      }
    } catch {
      toast.error("We couldn't record your decision", { description: "Nothing changed on the board. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function doneExplaining() {
    const e = explainer;
    setExplainer(null);
    if (!session || !snap || !e) return;
    if (session.source === "simulated") {
      // The explanation took its minutes of lab time; jump the simulated clock past it.
      try {
        setSnap(await fetchSnapshot(session.id, Math.min(session.labMinutes, snap.minute + e.minutes)));
      } catch { /* the next tick catches up */ }
    }
    setPhase("running");
    toast.success("Back to the board", { description: `Watching how the room responds to your ${e.minutes}-minute explainer.` });
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Micro-challenge" className="flex flex-wrap gap-1.5">
        {PULSE_CHALLENGES.map((c) => (
          <button
            key={c.id} type="button" aria-pressed={challengeId === c.id}
            disabled={phase === "starting" || phase === "running" || phase === "paused"}
            onClick={() => setChallengeId(c.id)}
            className={cn(
              "h-10 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
              challengeId === c.id ? "border-primary bg-primary/10 text-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {lastRunId && (
        <Button variant="ghost" className="h-10 rounded-xl px-3" onClick={() => activity.start(lastRunId)}>
          <Activity aria-hidden />Watch the agents
        </Button>
      )}
      {session && <Button variant="outline" className="h-10 rounded-xl px-4" onClick={reset}><RotateCcw aria-hidden />New lab</Button>}
    </div>
  );

  let body: React.ReactNode;
  if (phase === "idle") {
    body = (
      <SectionCard title="Start the board when the lab starts" description={demo ? "Plays a 20-minute lab with the seeded cohort of 13 students, graded by the challenge's own rubric." : "Reads every Check your students press on the micro-challenge, graded by its own rubric."}>
        <ul className="space-y-2 text-muted-foreground">
          <li className="flex gap-2"><Activity className="mt-1 size-4 shrink-0 text-primary" aria-hidden />Shows which rubric criterion the room is stuck on, and how long students have gone without a step forward.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-1 size-4 shrink-0 text-primary" aria-hidden />Counts only, for groups of {PULSE_ANONYMITY_MIN} or more. No names or ids reach this screen.</li>
          <li className="flex gap-2"><Play className="mt-1 size-4 shrink-0 text-primary" aria-hidden />Suggests when to step in, with an explainer drafted from the rubric. You decide; nothing is sent to students.</li>
        </ul>
        <Button className="mt-6 h-11 rounded-xl px-5" onClick={() => start()}><Play aria-hidden />Start the lab</Button>
      </SectionCard>
    );
  } else if (phase === "starting") {
    body = <BoardSkeleton />;
  } else if (phase === "error" || !snap) {
    body = (
      <ErrorState
        title="The board didn't start"
        body={`${startError ?? "That's on us, not you."} Try again, or play the lab with the seeded demo cohort.`}
        onRetry={() => start()}
        onUseDemo={() => start("simulated")}
      />
    );
  } else if (snap.suppressed) {
    body = (
      <EmptyState
        icon={ShieldCheck}
        title={`Waiting for ${PULSE_ANONYMITY_MIN} students`}
        body={`${snap.cohortSize} ${snap.cohortSize === 1 ? "student has" : "students have"} pressed Check so far. The board shows groups of ${PULSE_ANONYMITY_MIN} or more only, so no student can be singled out. Students join by opening the ${snap.skillName} micro-challenge.`}
        action={<Button className="h-11 rounded-xl px-5" onClick={() => start("simulated")}>Play the lab with the demo cohort</Button>}
      />
    );
  } else {
    const focus = snap.criteria.find((c) => c.id === snap.focusCriterionId);
    body = (
      <div className="space-y-6">
        {tickErrors >= 2 && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-status-gap/25 bg-status-gap/10 px-4 py-3 text-foreground">
            <WifiOff className="size-5 text-status-gap" aria-hidden />
            <span className="min-w-0 flex-1">
              {tickErrors >= MAX_TICK_ERRORS ? "The board lost its connection and stopped updating." : "The board missed an update. Retrying."} The numbers below are from minute {fmt(snap.minute)}.
            </span>
            {tickErrors >= MAX_TICK_ERRORS && <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => setTickErrors(0)}>Retry</Button>}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title={phase === "ended" ? "Lab finished" : "What to do now"} description={`${snap.skillName}: ${snap.challengeTitle}`}>
            {(pinned?.s ?? snap.suggestion) && (
              <SuggestionPanel
                suggestion={(pinned?.s ?? snap.suggestion)!}
                since={pinned && pinned.minute !== snap.minute ? fmt(pinned.minute) : null}
                busy={busy} onRun={() => act("run")} onSkip={() => act("skip")}
              />
            )}
          </SectionCard>
          <SectionCard title="The room" actions={snap.source === "simulated" ? <DemoDataNote /> : undefined}>
            <LabClock snap={snap} phase={phase} onToggle={() => setPhase((p) => (p === "paused" ? "running" : "paused"))} />
          </SectionCard>
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <SectionCard className="lg:col-span-3" title="Where the room is, criterion by criterion" description={`Stuck means the criterion stayed unmet in ${STUCK_CHECKS} checks in a row.`}>
            <CriteriaBoard criteria={snap.criteria} cohortSize={snap.cohortSize} hotspotId={snap.hotspot?.criterionId ?? null} />
          </SectionCard>
          <SectionCard className="lg:col-span-2" title="Time since each student's last step forward" description="A step forward is a criterion turning green.">
            <TimeOnTask buckets={snap.timeOnTask} cohortSize={snap.cohortSize} />
          </SectionCard>
        </div>
        <SectionCard title="The lab so far" description={focus ? `Share of the room that has ${focus.concept}, and share that has passed.` : "Share of the room that has passed."}>
          <PulseTimeline points={snap.timeline} concept={focus?.concept ?? "the focus criterion"} effects={snap.effects} labMinutes={snap.labMinutes} cohortSize={snap.cohortSize} />
        </SectionCard>
        <p className="text-sm text-muted-foreground">{snap.receipt}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {controls}
      {body}
      <ExplainerDialog explainer={explainer} open={!!explainer} onDone={doneExplaining} />
    </div>
  );
}
