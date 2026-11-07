"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { toast } from "sonner";
import { Clock, Keyboard, Mic, MicOff, PhoneOff, Send } from "lucide-react";
import type { InterviewFeedback } from "@/lib/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { DemoDataNote, ErrorState, PageHeader, SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getClientUserId } from "@/lib/voice/clientUser";
import { ROLE_NAMES, roleName } from "@/lib/voice/roles";
import { nextQuestion } from "@/lib/voice/textInterview";
import demoFeedback from "@/data/fixtures/interview.feedback.aisha.json";
import { InterviewOrb, type OrbState } from "./InterviewOrb";
import { LiveCaptions, type CaptionLine } from "./LiveCaptions";
import { PreCallCard } from "./PreCallCard";
import { FeedbackCard, averageScore } from "./FeedbackCard";

// ---------- constants ----------
export const MAX_SEC = 360;
export const TOTAL_QUESTIONS = 5;
const CLOSING_RE = /end of your practice interview/i;
const CLOSING_GRACE_MS = 8000;
/** ElevenLabs signed URLs last ~15 minutes; past this age we don't trust a cached one. */
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;
const ROLES = Object.entries(ROLE_NAMES).map(([id, name]) => ({ id, name }));
const DEFAULT_ROLE_ID = "ml-engineer";

export interface InterviewConfig {
  agentId: string;
  signedUrl?: string;
  dynamicVariables: Record<string, string>;
}

type Phase = "precall" | "call" | "scoring" | "feedback" | "scoreError";
type Mode = "voice" | "text";
type FeedbackReq = { userId: string; roleId: string; transcript: string; durationSec: number };

