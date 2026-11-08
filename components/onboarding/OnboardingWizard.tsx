"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgentAvatar, AGENT_META, ErrorState, PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { HighlightNumbers, useActivity } from "@/components/shell/ActivityPanel";
import { apiPost } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { AgentEvent, AgentName, Profile } from "@/lib/types";
import { DEFAULT_DRAFT, STEPS, toProfileInput, validateStep, type OnboardDraft } from "./draft";
import { Stepper } from "./Stepper";
import { StepYou } from "./StepYou";
import { StepGoal } from "./StepGoal";
import { StepLearn } from "./StepLearn";
import { StepBadges } from "./StepBadges";
import { AgentBrief } from "./AgentBrief";

// /onboard: 4 short steps → POST /api/profile → POST /api/onboard/run → the Activity panel streams the
// agents → /map when the orchestrator is done.

type Phase =
  | { kind: "form" }
  | { kind: "submitting"; demo: boolean }
  | { kind: "running"; runId: string; firstName: string }
  | { kind: "error" };

const STEP_VIEWS = [StepYou, StepGoal, StepLearn, StepBadges];
const LAST = STEPS.length - 1;

function setUserCookie(id: string) {
  try {
    document.cookie = `ks_uid=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
  } catch { /* the server also sets it */ }
}

export function OnboardingWizard() {
  const router = useRouter();
  const activity = useActivity();
  const [draft, setDraft] = React.useState<OnboardDraft>(DEFAULT_DRAFT);
  const [step, setStep] = React.useState(0);
  const [reached, setReached] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(new Set());
  const [attempted, setAttempted] = React.useState<ReadonlySet<number>>(new Set());
  const [phase, setPhase] = React.useState<Phase>({ kind: "form" });
  const reduce = useReducedMotion() || draft.accessibility.includes("reduced-motion");
  const stepRef = React.useRef<HTMLDivElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const moved = React.useRef(false);

  const errors = validateStep(step, draft);
  const valid = Object.keys(errors).length === 0;
  const visibleErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => attempted.has(step) || touched.has(k)));
  const firstError = Object.values(errors)[0];
  const busy = phase.kind === "submitting";

  const set = React.useCallback((patch: Partial<OnboardDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setTouched((t) => new Set([...t, ...Object.keys(patch)]));
  }, []);
  const touch = React.useCallback((field: keyof OnboardDraft) => setTouched((t) => (t.has(field) ? t : new Set([...t, field]))), []);

  // Move focus to the new step's heading so keyboard and screen-reader users land in the right place.
  React.useEffect(() => {
    if (!moved.current) return;
    stepRef.current?.focus();
  }, [step]);

  // The orchestrator finished: go to the Bridge Map (the panel stays open with the result).
  React.useEffect(() => {
    if (phase.kind !== "running" || activity.runId !== phase.runId) return;
    if (activity.status === "done" || activity.status === "error") router.push("/map");
  }, [phase, activity.runId, activity.status, router]);

  const go = (next: number) => {
    moved.current = true;
    setDir(next > step ? 1 : -1);
    setStep(next);
    setReached((r) => Math.max(r, next));
  };

  const begin = (runId: string, name: string) => {
    activity.start(runId);
    setPhase({ kind: "running", runId, firstName: name.split(/\s+/)[0] ?? name });
    toast.success("Your agents are on it", { description: "Watch them read your syllabus, job ads and GitHub." });
  };

  const failed = () => {
    setPhase({ kind: "error" });
    toast.error("Couldn't start. Try again or use the demo.");
  };

  const finish = async () => {
    setPhase({ kind: "submitting", demo: false });
    try {
      const profile = await apiPost<Profile>("/api/profile", toProfileInput(draft));
      setUserCookie(profile.id);
      const { runId } = await apiPost<{ runId: string }>("/api/onboard/run", { userId: profile.id, programmeUrl: draft.programmeUrl.trim() });
      begin(runId, profile.name);
    } catch {
      failed();
    }
  };

  const startDemoProfile = async () => {
    setPhase({ kind: "submitting", demo: true });
    try {
      setUserCookie("aisha");
      const { runId } = await apiPost<{ runId: string }>("/api/onboard/run", { userId: "aisha" });
      begin(runId, "Aisha Rahman");
    } catch {
      failed();
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!valid) {
      setAttempted((a) => new Set([...a, step]));
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (step < LAST) go(step + 1);
    else void finish();
  };

  if (phase.kind === "running") return <RunningView runId={phase.runId} firstName={phase.firstName} />;

  const View = STEP_VIEWS[step];
  return (
    <div>
      <PageHeader
        title="Build your bridge"
        subtitle="Four short steps. Then agents read your syllabus, real job ads and your GitHub, and show you the gaps between them."
        actions={
          <Button variant="outline" className="w-full sm:w-auto" onClick={startDemoProfile} disabled={busy} aria-busy={busy && phase.demo ? true : undefined}>
            {busy && phase.demo ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            Use Aisha&apos;s demo profile
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:pb-16 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-6">
          {phase.kind === "error" && (
            <ErrorState title="We couldn't start your agents" body="That's on us, not you. Try again, or explore Keystone with Aisha's demo profile." onRetry={() => void finish()} onUseDemo={() => void startDemoProfile()} />
          )}
          <section aria-label="Your answers" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <Stepper current={step} onJump={(i) => go(i)} />
            <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 space-y-8">
              <motion.div
                key={step}
                ref={stepRef}
                tabIndex={-1}
                role="group"
                aria-labelledby="ob-step-title"
                className="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                initial={reduce ? false : { opacity: 0, x: 24 * dir }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <span id="ob-step-title" className="sr-only">Step {step + 1} of {STEPS.length}: {STEPS[step].title}</span>
                <View draft={draft} set={set} errors={visibleErrors} touch={touch} />
              </motion.div>

              <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-start sm:justify-between">
                {step > 0 ? (
                  <Button type="button" variant="outline" size="lg" onClick={() => go(step - 1)} disabled={busy}>
                    <ArrowLeft className="size-4" aria-hidden />Back
                  </Button>
                ) : <span className="hidden sm:block" />}
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <Button type="submit" size="lg" disabled={!valid || busy} aria-busy={busy && !phase.demo ? true : undefined} aria-describedby={!valid ? "ob-continue-hint" : undefined}>
                    {busy && !phase.demo ? <><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />Starting your agents…</> : step < LAST ? "Continue" : "Build my bridge"}
                  </Button>
                  {!valid && <p id="ob-continue-hint" className="text-sm text-pretty text-muted-foreground sm:text-right">{firstError}</p>}
                </div>
              </div>
            </form>
          </section>
          <p className="text-sm text-pretty text-muted-foreground">You can change any of this later. Nothing is shared outside Keystone.</p>
        </div>
        <AgentBrief draft={draft} step={step} reached={reached} />
      </div>
    </div>
  );
}

const RUN_STATUS: Record<AgentEvent["status"], { label: string; icon: React.ReactNode }> = {
  started: { label: "Working", icon: <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" aria-hidden /> },
  progress: { label: "Working", icon: <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" aria-hidden /> },
  done: { label: "Done", icon: <CheckCircle2 className="size-4 text-status-proven" aria-hidden /> },
  error: { label: "Needs a retry", icon: <AlertTriangle className="size-4 text-status-gap" aria-hidden /> },
};

function RunningView({ runId, firstName }: { runId: string; firstName: string }) {
  const { events, setOpen, runId: activeRun, status } = useActivity();
  const mine = activeRun === runId ? events : [];
  const latest = mine[mine.length - 1];
  const agents = new Map<AgentName, AgentEvent["status"]>();
  for (const e of mine) if (e.agent !== "orchestrator") agents.set(e.agent, e.status);
  const finishedCount = [...agents.values()].filter((s) => s === "done" || s === "error").length;
  return (
    <div>
      <PageHeader title={`Building ${firstName}'s bridge`} subtitle="Your agents are reading your syllabus, real job ads and your GitHub. Your Bridge Map opens as soon as they finish." />
      <section className="max-w-3xl rounded-2xl border bg-card p-6 shadow-sm md:p-8" aria-labelledby="ob-running-title" aria-busy={status !== "done" ? true : undefined}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1">
            <h2 id="ob-running-title" className="text-xl font-semibold text-foreground">{status === "done" ? "Your bridge is ready" : "Your agents are working"}</h2>
            <p className="text-muted-foreground">
              {agents.size ? (
                <><span className="font-mono font-semibold tabular-nums text-foreground">{finishedCount}</span> of <span className="font-mono font-semibold tabular-nums text-foreground">{agents.size}</span> agents finished</>
              ) : "Starting your agents…"}
            </p>
          </div>
          {agents.size > 0 && (
            <p className="font-mono text-5xl font-semibold tabular-nums text-foreground" aria-hidden>
              {finishedCount}<span className="text-muted-foreground">/{agents.size}</span>
            </p>
          )}
        </div>

        <ul className="mt-6 border-b" aria-label="Agents in this run">
          {agents.size === 0
            ? [0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 border-t py-3" aria-hidden>
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-4 w-16" />
                </li>
              ))
            : [...agents.entries()].map(([agent, s]) => (
                <li key={agent} className="flex items-center gap-3 border-t py-3">
                  {/* The GitHub mark ignores AgentAvatar's inline size; pin every icon to the same 16px. */}
                  <span className="contents [&_svg]:size-4"><AgentAvatar agent={agent} size={32} /></span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{AGENT_META[agent]?.name ?? agent}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">{RUN_STATUS[s].icon}{RUN_STATUS[s].label}</span>
                </li>
              ))}
        </ul>

        {latest && (
          <p className="mt-6 rounded-xl bg-muted p-4 text-foreground">
            <span className="font-semibold">Latest: </span><HighlightNumbers text={latest.message} />
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/map" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>Go to my Bridge Map</Link>
          <Button size="lg" onClick={() => setOpen(true)}>Watch the agents</Button>
        </div>
      </section>
    </div>
  );
}
