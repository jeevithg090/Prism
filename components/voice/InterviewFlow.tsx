"use client";
// /interview: pre-call → in-call → post-call. With ElevenLabs keys the call is a live voice conversation over the
// signed WebSocket URL; without them it's Practice mode (speechSynthesis questions, speech recognition or typing).
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, Keyboard, Loader2, Mic, MicOff, Sparkles, Square, Volume2 } from "lucide-react";
import { ErrorState, SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useViewerId } from "@/components/community/useViewerId";
import { apiGet, apiPost } from "@/lib/fetcher";
import {
  estimateDurationSec, formatTranscript, practiceQuestions, PRACTICE_QUESTION_COUNT, sampleAnswers, type TranscriptTurn,
} from "@/lib/voice/questions";
import type { InterviewConfig, InterviewResult } from "@/lib/voice/schemas";
import demoFeedback from "@/data/fixtures/interview.feedback.aisha.json";
import { startConversation, type ConversationHandle } from "./elevenlabsConversation";
import { average, FeedbackCard, type FeedbackView } from "./FeedbackCard";
import { InterviewOrb, type OrbState } from "./InterviewOrb";
import { LiveCaptions } from "./LiveCaptions";
import { PreCallCard } from "./PreCallCard";
import { canSpeak, listen, speak, speechRecognitionCtor, stopSpeaking } from "./speech";

/** Aisha's interview context, for "Use demo data" when the config can't load. */
export const DEMO_VARS: Record<string, string> = {
  user_id: "aisha", name: "Aisha", year: "1", role: "ML engineer", role_id: "ml-engineer",
  role_top_skills: "Python (62% of ads), Machine learning (55% of ads), Docker (41% of ads)",
  top_skills: "Python, Git", gaps: "Docker, PyTorch, SQL", week_number: "1", week_focus: "Docker",
  pod_name: "Pod Orbit", project_title: "VisionAid: accessible image captioning API",
  pr_title: "Containerise the captioning API with Docker", pr_skill: "Docker", pr_skill_id: "docker",
  pr_status: "in progress", reviewer: "Priya",
};

type Phase = "pre" | "connecting" | "call" | "scoring" | "post" | "score-error";
type FeedbackBody = { userId: string; roleId: string; transcript: string; durationSec: number; skillId?: string };

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function PreCallSkeleton() {
  return (
    <div className="rounded-2xl border bg-card shadow-sm" aria-busy="true" aria-label="Loading your interview">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between md:px-8 md:pt-8">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-10 w-full rounded-lg sm:w-64" />
      </div>
      <div className="px-6 pb-6 md:px-8 md:pb-8">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="mt-6 h-11 w-full rounded-xl sm:w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-8 grid gap-5 md:grid-cols-2 md:gap-x-8"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      </div>
    </div>
  );
}

function ScoringSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8" aria-busy="true">
      <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Loader2 className="size-5 text-muted-foreground motion-safe:animate-spin" aria-hidden />Scoring your answers…
      </p>
      <div className="mt-6 grid grid-cols-2 gap-6 border-t pt-6"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      <div className="mt-6 space-y-5 border-t pt-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[11rem_minmax(0,1fr)] items-center gap-4"><Skeleton className="h-5" /><Skeleton className="h-2.5" /></div>
        ))}
      </div>
    </div>
  );
}