// ---------- helpers ----------
function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fallbackVars(userId: string, roleId: string): Record<string, string> {
  return { name: titleCase(userId || "there"), role: roleName(roleId) };
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function toTranscript(lines: CaptionLine[]): string {
  return lines.map((l) => `${l.role}: ${l.text}`).join("\n");
}

function configUrl(userId: string, roleId: string): string {
  return `/api/interview/config?userId=${encodeURIComponent(userId)}&roleId=${encodeURIComponent(roleId)}`;
}

/**
 * Which question the candidate is on, 1..TOTAL_QUESTIONS.
 * Text mode: every interviewer line is a scripted question.
 * Voice mode: the agent can speak twice in a row (e.g. "Are you still there?"), so only interviewer
 * turns that open the call or follow an answer count, and the closing line pins the counter to the last question.
 */
export function questionNumber(lines: CaptionLine[], voice: boolean): number {
  let n = 0;
  lines.forEach((l, i) => {
    if (l.role !== "ai") return;
    if (!voice || i === 0 || lines[i - 1].role === "user") n += 1;
    if (voice && CLOSING_RE.test(l.text)) n = TOTAL_QUESTIONS;
  });
  return Math.min(TOTAL_QUESTIONS, Math.max(1, n));
}

/** Last-resort interviewer if the server action can't be reached (keeps the demo alive offline). */
function localQuestion(history: CaptionLine[], vars: Record<string, string>): { text: string; done: boolean } {
  const asked = history.filter((h) => h.role === "ai").length;
  const name = vars.name || "there";
  const role = vars.role || "this";
  const qs = [
    `Hi ${name}, thanks for joining. This is a five-minute practice interview for the ${role} role. Ready? Tell me a little about yourself and what got you into computing.`,
    vars.top_skills
      ? `You list ${vars.top_skills} as strengths. Pick one and tell me about a time you used it to solve a real problem.`
      : "Tell me about a technical skill you're proud of and a time you used it to solve a real problem.",
    vars.project_title
      ? `Tell me about your team project, "${vars.project_title}". What did you personally do, and what was one challenge?`
      : "Tell me about a team project. What did you personally do, and what was one challenge?",
    vars.gaps
      ? `You're building up ${vars.gaps}. How are you learning it, and how do you know it's working?`
      : "Which skill are you building right now, and how are you learning it?",
    "Tell me about a time a teammate gave you feedback. What did you do with it?",
  ];
  if (asked < qs.length) return { text: qs[asked], done: false };
  return { text: "Thank you, that was great. That's the end of your practice interview. Your feedback is on screen.", done: true };
}

function canSpeakAloud(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** A known role passed as `?roleId=` in the page URL, if any. */
function urlRoleId(): string | null {
  try {
    const r = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("roleId");
    return r && ROLE_NAMES[r] ? r : null;
  } catch {
    return null; // no URL access: keep the default role
  }
}

const subscribeNever = () => () => {};
/** False on the server and during hydration, true afterwards, so client-only values never cause a hydration mismatch. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

// ---------- component ----------
export function InterviewClient() {
  return (
    <ConversationProvider>
      <InterviewFlow />
    </ConversationProvider>
  );
}

export default InterviewClient;

function InterviewFlow() {
  const answerId = useId();
  const speakId = useId();
  // The user (cookie) and a ?roleId= preselection are read once on the client, and only used once
  // hydration is done, so the server HTML (demo user, default role) still matches.
  const hydrated = useHydrated();
  const [clientUid] = useState(getClientUserId);
  const [pickedRoleId, setRoleId] = useState(() => urlRoleId() ?? DEFAULT_ROLE_ID);
  const uid = hydrated ? clientUid : null;
  const roleId = hydrated ? pickedRoleId : DEFAULT_ROLE_ID;
  const [config, setConfig] = useState<InterviewConfig | null>(null);
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configNonce, setConfigNonce] = useState(0);

  const [phase, setPhaseState] = useState<Phase>("precall");
  const [mode, setModeState] = useState<Mode>("text");
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [draft, setDraft] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [speakAloud, setSpeakAloud] = useState(true);
  const [starting, setStarting] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [usedDemo, setUsedDemo] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  // Refs mirror state that async callbacks (SDK events, timers, server actions) need to read fresh.
  const phaseRef = useRef<Phase>("precall");
  const modeRef = useRef<Mode>("text");
  const linesRef = useRef<CaptionLine[]>([]);
  const startedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReqRef = useRef<FeedbackReq | null>(null);
  const configAtRef = useRef(0);
  const speakAloudRef = useRef(true);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const setAllLines = (next: CaptionLine[]) => {
    linesRef.current = next;
    setLines(next);
  };
  const append = (line: CaptionLine) => setAllLines([...linesRef.current, line]);

  const effectiveUid = uid ?? "aisha";
  const vars = config?.dynamicVariables ?? fallbackVars(effectiveUid, roleId);
  const varsRef = useRef(vars);

  // ---------- config ----------
  // configStatus is already "loading" whenever this refetches: it starts that way, and the role picker
  // and Retry set it together with the dependency they change.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    apiGet<InterviewConfig>(configUrl(uid, roleId))
      .then((c) => {
        if (!alive) return;
        configAtRef.current = Date.now();
        setConfig(c);
        setConfigStatus("ready");
      })
      .catch(() => {
        if (!alive) return;
        setConfig(null);
        setConfigStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [uid, roleId, configNonce]);

  // ---------- speech (text mode) ----------
  function cancelSpeech() {
    if (canSpeakAloud()) window.speechSynthesis.cancel();
    setTtsSpeaking(false);
  }

  function speak(text: string) {
    if (!speakAloudRef.current || !canSpeakAloud()) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.onstart = () => setTtsSpeaking(true);
      u.onend = () => setTtsSpeaking(false);
      u.onerror = () => setTtsSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      setTtsSpeaking(false);
    }
  }

  // ---------- call lifecycle ----------
  function beginCall(m: Mode) {
    finishingRef.current = false;
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = null;
    setAllLines([]);
    setDraft("");
    setFeedback(null);
    setUsedDemo(false);
    setMicDenied(false);
    const t = Date.now();
    startedAtRef.current = t;
    setStartedAt(t);
    setNow(t);
    setMode(m);
    setPhase("call");
  }

  async function askNext(history: CaptionLine[]) {
    setAiThinking(true);
    let res: { text: string; done: boolean };
    try {
      res = await nextQuestion(history, varsRef.current);
      if (!res || typeof res.text !== "string" || !res.text.trim()) res = localQuestion(history, varsRef.current);
    } catch {
      res = localQuestion(history, varsRef.current);
    }
    setAiThinking(false);
    if (phaseRef.current !== "call" || modeRef.current !== "text" || finishingRef.current) return;
    append({ role: "ai", text: res.text });
    speak(res.text);
    if (res.done) void finish("natural");
  }

  function startText() {
    beginCall("text");
    void askNext([]);
  }

  async function startVoice() {
    const cached = config;
    if (!cached?.signedUrl) {
      // The server has no voice setup: the page runs in text mode.
      startText();
      return;
    }
    setMicDenied(false);
    setStarting(true);
    // Signed URLs expire (~15 min), so every start (including "Practise again") asks for a fresh one,
    // in parallel with the mic prompt.
    const freshP = apiGet<InterviewConfig>(configUrl(effectiveUid, roleId)).catch(() => null);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("no mic");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      setStarting(false);
      setMicDenied(true);
      return;
    }
    const fresh = await freshP;
    if (fresh) {
      configAtRef.current = Date.now();
      setConfig(fresh);
      if (fresh.dynamicVariables) varsRef.current = fresh.dynamicVariables;
    }
    const signedUrl = fresh
      ? fresh.signedUrl
      : Date.now() - configAtRef.current < SIGNED_URL_TTL_MS
        ? cached.signedUrl
        : undefined;
    if (!signedUrl) {
      setStarting(false);
      toast.info("Voice isn't available right now, so you'll type your answers.");
      startText();
      return;
    }
    beginCall("voice");
    setStarting(false);
    try {
      const r = convRef.current.startSession({
        signedUrl,
        connectionType: "websocket",
        dynamicVariables: varsRef.current,
      }) as unknown;
      if (r && typeof (r as Promise<unknown>).then === "function") {
        (r as Promise<unknown>).catch(() => voiceDropped());
      }
    } catch {
      voiceDropped();
    }
  }

  function switchToText() {
    if (phaseRef.current !== "call" || modeRef.current !== "voice") return;
    setMode("text");
    try {
      convRef.current.endSession();
    } catch {
      /* already closed */
    }
    const h = linesRef.current;
    if (h.length === 0 || h[h.length - 1].role === "user") void askNext(h);
  }

  async function submitFeedback(req: FeedbackReq) {
    setPhase("scoring");
    try {
      const fb = await apiPost<InterviewFeedback>("/api/interview/feedback", req);
      setFeedback(fb);
      setUsedDemo(false);
      setPhase("feedback");
      if (averageScore(fb) >= 3.5) toast.success("🎤 Interview-ready unlocked!");
    } catch {
      setPhase("scoreError");
    }
  }

  function resetToPrecall() {
    cancelSpeech();
    finishingRef.current = false;
    setAllLines([]);
    setDraft("");
    setAiThinking(false);
    setFeedback(null);
    setUsedDemo(false);
    setMode("text");
    setPhase("precall");
  }

  async function finish(reason: "user" | "natural") {
    if (finishingRef.current || phaseRef.current !== "call") return;
    finishingRef.current = true;
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = null;
    if (modeRef.current === "voice") {
      try {
        convRef.current.endSession();
      } catch {
        /* already closed */
      }
    }
    if (reason === "user") cancelSpeech();
    const transcriptLines = linesRef.current;
    if (!transcriptLines.some((l) => l.role === "user")) {
      toast.info("You ended before answering, so there's nothing to score yet. Try again when you're ready.");
      resetToPrecall();
      return;
    }
    const req: FeedbackReq = {
      userId: effectiveUid,
      roleId,
      transcript: toTranscript(transcriptLines),
      durationSec: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
    };
    lastReqRef.current = req;
    await submitFeedback(req);
  }

  function toggleMute() {
    const c = convRef.current;
    // The SDK throws until the session exists, so mute only once we're connected.
    if (c.status !== "connected") return;
    try {
      c.setMuted(!c.isMuted);
    } catch {
      /* session not ready or already closed */
    }
  }

  function voiceDropped() {
    if (phaseRef.current !== "call" || modeRef.current !== "voice" || finishingRef.current) return;
    toast.error("Voice connection dropped. Switching to text mode.");
    switchToText();
  }

  // ---------- voice SDK events ----------
  function onVoiceMessage(m: { message: string; source?: string; role?: string }) {
    if (phaseRef.current !== "call" || modeRef.current !== "voice" || finishingRef.current) return;
    const text = (m.message ?? "").trim();
    if (!text) return;
    const isAi = m.role ? m.role === "agent" : m.source === "ai";
    append({ role: isAi ? "ai" : "user", text });
    if (isAi && CLOSING_RE.test(text) && !closingTimerRef.current) {
      // The agent ends the call itself; this is a safety net in case it doesn't.
      // (finish reads live state through refs, so calling it from this closure later is safe.)
      closingTimerRef.current = setTimeout(() => void finish("natural"), CLOSING_GRACE_MS);
    }
  }

  function onVoiceDisconnect(d: { reason?: string } | undefined) {
    if (phaseRef.current !== "call" || modeRef.current !== "voice" || finishingRef.current) return;
    if (d?.reason === "agent") void finish("natural");
    else if (d?.reason === "error") voiceDropped();
  }

  // The SDK always invokes the latest version of these callbacks, so they never see stale state.
  // (Called below the handlers on purpose: the React Compiler misreads hoisted functions used in hook arguments.)
  const conv = useConversation({
    onMessage: (m) => onVoiceMessage(m),
    onError: () => voiceDropped(),
    onDisconnect: (d) => onVoiceDisconnect(d),
  });
  const convRef = useRef(conv);

  // Keep the "latest value" refs current after every render, before any later event can read them.
  useLayoutEffect(() => {
    varsRef.current = vars;
    convRef.current = conv;
  });

  // ---------- countdown ----------
  const finishOnTimeUp = useEffectEvent(() => {
    void finish("natural");
  });
  useEffect(() => {
    if (phase !== "call") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - startedAtRef.current >= MAX_SEC * 1000) finishOnTimeUp();
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ---------- Space toggles mute (voice only, never while a control has focus) ----------
  const toggleMuteFromKey = useEffectEvent(() => toggleMute());
  useEffect(() => {
    if (phase !== "call" || mode !== "voice") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("button, a, input, textarea, select, [contenteditable='true'], [role='log']")) return;
      e.preventDefault();
      toggleMuteFromKey();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, mode]);

  // Move focus to the result so keyboard and screen-reader users land on it (the End button is gone by now).
  useEffect(() => {
    if (phase === "feedback") feedbackRef.current?.focus();
  }, [phase]);

  // Focus the answer box when text mode begins.
  useEffect(() => {
    if (phase === "call" && mode === "text") document.getElementById(answerId)?.focus();
  }, [phase, mode, answerId]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      if (canSpeakAloud()) window.speechSynthesis.cancel();
      if (phaseRef.current === "call" && modeRef.current === "voice") {
        try {
          convRef.current.endSession();
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  // ---------- text answers ----------
  function submitAnswer(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || aiThinking || phaseRef.current !== "call") return;
    cancelSpeech();
    const history = [...linesRef.current, { role: "user" as const, text }];
    setAllLines(history);
    setDraft("");
    void askNext(history);
  }

  function onAnswerKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submitAnswer();
    }
  }

  // ---------- derived view state ----------
  const voice = mode === "voice";
  let orb: OrbState;
  let statusText: string;
  if (voice) {
    if (conv.status !== "connected") {
      orb = "connecting";
      statusText = "Connecting to your interviewer…";
    } else if (conv.isSpeaking) {
      orb = "agent";
      statusText = "Your interviewer is speaking.";
    } else if (conv.isMuted) {
      orb = "idle";
      statusText = "You're muted. Press Space or Mute to talk again.";
    } else {
      orb = "user";
      statusText = "Your turn. Your interviewer is listening.";
    }
  } else if (aiThinking) {
    orb = "connecting";
    statusText = lines.length === 0 ? "Connecting to your interviewer…" : "Your interviewer is thinking…";
  } else if (ttsSpeaking) {
    orb = "agent";
    statusText = "Your interviewer is asking a question.";
  } else if (draft.trim()) {
    orb = "user";
    statusText = "Your turn. Send your answer when you're ready.";
  } else {
    orb = "idle";
    statusText = "Your turn. Type your answer below.";
  }

  const questionN = questionNumber(lines, voice);
  const remaining = MAX_SEC - Math.floor((now - startedAt) / 1000);
  const displayName = vars.name || titleCase(effectiveUid);
  const showSpeakToggle = phase === "call" && !voice && canSpeakAloud();
  const connected = conv.status === "connected";
  const announcement =
    phase === "call"
      ? statusText
      : phase === "scoring"
        ? "Scoring your answers…"
        : phase === "feedback"
          ? "Your feedback is ready."
          : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Practise your interview"
        subtitle={`5 minutes · voice · tailored to your ${roleName(roleId)} roadmap and pod project`}
      />
      {/* One persistent live region, so call status, scoring and "feedback ready" are all announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {phase === "precall" && (
        <>
          {configStatus === "error" && (
            <ErrorState
              title="We couldn't load your interview setup"
              body="Check your connection and retry, or practise in text mode with demo details."
              onRetry={() => {
                setConfigStatus("loading");
                setConfigNonce((n) => n + 1);
              }}
              onUseDemo={() => {
                setConfig({ agentId: "text-mode", dynamicVariables: fallbackVars(effectiveUid, roleId) });
                setConfigStatus("ready");
              }}
            />
          )}
          <PreCallCard
            roles={ROLES}
            roleId={roleId}
            onRoleChange={(r) => {
              // Drop the old role's config so nothing starts with stale questions while the new one loads.
              setConfig(null);
              setConfigStatus("loading");
              setRoleId(r);
              setMicDenied(false);
            }}
            onStart={() => void startVoice()}
            onUseTextMode={startText}
            loading={configStatus === "loading"}
            starting={starting}
            voiceAvailable={configStatus !== "ready" || Boolean(config?.signedUrl)}
            micDenied={micDenied}
            onMicDenied={() => setMicDenied(true)}
            topSkills={config?.dynamicVariables?.top_skills}
            projectTitle={config?.dynamicVariables?.project_title}
          />
        </>
      )}

      {phase === "call" && (
        <SectionCard
          title="Your practice interview"
          description={
            voice
              ? "Voice mode · speak naturally, there's no rush."
              : "Text mode · type your answers, there's no rush."
          }
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex w-full flex-wrap items-end justify-between gap-4">
              <p className="text-foreground">
                <span className="text-4xl font-semibold tabular-nums">Question {questionN}</span>{" "}
                <span className="text-xl text-muted-foreground">of {TOTAL_QUESTIONS}</span>
              </p>
              <p className="flex items-center gap-2 text-foreground">
                <Clock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <span className="text-4xl font-semibold tabular-nums">{formatClock(remaining)}</span>
                <span className="text-muted-foreground">remaining</span>
              </p>
            </div>

            <InterviewOrb state={orb} />
            <p aria-hidden="true" className="text-center text-muted-foreground">
              {statusText}
            </p>

            <LiveCaptions lines={lines} thinking={!voice && aiThinking && lines.length > 0} />

            {!voice && (
              <form onSubmit={submitAnswer} className="flex w-full flex-col gap-2">
                <Label htmlFor={answerId} className="font-medium text-foreground">
                  Your answer
                </Label>
                <Textarea
                  id={answerId}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onAnswerKeyDown}
                  rows={4}
                  aria-describedby={`${answerId}-hint`}
                  placeholder="Take your time. Situation, what you did, and the result works well."
                  className="min-h-28 rounded-xl border bg-card p-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p id={`${answerId}-hint`} className="text-sm text-muted-foreground">
                    Press Enter to send, Shift + Enter for a new line.
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    {showSpeakToggle && (
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          id={speakId}
                          type="checkbox"
                          checked={speakAloud}
                          onChange={(e) => {
                            speakAloudRef.current = e.target.checked;
                            setSpeakAloud(e.target.checked);
                            if (!e.target.checked) cancelSpeech();
                          }}
                          className="h-4 w-4 rounded focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <label htmlFor={speakId}>Read questions aloud</label>
                      </span>
                    )}
                    <Button type="submit" disabled={!draft.trim() || aiThinking} className="rounded-xl">
                      <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                      Send answer
                    </Button>
                  </div>
                </div>
              </form>
            )}

            <div className="flex flex-wrap justify-center gap-3">
              {voice && (
                <>
                  <Button
                    variant="outline"
                    aria-pressed={conv.isMuted}
                    onClick={toggleMute}
                    disabled={!connected}
                    className="rounded-xl"
                  >
                    {conv.isMuted ? (
                      <MicOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Mic className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Mute
                  </Button>
                  <Button variant="ghost" onClick={switchToText} className="rounded-xl">
                    <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" />
                    Switch to typing
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                onClick={() => void finish("user")}
                className="rounded-xl border-status-gap text-status-gap hover:bg-status-gap/10"
              >
                <PhoneOff className="mr-2 h-4 w-4" aria-hidden="true" />
                End interview
              </Button>
            </div>
            {voice && connected && <p className="text-sm text-muted-foreground">Tip: press Space to mute or unmute.</p>}
          </div>
        </SectionCard>
      )}

      {phase === "scoring" && (
        <SectionCard title="Your feedback">
          <div className="flex flex-col gap-4">
            <p className="text-foreground">Scoring your answers…</p>
            {["Content", "Structure", "Clarity", "Confidence"].map((k) => (
              <div key={k} className="flex flex-col gap-2" aria-hidden="true">
                <div className="h-4 w-32 rounded bg-primary/10 motion-safe:animate-pulse" />
                <div className="h-3 w-full rounded-full bg-primary/10 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {phase === "scoreError" && (
        <ErrorState
          title="We couldn't score your answers"
          body="Your transcript is safe. Try again, or see example feedback from demo data."
          onRetry={() => lastReqRef.current && void submitFeedback(lastReqRef.current)}
          onUseDemo={() => {
            setFeedback(demoFeedback as InterviewFeedback);
            setUsedDemo(true);
            setPhase("feedback");
          }}
        />
      )}

      {phase === "feedback" && feedback && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role="region"
          aria-label="Your feedback"
          className="flex flex-col gap-2 rounded-2xl outline-none"
        >
          {usedDemo && <DemoDataNote />}
          <FeedbackCard
            feedback={feedback}
            name={displayName}
            userId={effectiveUid}
            onPractiseAgain={resetToPrecall}
          />
        </div>
      )}
    </div>
  );
}
