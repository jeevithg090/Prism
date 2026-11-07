"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, Pause, Play, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { Briefing } from "@/lib/types";
import { apiGet } from "@/lib/fetcher";
import { EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const TITLE = "🎧 Your weekly briefing";
const SPEEDS = [1, 1.25] as const;

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "empty" } | { kind: "ready"; briefing: Briefing };
type AudioState = "idle" | "preparing" | "unavailable";

export function formatWeekOf(weekOf: string): string {
  const d = new Date(`${weekOf}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? weekOf : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// About 150 spoken words a minute; used until the audio's real duration is known.
const estimateSeconds = (script: string) => Math.round((script.trim().split(/\s+/).length / 150) * 60);

function isNotFound(e: unknown): boolean {
  const err = e as { status?: number; code?: string; message?: string } | null;
  return err?.status === 404 || err?.code === "not_found" || /not.?found|no briefing/i.test(err?.message ?? "");
}

export function BriefingPlayer({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    apiGet<Briefing>(`/api/briefing/${encodeURIComponent(userId)}`)
      .then((b) => live && setState(b?.script?.trim() ? { kind: "ready", briefing: b } : { kind: "empty" }))
      .catch((e: unknown) => live && setState(isNotFound(e) ? { kind: "empty" } : { kind: "error" }));
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  if (state.kind === "loading") {
    return (
      <SectionCard title={TITLE}>
        <div aria-busy="true">
          <span className="sr-only">Loading your briefing…</span>
          <LoadingSkeleton variant="card" />
        </div>
      </SectionCard>
    );
  }
  if (state.kind === "error") {
    return (
      <SectionCard title={TITLE}>
        <ErrorState title="Couldn't load your briefing." onRetry={() => {
            setState({ kind: "loading" });
            setAttempt((n) => n + 1);
          }} />
      </SectionCard>
    );
  }
  if (state.kind === "empty") {
    return (
      <SectionCard title={TITLE}>
        <EmptyState
          icon={CalendarClock}
          title="Your first briefing arrives Monday."
          body="Each week you'll get a one-minute summary of your market, your pod and your next three tasks."
          action={
            <a
              href="/roadmap"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              See this week&apos;s roadmap
            </a>
          }
        />
      </SectionCard>
    );
  }
  return <Player key={`${state.briefing.userId}_${state.briefing.weekOf}`} briefing={state.briefing} />;
}

function Player({ briefing }: { briefing: Briefing }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const source = useRef<"none" | "file" | "tts">("none");
  const blobUrl = useRef<string | null>(null);
  // `mounted` and `wantsToPlay` let async work bail out once the card is gone or the user has paused,
  // so a late play() or /api/tts response never starts audio nobody asked for.
  const mounted = useRef(true);
  const wantsToPlay = useRef(false);
  const ttsAbort = useRef<AbortController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const el = audioRef.current;
    return () => {
      mounted.current = false;
      wantsToPlay.current = false;
      ttsAbort.current?.abort();
      el?.pause();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
      source.current = "none";
    };
  }, []);

  const giveUp = useCallback(() => {
    wantsToPlay.current = false;
    setAudioState("unavailable");
    setPlaying(false);
    setTranscriptOpen(true);
  }, []);

  // Generates audio for the script on the fly (POST /api/tts returns raw audio, not an envelope).
  // Resolves false if it failed (after giving up) or was cancelled by unmounting.
  const loadTts = useCallback(
    async (el: HTMLAudioElement): Promise<boolean> => {
      ttsAbort.current?.abort();
      const ctrl = new AbortController();
      ttsAbort.current = ctrl;
      const cancelled = () => ctrl.signal.aborted || !mounted.current;
      setAudioState("preparing");
      try {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: briefing.script }),
          signal: ctrl.signal,
        });
        if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("audio/")) throw new Error(`tts_${r.status}`);
        const blob = await r.blob();
        if (cancelled()) return false;
        const url = URL.createObjectURL(blob);
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = url;
        el.src = url;
        source.current = "tts";
        setAudioState("idle");
        return true;
      } catch {
        if (!cancelled()) giveUp();
        return false;
      } finally {
        if (ttsAbort.current === ctrl) ttsAbort.current = null;
      }
    },
    [briefing.script, giveUp],
  );

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    const stillWanted = () => mounted.current && wantsToPlay.current;
    wantsToPlay.current = true;
    if (source.current === "none") {
      if (briefing.audioUrl) {
        el.src = briefing.audioUrl;
        source.current = "file";
      } else if (!(await loadTts(el)) || !stillWanted()) return;
    }
    el.playbackRate = speed;
    try {
      await el.play();
      if (stillWanted()) setPlaying(true);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      // AbortError means a pause (or unmount) interrupted a play() that was still buffering: nothing is broken.
      if (!stillWanted() || name === "AbortError") return;
      if (name === "NotAllowedError") {
        wantsToPlay.current = false;
        toast("Tap play again to start your briefing.");
        return;
      }
      // The committed file is missing or broken: try generating the audio instead.
      const broken = name === "NotSupportedError" || el.error != null;
      if (source.current === "file" && broken) {
        if (!(await loadTts(el)) || !stillWanted()) return;
        try {
          el.playbackRate = speed;
          await el.play();
          if (stillWanted()) setPlaying(true);
          return;
        } catch (e2) {
          if (!stillWanted() || (e2 as { name?: string })?.name === "AbortError") return;
        }
      }
      giveUp();
    }
  }, [briefing.audioUrl, giveUp, loadTts, speed]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el || audioState === "preparing") return;
    if (playing) {
      wantsToPlay.current = false;
      el.pause();
      setPlaying(false);
    } else {
      void play();
    }
  };

  const toggleSpeed = () => {
    const next = speed === SPEEDS[0] ? SPEEDS[1] : SPEEDS[0];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const total = duration > 0 && Number.isFinite(duration) ? duration : estimateSeconds(briefing.script);
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const speedLabel = `${speed}×`;
  const status =
    audioState === "preparing"
      ? "Preparing your audio…"
      : audioState === "unavailable"
        ? "Audio isn't available right now, so here's the transcript to read instead."
        : playing
          ? "Playing your briefing."
          : current > 0
            ? "Paused."
            : "";

  return (
    <SectionCard title={TITLE} description={`Week of ${formatWeekOf(briefing.weekOf)}`}>
      <div className="flex flex-col gap-5">
        <audio
          ref={audioRef}
          preload="none"
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        <div className="flex items-center gap-4">
          <Button
            type="button"
            size="icon"
            onClick={toggle}
            disabled={audioState === "preparing"}
            aria-label={playing ? "Pause briefing" : "Play briefing"}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70 motion-safe:transition-transform motion-safe:active:scale-95"
          >
            {audioState === "preparing" ? (
              <Loader2 aria-hidden="true" className="size-6 motion-safe:animate-spin" />
            ) : playing ? (
              <Pause aria-hidden="true" className="size-6" />
            ) : (
              <Play aria-hidden="true" className="size-6 translate-x-px" />
            )}
          </Button>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Progress value={Math.round(pct)} aria-label="Briefing progress" className="h-2" />
            <p className="flex justify-between font-mono text-base tabular-nums text-muted-foreground">
              <span>
                <span className="sr-only">Elapsed </span>
                {formatTime(current)}
              </span>
              <span>
                <span className="sr-only">Total </span>
                {formatTime(total)}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={toggleSpeed}
            aria-label={`Playback speed ${speedLabel}. Switch to ${speed === SPEEDS[0] ? SPEEDS[1] : SPEEDS[0]}×`}
            className="shrink-0 rounded-xl border px-3 py-2 text-base font-medium tabular-nums text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {speedLabel}
          </button>
        </div>

        <p aria-live="polite" className="min-h-6 text-base text-muted-foreground">
          {status}
        </p>

        {briefing.marketMoves.length > 0 && (
          <ul aria-label="Market moves this week" className="flex flex-wrap gap-2">
            {briefing.marketMoves.map((m) => (
              <li
                key={m}
                className="inline-flex items-center gap-1.5 rounded-full border bg-primary/10 px-3 py-1 text-base text-foreground"
              >
                <TrendingUp aria-hidden="true" className="size-4 text-status-rising" />
                {m}
              </li>
            ))}
          </ul>
        )}

        <details
          open={transcriptOpen}
          onToggle={(e) => setTranscriptOpen(e.currentTarget.open)}
          className="rounded-xl border p-4"
        >
          <summary className="cursor-pointer rounded-lg font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Read instead
          </summary>
          <p className="mt-3 leading-relaxed text-foreground">{briefing.script}</p>
          {briefing.topTasks.length > 0 && (
            <>
              <h3 className="mt-4 text-base font-semibold text-foreground">This week&apos;s tasks</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground">
                {briefing.topTasks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </>
          )}
        </details>
      </div>
    </SectionCard>
  );
}