function ProofAside({ vars, explained }: { vars: Record<string, string>; explained: boolean }) {
  const merged = vars.pr_status === "merged";
  const rows = [
    { done: merged, label: "Built it", body: merged ? `Merged "${vars.pr_title}"${vars.reviewer ? `, reviewed by ${vars.reviewer}` : ""}.` : `Your PR for "${vars.pr_title}" is in progress.` },
    { done: explained, label: "Explained it", body: explained ? "This interview is saved as keystone-interview evidence." : `Explain your ${vars.pr_skill ?? "pod"} work out loud in this interview.` },
  ];
  return (
    <SectionCard title="Why this counts as proof" description={`${vars.pr_skill ?? "Your skill"} on your Proof Ladder`}>
      <ol>
        {rows.map((r) => (
          <li key={r.label} className="flex gap-3 border-t py-4 first:border-t-0 first:pt-0">
            {r.done
              ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
              : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
            <div>
              <p className="font-medium text-foreground">{r.label} <span className="sr-only">{r.done ? "(done)" : "(not yet)"}</span></p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="border-t pt-4 text-sm text-pretty text-muted-foreground">Keystone doesn&apos;t grade you for credit. You choose when to practise, and the feedback is yours.</p>
    </SectionCard>
  );
}

export function InterviewFlow({ initialRoleId = "ml-engineer", forceDemo = false }: { initialRoleId?: string; forceDemo?: boolean }) {
  const userId = useViewerId();
  const reduce = useReducedMotion();
  const [roleId, setRoleId] = React.useState(initialRoleId);
  const [useDemo, setUseDemo] = React.useState(false);
  const config = useQuery({
    queryKey: ["interview-config", userId, roleId],
    queryFn: () => apiGet<InterviewConfig>(`/api/interview/config?userId=${encodeURIComponent(userId)}&roleId=${encodeURIComponent(roleId)}`),
    enabled: !useDemo,
  });
  const vars = React.useMemo(
    () => (useDemo || !config.data ? DEMO_VARS : config.data.dynamicVariables),
    [useDemo, config.data],
  );
  const isDemo = useDemo || forceDemo || vars.user_id === "aisha";
  const [forcePractice, setForcePractice] = React.useState(false);
  const mode: "voice" | "practice" = !useDemo && config.data?.signedUrl && !forcePractice ? "voice" : "practice";

  const questions = React.useMemo(() => practiceQuestions(vars), [vars]);
  const samples = React.useMemo(() => sampleAnswers(vars), [vars]);

  const [phase, setPhase] = React.useState<Phase>("pre");
  const [turns, setTurns] = React.useState<TranscriptTurn[]>([]);
  const turnsRef = React.useRef<TranscriptTurn[]>([]);
  const pushTurn = React.useCallback((t: TranscriptTurn) => { turnsRef.current = [...turnsRef.current, t]; setTurns(turnsRef.current); }, []);
  const [qIndex, setQIndex] = React.useState(0);
  const [answer, setAnswer] = React.useState("");
  const [interim, setInterim] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [micError, setMicError] = React.useState<string | null>(null);
  const stopListen = React.useRef<(() => void) | null>(null);
  const answerBase = React.useRef("");
  const startedAt = React.useRef(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [agentSpeaking, setAgentSpeaking] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const conv = React.useRef<ConversationHandle | null>(null);
  const [result, setResult] = React.useState<{ view: FeedbackView; demo: boolean } | null>(null);
  const lastBody = React.useRef<FeedbackBody | null>(null);
  const finishing = React.useRef(false);

  React.useEffect(() => {
    if (phase !== "call" && phase !== "connecting") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);
  React.useEffect(() => () => { stopListen.current?.(); stopSpeaking(); conv.current?.end(); }, []);

  const feedback = useMutation({
    mutationFn: (body: FeedbackBody) => apiPost<InterviewResult>("/api/interview/feedback", body),
    onSuccess: (r) => {
      setResult({ view: r, demo: false });
      setPhase("post");
      const proof = r.evidence.map((e) => e.label).join(", ");
      if (proof) toast.success(`Saved as proof: ${proof}`, { description: "It's on your Proof Ladder now." });
      if (average(r.scores) >= 3.5) toast.success("Interview-ready badge earned", { description: `Average ${average(r.scores).toFixed(1)} of 5.` });
    },
    onError: () => setPhase("score-error"),
  });

  const finish = React.useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    stopListen.current?.();
    stopSpeaking();
    conv.current?.end();
    conv.current = null;
    const all = turnsRef.current;
    if (!all.some((t) => t.speaker === "user")) {
      finishing.current = false;
      setPhase("pre");
      toast("Interview ended", { description: "Answer at least one question to get feedback." });
      return;
    }
    const elapsedSec = Math.round((Date.now() - startedAt.current) / 1000);
    const body: FeedbackBody = {
      userId, roleId, transcript: formatTranscript(all),
      durationSec: Math.max(elapsedSec, estimateDurationSec(all)),
      ...(vars.pr_skill_id ? { skillId: vars.pr_skill_id } : {}),
    };
    lastBody.current = body;
    setPhase("scoring");
    feedback.mutate(body);
  }, [feedback, roleId, userId, vars.pr_skill_id]);

  const reset = () => {
    stopListen.current?.(); stopSpeaking(); conv.current?.end(); conv.current = null;
    turnsRef.current = []; setTurns([]); setQIndex(0); setAnswer(""); setInterim(""); setListening(false);
    setMicError(null); setElapsed(0); setResult(null); setMuted(false); finishing.current = false; setPhase("pre");
  };

  const startPractice = () => {
    turnsRef.current = []; finishing.current = false;
    startedAt.current = Date.now();
    setQIndex(0); setAnswer(""); setPhase("call");
    pushTurn({ speaker: "ai", text: questions[0] });
    void speak(questions[0]);
  };

  const startVoice = async () => {
    setPhase("connecting");
    turnsRef.current = []; finishing.current = false;
    startedAt.current = Date.now();
    try {
      const fresh = (await config.refetch()).data;
      if (!fresh?.signedUrl) throw new Error("no signed url");
      conv.current = await startConversation({
        signedUrl: fresh.signedUrl,
        dynamicVariables: fresh.dynamicVariables,
        onStatus: (s) => {
          if (s === "connected") setPhase("call");
          if (s === "ended") finish();
        },
        onMessage: (m) => pushTurn({ speaker: m.source, text: m.text }),
        onSpeaking: setAgentSpeaking,
        onError: () => {
          toast.error("Voice connection dropped. Switching to Practice mode.");
          conv.current = null;
          setForcePractice(true);
          if (turnsRef.current.some((t) => t.speaker === "user")) finish(); else setPhase("pre");
        },
      });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setMicError(denied ? "We couldn't access your microphone. Practice mode lets you type your answers." : null);
      toast.error(denied ? "We couldn't access your microphone." : "We couldn't reach the voice interviewer.", { description: "Practice mode is ready instead." });
      setForcePractice(true);
      setPhase("pre");
    }
  };

  const start = () => (mode === "voice" ? void startVoice() : startPractice());

  const commitAndNext = () => {
    stopListen.current?.(); setListening(false); setInterim("");
    const text = answer.trim();
    if (text) pushTurn({ speaker: "user", text });
    setAnswer(""); answerBase.current = "";
    if (qIndex + 1 >= PRACTICE_QUESTION_COUNT) { finish(); return; }
    const q = questions[qIndex + 1];
    setQIndex(qIndex + 1);
    pushTurn({ speaker: "ai", text: q });
    void speak(q);
  };

  const toggleRecord = () => {
    if (listening) { stopListen.current?.(); setListening(false); setInterim(""); return; }
    stopSpeaking();
    setMicError(null);
    answerBase.current = answer.trim() ? `${answer.trim()} ` : "";
    const stop = listen(
      (finalText, int) => { setAnswer(`${answerBase.current}${finalText}`.trimStart()); setInterim(int); },
      (code) => {
        setMicError(code === "not-allowed" || code === "service-not-allowed"
          ? "We couldn't access your microphone. Type your answer instead."
          : "We couldn't hear that. Try again, or type your answer.");
        setListening(false);
      },
      () => { setListening(false); setInterim(""); },
    );
    stopListen.current = stop;
    setListening(!!stop);
  };

  React.useEffect(() => {
    if (phase !== "call" || mode !== "voice") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== "Space" || el?.closest("input, textarea, select, button, a, [contenteditable]")) return;
      e.preventDefault();
      setMuted((m) => { conv.current?.setMuted(!m); return !m; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, mode]);

  // ---------- render ----------
  const recognitionAvailable = typeof window !== "undefined" && !!speechRecognitionCtor();
  const currentQuestion = mode === "voice"
    ? [...turns].reverse().find((t) => t.speaker === "ai")?.text ?? "Your interviewer is about to start."
    : questions[qIndex];
  const orb: OrbState = phase === "connecting" ? "connecting" : mode === "voice" ? (agentSpeaking ? "agent" : muted ? "idle" : "user") : listening ? "user" : "idle";
  const status = phase === "connecting" ? "Connecting to your interviewer…"
    : phase === "call" ? (mode === "voice" ? (agentSpeaking ? "Interviewer speaking" : muted ? "You're muted" : "Listening") : `Question ${qIndex + 1} of ${PRACTICE_QUESTION_COUNT}`)
    : phase === "scoring" ? "Scoring your answers…" : "";

  let main: React.ReactNode;
  if (!useDemo && config.isPending) main = <PreCallSkeleton />;
  else if (!useDemo && config.isError) {
    main = (
      <ErrorState
        title="We couldn't load your interview"
        body="That's on us, not you. Try again, or practise with Aisha's demo data."
        onRetry={() => void config.refetch()}
        onUseDemo={() => setUseDemo(true)}
      />
    );
  } else if (phase === "pre") {
    main = (
      <div className="space-y-4">
        {micError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-status-gap/35 bg-card px-4 py-3 text-sm text-foreground shadow-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-gap" aria-hidden />{micError}
          </p>
        )}
        <PreCallCard vars={vars} roleId={roleId} onRoleChange={(r) => { setRoleId(r); setForcePractice(false); }} onStart={start} mode={mode} isDemo={isDemo} />
      </div>
    );
  } else if (phase === "connecting" || phase === "call") {
    main = (
      <section aria-labelledby="call-title" className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-4 text-sm md:px-8">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-medium text-foreground">
            {phase !== "call"
              ? <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" aria-hidden />
              : mode === "voice"
                ? <Mic className="size-4 text-status-proven" aria-hidden />
                : <Keyboard className="size-4 text-muted-foreground" aria-hidden />}
            {phase === "call" ? (mode === "voice" ? "Live" : "Practice mode") : "Connecting"}
          </span>
          {mode === "practice" && phase === "call" && <span className="font-medium text-muted-foreground">Question {qIndex + 1} of {PRACTICE_QUESTION_COUNT}</span>}
          <span className="ml-auto font-mono text-lg text-foreground tabular-nums" aria-label={`Elapsed ${mmss(elapsed)}`}>{mmss(elapsed)}</span>
        </div>

        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:gap-8 md:p-8">
          <InterviewOrb state={orb} progress={mode === "practice" ? { at: qIndex + 1, of: PRACTICE_QUESTION_COUNT } : undefined} className="mx-auto md:mx-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <h2 id="call-title" className="max-w-[34ch] text-2xl font-semibold text-pretty text-foreground md:text-3xl">
              {phase === "connecting" ? "Connecting to your interviewer…" : currentQuestion}
            </h2>
            {mode === "practice" && phase === "call" && canSpeak() && (
              <Button variant="ghost" className="-ml-3.5" onClick={() => void speak(currentQuestion)}>
                <Volume2 className="size-4" aria-hidden /> Read the question again
              </Button>
            )}
          </div>
        </div>

        {mode === "practice" && phase === "call" && (
          <div className="space-y-3 border-t p-6 md:p-8">
            <div className="flex items-end justify-between gap-3">
              <Label htmlFor="answer">Your answer</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{answer.trim() ? answer.trim().split(/\s+/).length : 0} words</span>
            </div>
            <Textarea
              id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} className="md:text-base"
              placeholder={recognitionAvailable ? "Press Record and talk, or type here." : "Type your answer here."}
            />
            {micError && <p role="alert" className="text-sm text-status-gap">{micError}</p>}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
              {recognitionAvailable && (
                <Button variant="outline" onClick={toggleRecord} aria-pressed={listening}>
                  {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                  {listening ? "Stop recording" : "Record answer"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setAnswer(samples[qIndex] ?? "")}>
                <Sparkles className="size-4" aria-hidden /> Use sample answer
              </Button>
              <Button className="sm:ml-auto" onClick={commitAndNext} disabled={!answer.trim()}>
                {qIndex + 1 >= PRACTICE_QUESTION_COUNT ? "Finish and get feedback" : "Next question"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4 border-t p-6 md:p-8">
          <LiveCaptions turns={mode === "practice" && turns.at(-1)?.speaker === "ai" ? turns.slice(0, -1) : turns} interim={interim} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {mode === "voice" && phase === "call" && (
              <Button variant="outline" aria-pressed={muted} onClick={() => setMuted((m) => { conv.current?.setMuted(!m); return !m; })}>
                {muted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                {muted ? "Unmute" : "Mute"} <span className="text-muted-foreground">(Space)</span>
              </Button>
            )}
            <Button variant="destructive" onClick={finish}>
              <Square className="size-4" aria-hidden /> End interview
            </Button>
          </div>
        </div>
      </section>
    );
  } else if (phase === "scoring") {
    main = <ScoringSkeleton />;
  } else if (phase === "score-error") {
    main = (
      <ErrorState
        title="We couldn't score your answers"
        body="That's on us, not you. Your transcript is still here, so try again."
        onRetry={() => { if (lastBody.current) { setPhase("scoring"); feedback.mutate(lastBody.current); } }}
        onUseDemo={() => { setResult({ view: demoFeedback as FeedbackView, demo: true }); setPhase("post"); }}
      />
    );
  } else if (result) {
    main = (
      <FeedbackCard feedback={result.view} name={vars.name ?? "there"} isDemo={result.demo || isDemo} onAgain={reset} passportHref={`/profile/${encodeURIComponent(userId)}`} />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <p className="sr-only" aria-live="polite" role="status">{status}</p>
      <motion.div
        key={phase === "connecting" ? "call" : phase}
        initial={reduce || phase === "pre" ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="min-w-0"
      >
        {main}
      </motion.div>
      <aside className="space-y-4 lg:sticky lg:top-[calc(var(--topbar-height)+1.5rem)] lg:z-(--z-sticky) lg:self-start">
        <ProofAside vars={vars} explained={phase === "post" && !!result?.view.evidence?.some((e) => e.label.includes("explained"))} />
        {phase === "post" && result?.view.evidence?.length ? (
          <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />Your passport and badges update from this interview.</p>
        ) : null}
      </aside>
    </div>
  );
}
