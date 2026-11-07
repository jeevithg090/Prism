"use client";
// /labs/council: pick a recommendation, convene three advocates, read the ruling, decide.
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Activity, Gavel, History, Loader2, Map as MapIcon, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AgentAvatar, DemoDataNote, EmptyState, ErrorState, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { cn } from "@/lib/utils";
import {
  SEAT_AGENT, SEAT_ARGUES_FROM, SEAT_LABEL, SEATS,
  type CouncilDecision, type CouncilOverview, type CouncilSession, type Seat,
} from "@/lib/labs/council/types";
import { AdvocateCard } from "./AdvocateCard";
import { fmtDate, fmtWhen, newClientRunId } from "./meta";
import { VerdictCard } from "./VerdictCard";

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let json: { ok: boolean; data?: T; error?: { message: string } };
  try { json = await res.json(); } catch { throw new ApiError("The server sent something we couldn't read.", res.status); }
  if (!json.ok) throw new ApiError(json.error?.message ?? "Request failed", res.status);
  return json.data as T;
}
const post = <T,>(url: string, body: unknown) => call<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const CUSTOM = "custom";
const keyOf = (skillId: string, week: number) => `${skillId}@${week}`;

// ---------- loading ----------

export function CouncilSkeleton({ label = "Loading the council" }: { label?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96 w-full rounded-2xl" />)}</div>
    </div>
  );
}

// ---------- the motion picker ----------

