"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, Keyboard, Mic, MicOff, ShieldCheck } from "lucide-react";
import { SectionCard, LoadingSkeleton } from "@/components/keystone";
import { Button } from "@/components/ui/button";

export interface RoleOption {
  id: string;
  name: string;
}

export interface PreCallCardProps {
  roles: RoleOption[];
  roleId: string;
  onRoleChange: (roleId: string) => void;
  onStart: () => void;
  onUseTextMode: () => void;
  /** Config is still loading: Start and text mode wait for it, so questions use the right role and project. */
  loading?: boolean;
  /** Start was pressed and we're asking for the mic / connecting. */
  starting?: boolean;
  /** False when the server has no ElevenLabs setup; Start then opens text mode. */
  voiceAvailable: boolean;
  micDenied?: boolean;
  onMicDenied?: () => void;
  /** e.g. "Python, Docker and PyTorch" and the pod project title, from the config's dynamic variables. */
  topSkills?: string;
  projectTitle?: string;
}

type MicCheck = "idle" | "testing" | "good" | "quiet";

const TEST_MS = 3000;

export function PreCallCard(props: PreCallCardProps) {
  const {
    roles,
    roleId,
    onRoleChange,
    onStart,
    onUseTextMode,
    loading = false,
    starting = false,
    voiceAvailable,
    micDenied = false,
    onMicDenied,
    topSkills,
    projectTitle,
  } = props;
  const selectId = useId();
  const [mic, setMic] = useState<MicCheck>("idle");
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  function stopMicTest() {
    if (rafRef.current != null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }

  useEffect(() => stopMicTest, []);

  async function testMic() {
    stopMicTest();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onMicDenied?.();
      return;
    }
    setMic("testing");
    setLevel(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMic("idle");
      onMicDenied?.();
      return;
    }
    streamRef.current = stream;
    const AC: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AC || typeof requestAnimationFrame === "undefined") {
      // No analyser available: getting the stream is proof enough that the mic works.
      stopMicTest();
      setMic("good");
      return;
    }
    try {
      const ctx = new AC();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const started = performance.now();
      let peak = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const d = (data[i] - 128) / 128;
          sum += d * d;
        }
        const lvl = Math.min(1, Math.sqrt(sum / data.length) * 5);
        peak = Math.max(peak, lvl);
        setLevel(lvl);
        if (performance.now() - started < TEST_MS) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          stopMicTest();
          setLevel(0);
          setMic(peak > 0.04 ? "good" : "quiet");
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stopMicTest();
      setMic("good");
    }
  }

  const roleLabel = roles.find((r) => r.id === roleId)?.name ?? roleId;

  return (
    <SectionCard title="Before you start" description={`A friendly AI interviewer will ask you 5 questions for the ${roleLabel} role.`}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={selectId} className="font-medium text-foreground">
              Role
            </label>
            <select
              id={selectId}
              value={roleId}
              onChange={(e) => onRoleChange(e.target.value)}
              disabled={starting}
              className="h-11 rounded-xl border bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-foreground">What to expect</h3>
            <p className="text-muted-foreground">5 questions · about 5 minutes · feedback at the end</p>
            {loading ? (
              <LoadingSkeleton variant="list" />
            ) : (
              (topSkills || projectTitle) && (
                <p className="text-sm text-muted-foreground">
                  {topSkills && <>We&apos;ll ask about {topSkills}</>}
                  {topSkills && projectTitle && " and "}
                  {projectTitle && <>your project &ldquo;{projectTitle}&rdquo;</>}.
                </p>
              )
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-medium text-foreground">Mic check</span>
            <Button variant="outline" onClick={testMic} disabled={mic === "testing" || starting} className="rounded-xl">
              {mic === "testing" ? "Listening… say hello" : "Test microphone"}
            </Button>
            <span role="status" aria-live="polite" className="text-sm">
              {mic === "good" && (
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <CircleCheck className="h-4 w-4 text-status-proven" aria-hidden="true" />
                  Sounds good ✓
                </span>
              )}
              {mic === "quiet" && (
                <span className="text-muted-foreground">We can barely hear you. Check your mic is on, then try again.</span>
              )}
            </span>
          </div>
          {mic === "testing" && (
            <div
              role="meter"
              aria-label="Microphone level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
              className="h-2 w-full overflow-hidden rounded-full bg-primary/10"
            >
              <div className="h-full rounded-full bg-status-proven" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          We don&apos;t store audio, only the transcript, so you can see your feedback.
        </p>

        {micDenied ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-status-gap/40 bg-status-gap/5 p-4">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <MicOff className="h-5 w-5 text-status-gap" aria-hidden="true" />
              We couldn&apos;t access your microphone.
            </p>
            <p className="text-sm text-foreground">
              Allow mic access in your browser and try again, or type your answers instead. Your feedback works the same way.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={onUseTextMode} className="rounded-xl">
                <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" />
                Use text mode
              </Button>
              <Button size="lg" variant="outline" onClick={onStart} className="rounded-xl">
                Try the mic again
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!voiceAvailable && !loading && (
              <p className="text-sm text-muted-foreground">
                Voice isn&apos;t set up right now, so you&apos;ll type your answers. Everything else works the same.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button
                size="lg"
                onClick={onStart}
                disabled={loading || starting}
                aria-busy={loading || starting}
                className="h-12 rounded-xl px-8 text-base"
              >
                {starting ? "Connecting…" : "Start interview"}
              </Button>
              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                Prefer typing?
                <Button variant="ghost" onClick={onUseTextMode} disabled={loading || starting} className="rounded-xl">
                  <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" />
                  Use text mode
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