function MotionPicker({
  overview, choice, setChoice, customSkill, setCustomSkill, customWeek, setCustomWeek, question, setQuestion, onConvene, busy, primary,
}: {
  overview: CouncilOverview; choice: string; setChoice: (v: string) => void; customSkill: string; setCustomSkill: (v: string) => void;
  customWeek: number; setCustomWeek: (v: number) => void; question: string; setQuestion: (v: string) => void;
  onConvene: () => void; busy: boolean; primary: boolean;
}) {
  const roadmapOpts = overview.options.filter((o) => o.group === "roadmap");
  const skippedOpts = overview.options.filter((o) => o.group === "skipped");
  const select = "h-10 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <SectionCard title="What should the council debate?" description={`Pick a week of your roadmap, something your plan skips, or propose your own move.${overview.roadmapVersion ? ` Your roadmap is on version ${overview.roadmapVersion}.` : ""}`}>
      <form
        className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-end"
        onSubmit={(e) => { e.preventDefault(); onConvene(); }}
      >
        <div className="space-y-2">
          <Label htmlFor="council-motion">Recommendation</Label>
          <select id="council-motion" className={select} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {roadmapOpts.length > 0 && (
              <optgroup label="Your roadmap">
                {roadmapOpts.map((o) => <option key={keyOf(o.skillId, o.week)} value={keyOf(o.skillId, o.week)}>{o.label}</option>)}
              </optgroup>
            )}
            {skippedOpts.length > 0 && (
              <optgroup label="Your plan skips these">
                {skippedOpts.map((o) => <option key={keyOf(o.skillId, o.week)} value={keyOf(o.skillId, o.week)}>{o.label}</option>)}
              </optgroup>
            )}
            <option value={CUSTOM}>Propose your own move</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="council-question">Your question (optional)</Label>
          <input
            id="council-question" value={question} maxLength={240} onChange={(e) => setQuestion(e.target.value)}
            placeholder="Should I really start with Docker?"
            className={select}
          />
        </div>
        <Button
          type="submit" variant={primary ? "default" : "outline"} disabled={busy || (choice === CUSTOM && !customSkill)}
          className="h-11 rounded-xl px-5 text-base"
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Gavel aria-hidden />}
          {busy ? "The council is meeting" : "Convene the council"}
        </Button>
        {choice === CUSTOM && (
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <div className="space-y-2">
              <Label htmlFor="council-skill">Skill</Label>
              <select id="council-skill" className={select} value={customSkill} onChange={(e) => setCustomSkill(e.target.value)}>
                {overview.skills.map((s) => <option key={s.skillId} value={s.skillId}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="council-week">Week</Label>
              <select id="council-week" className={select} value={customWeek} onChange={(e) => setCustomWeek(Number(e.target.value))}>
                {(overview.weeks.length ? overview.weeks : Array.from({ length: 12 }, (_, i) => ({ week: i + 1, startDate: "", focusSkillId: "", isExamWeek: false }))).map((w) => (
                  <option key={w.week} value={w.week}>
                    {`Week ${w.week}${w.startDate ? `, from ${fmtDate(w.startDate)}` : ""}${w.isExamWeek ? " (exam week)" : ""}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </form>
    </SectionCard>
  );
}

// ---------- before the first debate ----------

function seatReads(seat: Seat, o: CouncilOverview): string {
  const s = o.sources;
  if (seat === "market") return `${s.ads ? `${s.ads} ${o.roleName} job ads` : `${o.roleName} job-ad demand`}${s.trendSeries ? ` and ${s.trendSeries} trend forecasts${s.trendMonths ? ` fitted on ${s.trendMonths} months` : ""}` : ""}.`;
  if (seat === "degree") return `${s.modules ? `${s.modules} modules of ${s.programme ?? "your programme"}` : "Your syllabus"}, with when each one teaches what, and the prerequisites on your Bridge Map.`;
  return `Your ${s.hoursPerWeek} hours a week${s.constraints ? `, ${s.constraints} constraint${s.constraints === 1 ? "" : "s"} you set` : ""}, and ${s.examWeeks} exam week${s.examWeeks === 1 ? "" : "s"} in your ${s.weeks}-week plan.`;
}

function ReadyState({ overview }: { overview: CouncilOverview }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {SEATS.map((seat) => (
        <article key={seat} className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <AgentAvatar agent={SEAT_AGENT[seat]} size={40} />
            <h3 className="text-xl font-semibold tracking-tight">{SEAT_LABEL[seat]}</h3>
          </div>
          <p className="mt-3 text-base">Argues from {SEAT_ARGUES_FROM[seat]}.</p>
          <p className="mt-2 text-sm text-muted-foreground">Will read: {seatReads(seat, overview)}</p>
        </article>
      ))}
    </div>
  );
}

// ---------- past rulings ----------

function PastRulings({ overview, currentId, onPick, loadingId }: { overview: CouncilOverview; currentId?: string; onPick: (id: string) => void; loadingId: string | null }) {
  if (overview.sessions.length < 2) return null;
  return (
    <SectionCard title="Past rulings" description="Every debate and your decision stay on record, with the dissent.">
      <ul className="divide-y">
        {overview.sessions.map((s) => {
          const status = s.choice === "accept" ? "You accepted" : s.choice === "overrule" ? "You overruled" : "Waiting for you";
          return (
            <li key={s.id}>
              <button
                type="button" onClick={() => onPick(s.id)} aria-current={s.id === currentId ? "true" : undefined}
                className={cn("flex w-full flex-col gap-1 rounded-xl px-2 py-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4", s.id === currentId && "bg-muted/60")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.motion}</span>
                  <span className="block text-sm text-muted-foreground">{s.verdict}</span>
                </span>
                <span className="flex items-center gap-3 text-sm text-muted-foreground">
                  {loadingId === s.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  <span className={cn("rounded-full border px-2.5 py-0.5 font-medium text-foreground", !s.choice && "border-primary/40")}>{status}</span>
                  <span>{fmtWhen(s.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ---------- the view ----------

export function CouncilView({ userId, initialSession }: { userId: string; initialSession?: string }) {
  const [uid, setUid] = React.useState(userId);
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const activity = useActivity();
  const key = React.useMemo(() => ["labs-council", uid] as const, [uid]);
  const firstSession = React.useRef(initialSession);
  const overview = useQuery({
    queryKey: key,
    queryFn: () => {
      const s = firstSession.current;
      firstSession.current = undefined;
      return call<CouncilOverview>(`/api/labs/council?userId=${encodeURIComponent(uid)}${s ? `&session=${encodeURIComponent(s)}` : ""}`);
    },
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 1,
  });

  const [picked, setPicked] = React.useState<CouncilSession | null>(null);
  const session = picked ?? overview.data?.current ?? null;
  const [choiceState, setChoice] = React.useState<string | null>(null);
  const [customSkillState, setCustomSkill] = React.useState<string | null>(null);
  const [customWeekState, setCustomWeek] = React.useState<number | null>(null);
  const [question, setQuestion] = React.useState("");
  const [busyRun, setBusyRun] = React.useState<string | null>(null);
  const [deciding, setDeciding] = React.useState<"accept" | "overrule" | null>(null);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  // The picker defaults to the motion on screen, else the first roadmap week (derived, so no effect is needed).
  const defaults = React.useMemo(() => {
    const ov = overview.data;
    if (!ov) return { choice: CUSTOM, skill: "", week: 1 };
    const m = session?.motion;
    const match = m && ov.options.find((x) => x.skillId === m.skillId && x.week === m.week);
    if (match) return { choice: keyOf(match.skillId, match.week), skill: ov.skills[0]?.skillId ?? "", week: 1 };
    if (m) return { choice: CUSTOM, skill: m.skillId, week: m.week };
    const first = ov.options[0];
    return { choice: first ? keyOf(first.skillId, first.week) : CUSTOM, skill: ov.skills[0]?.skillId ?? "", week: 1 };
  }, [overview.data, session?.motion]);
  const choice = choiceState ?? defaults.choice;
  const customSkill = customSkillState ?? defaults.skill;
  const customWeek = customWeekState ?? defaults.week;

  const convene = async () => {
    const o = overview.data;
    if (!o) return;
    const runId = newClientRunId();
    const opt = o.options.find((x) => keyOf(x.skillId, x.week) === choice);
    const body = choice === CUSTOM ? { skillId: customSkill, week: customWeek } : opt ? { skillId: opt.skillId, week: opt.week } : {};
    setBusyRun(runId);
    try {
      const s = await post<CouncilSession>("/api/labs/council", { userId: uid, runId, ...body, ...(question.trim() ? { question: question.trim() } : {}) });
      setPicked(s);
      toast.success(s.verdict.title, { description: "The council has ruled. You decide what happens next." });
      void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error("The council couldn't meet", { description: e instanceof Error ? e.message : "Try again in a moment." });
    } finally {
      setBusyRun(null);
    }
  };

  const decide = async (c: "accept" | "overrule", reason?: string) => {
    if (!session) return;
    setDeciding(c);
    try {
      const r = await post<{ session: CouncilSession; decision: CouncilDecision }>("/api/labs/council/decide", { userId: uid, sessionId: session.id, choice: c, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
      setPicked(r.session);
      toast.success(c === "accept" ? "Ruling accepted" : "You overruled the council", { description: r.decision.summary });
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["roadmap", uid] });
    } catch (e) {
      toast.error("Your decision wasn't saved", { description: e instanceof Error ? e.message : "Try again in a moment." });
    } finally {
      setDeciding(null);
    }
  };

  const pick = async (id: string) => {
    setLoadingId(id);
    try {
      const o = await call<CouncilOverview>(`/api/labs/council?userId=${encodeURIComponent(uid)}&session=${encodeURIComponent(id)}`);
      if (o.current) setPicked(o.current);
    } catch {
      toast.error("That ruling didn't load", { description: "Try again in a moment." });
    } finally {
      setLoadingId(null);
    }
  };

  if (overview.isPending) return <CouncilSkeleton />;
  if (overview.isError) {
    const e = overview.error;
    if (e instanceof ApiError && e.status === 404) {
      return (
        <EmptyState
          icon={MapIcon}
          title="The council needs a plan to debate"
          body={e.message}
          action={<Link href="/onboard" className={cn(buttonVariants(), "h-11 rounded-xl px-5 text-base")}>Build your Bridge Map</Link>}
        />
      );
    }
    return (
      <ErrorState
        title="The council didn't load"
        body="That's on us, not you. Your roadmap is unchanged."
        onRetry={() => void overview.refetch()}
        onUseDemo={uid === "aisha" ? undefined : () => { setPicked(null); setChoice(null); setUid("aisha"); }}
      />
    );
  }

  const o = overview.data;
  const undecided = !!session && !session.decision;
  const finalScores = session?.verdict.finalScores;
  const enter = (i: number) => (reduce ? { initial: false as const } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as const, delay: i * 0.04 } });

  return (
    <div className="space-y-8">
      <MotionPicker
        overview={o} choice={choice} setChoice={setChoice} customSkill={customSkill} setCustomSkill={setCustomSkill}
        customWeek={customWeek} setCustomWeek={setCustomWeek} question={question} setQuestion={setQuestion}
        onConvene={() => void convene()} busy={!!busyRun} primary={!undecided}
      />

      {busyRun ? (
        <div className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-base">Three advocates are reading your data and arguing their case.</p>
            <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => activity.start(busyRun)}>
              <Activity aria-hidden />Watch the agents
            </Button>
          </div>
          <CouncilSkeleton label="The council is deliberating" />
        </div>
      ) : !session ? (
        <section aria-labelledby="council-ready" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="council-ready" className="text-xl font-semibold tracking-tight">Three seats, one ruling, your call</h2>
            {o.demo && <DemoDataNote />}
          </div>
          <p className="max-w-3xl text-base text-muted-foreground">
            Each advocate argues from its own data and must cite a receipt for every claim. They rebut each other once, then the judge weighs them and keeps the strongest objection on record.
          </p>
          <ReadyState overview={o} />
        </section>
      ) : (
        <div className="space-y-6" key={session.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">The motion, debated {fmtWhen(session.createdAt)}</p>
              <p className="text-xl font-semibold tracking-tight">{session.motion.label}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {o.demo && <DemoDataNote />}
              <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => activity.start(session.runId)}>
                <Activity aria-hidden />Show agent activity
              </Button>
            </div>
          </div>

          {session.question && (
            <div className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              {session.injection?.risk === "high" && <ShieldAlert className="mt-0.5 size-5 shrink-0 text-status-gap" aria-hidden />}
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">You asked</p>
                <p className="text-base break-words">&ldquo;{session.question}&rdquo;</p>
                {session.injection?.risk === "high" && (
                  <p className="mt-1 text-sm">It read like instructions to an AI, so the agents treated it as data only. The debate comes from your Keystone data.</p>
                )}
              </div>
            </div>
          )}

          <motion.div {...enter(0)}>
            <VerdictCard session={session} onDecide={(c, r) => void decide(c, r)} deciding={deciding} />
          </motion.div>

          <section aria-labelledby="council-debate" className="space-y-4">
            <h2 id="council-debate" className="text-xl font-semibold tracking-tight">The debate</h2>
            <div className="grid gap-6 lg:grid-cols-3">
              {session.arguments.map((a, i) => (
                <motion.div key={a.seat} className="min-w-0" {...enter(i + 1)}>
                  <AdvocateCard arg={a} finalScore={finalScores?.[a.seat] ?? a.score} rebuttal={session.rebuttals.find((r) => r.from === a.seat)} />
                </motion.div>
              ))}
            </div>
          </section>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="size-4" aria-hidden />
            {`Logged as ${session.ledgerEntryIds.length} entries in the agent run ledger: one per seat and one for the judge.`}
          </p>
        </div>
      )}

      <PastRulings overview={o} currentId={session?.id} onPick={(id) => void pick(id)} loadingId={loadingId} />
    </div>
  );
}
