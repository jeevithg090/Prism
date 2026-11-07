"use client";
// Story Mode player: a self-running, presenter-driven tour of Keystone built from the Director's grounded script.
// Space plays or pauses, arrows move between beats, Enter passes a human checkpoint, V voice, C captions.
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, useReducedMotion } from "motion/react";
import {
  BookmarkCheck, Captions, CaptionsOff, Clapperboard, Hand, Keyboard, Pause, Play, RotateCcw, SkipBack, SkipForward, UserCheck, Volume2, VolumeX,
} from "lucide-react";
import { AGENT_META, AgentAvatar, DemoDataNote, EmptyState, ErrorState, PageHeader, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiPost } from "@/lib/fetcher";
import type { Story, StoryBeat } from "@/lib/labs/story/schema";
import { cn } from "@/lib/utils";
import { BeatVisual } from "./BeatVisual";
import { Constellation } from "./Constellation";
import { LiveCheck, useLiveCheck } from "./LiveCheck";
import { useNarrator } from "./useNarrator";

const TICK_MS = 100;
const SUBTITLE = "Keystone presents itself: one student's first six weeks, told by the agents that did the work. Every number is checked against the live API that produced it.";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; story: Story };

const requestStory = (sid?: string) => apiPost<Story>("/api/labs/story", sid ? { studentId: sid } : {});
const failed = (e: unknown): Load => ({ status: "error", message: e instanceof Error ? e.message : "The Director couldn't build the story." });

export function StoryPlayer({ studentId }: { studentId?: string }) {
  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  React.useEffect(() => {
    let live = true;
    requestStory(studentId).then((story) => { if (live) setLoad({ status: "ready", story }); }, (e) => { if (live) setLoad(failed(e)); });
    return () => { live = false; };
  }, [studentId]);
  const fetchStory = React.useCallback((sid?: string) => {
    setLoad({ status: "loading" });
    requestStory(sid).then((story) => setLoad({ status: "ready", story }), (e) => setLoad(failed(e)));
  }, []);

  if (load.status === "loading") return <StorySkeleton />;
  if (load.status === "error") {
    return (
      <div className="space-y-6">
        <PageHeader title="Story Mode" subtitle={SUBTITLE} />
        <ErrorState title="The story didn't load" body={`${load.message} That's on us, not you.`} onRetry={() => fetchStory(studentId)} onUseDemo={() => fetchStory("aisha")} />
      </div>
    );
  }
  if (!load.story.beats.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Story Mode" subtitle={SUBTITLE} />
        <EmptyState
          icon={Clapperboard}
          title="There's no story to tell yet"
          body="This student has no Keystone data yet. Aisha's first six weeks are ready to play."
          action={<Button className="h-10 rounded-xl px-4" onClick={() => fetchStory("aisha")}>Play Aisha&apos;s story</Button>}
        />
      </div>
    );
  }
  return <Player story={load.story} onRebuild={() => fetchStory(studentId)} />;
}

export function StorySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading the story</span>
      <div className="space-y-2"><Skeleton className="h-10 w-56" /><Skeleton className="h-5 w-full max-w-2xl" /></div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm"><Skeleton className="h-12 w-full" /><Skeleton className="mt-4 h-3 w-full" /></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-48 w-full" /><Skeleton className="h-16 w-full" /></div>
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /></div>
      </div>
    </div>
  );
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};
const isControl = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && ["BUTTON", "A", "SUMMARY"].includes(el.tagName);
};

function Player({ story, onRebuild }: { story: Story; onRebuild: () => void }) {
  const beats = story.beats;
  const last = beats.length - 1;
  const reduce = useReducedMotion();
  const activity = useActivity();
  const { engine, speak, stop } = useNarrator();
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [spoken, setSpoken] = React.useState(false);
  const [awaiting, setAwaiting] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const [voice, setVoice] = React.useState(false);
  const [captions, setCaptions] = React.useState(true);
  const [holdAtCheckpoints, setHoldAtCheckpoints] = React.useState(true);
  const [help, setHelp] = React.useState(false);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle");
  const beat = beats[index];
  const durationMs = beat.seconds * 1000;
  const check = useLiveCheck(beat.id, beat.verify);

  const go = React.useCallback((i: number) => {
    stop();
    setIndex(Math.max(0, Math.min(last, i)));
    setElapsed(0);
    setSpoken(false);
    setAwaiting(false);
    setFinished(false);
  }, [last, stop]);

  const advance = React.useCallback(() => {
    if (index < last) go(index + 1);
    else { setFinished(true); setPlaying(false); setAwaiting(false); }
  }, [go, index, last]);

  const togglePlay = React.useCallback(() => {
    if (finished) { go(0); setPlaying(true); return; }
    setPlaying((p) => !p);
  }, [finished, go]);

  const passCheckpoint = React.useCallback(() => {
    setAwaiting(false);
    advance();
  }, [advance]);

  // Narrate each beat while playing (ElevenLabs, else the browser voice).
  React.useEffect(() => {
    if (!playing || !voice) return;
    void speak(beat.id, beat.narration, () => setSpoken(true));
    return () => stop();
  }, [playing, voice, beat.id, beat.narration, speak, stop]);

  // The beat clock: ticks while playing, holds at a human checkpoint until a person continues, and moves on
  // once the beat has had its time and its narration. Latest values reach the interval through a ref.
  const latest = React.useRef({ elapsed: 0, durationMs, speechDone: true, checkpoint: false, hold: true, advance });
  React.useEffect(() => {
    latest.current = { elapsed, durationMs, speechDone: !voice || spoken || engine === "none", checkpoint: !!beat.checkpoint, hold: holdAtCheckpoints, advance };
  });
  React.useEffect(() => {
    if (!playing || awaiting || finished) return;
    const t = setInterval(() => {
      const l = latest.current;
      if (l.elapsed < l.durationMs) { setElapsed((e) => Math.min(l.durationMs, e + TICK_MS)); return; }
      if (!l.speechDone) return;
      if (l.checkpoint && l.hold) { setAwaiting(true); return; }
      l.advance();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [playing, awaiting, finished]);

  // Presenter keyboard.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key;
      if ((k === " " || k === "Enter") && isControl(e.target)) return; // let the focused button do its job
      if (k === " " || k === "k" || k === "K") { e.preventDefault(); togglePlay(); }
      else if (k === "ArrowRight" || k === "l" || k === "L") { e.preventDefault(); if (awaiting) passCheckpoint(); else go(index + 1); }
      else if (k === "ArrowLeft" || k === "j" || k === "J") { e.preventDefault(); go(index - 1); }
      else if (k === "Enter") { if (awaiting) { e.preventDefault(); passCheckpoint(); } }
      else if (k === "v" || k === "V") setVoice((v) => !v);
      else if (k === "c" || k === "C") setCaptions((c) => !c);
      else if (k === "r" || k === "R" || k === "Home") { e.preventDefault(); go(0); }
      else if (k === "Escape") setPlaying(false);
      else if (k === "?") setHelp((h) => !h);
      else if (/^[0-9]$/.test(k)) { const i = k === "0" ? 9 : Number(k) - 1; if (i <= last) go(i); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awaiting, go, index, last, passCheckpoint, togglePlay]);

  React.useEffect(() => { if (!voice) stop(); }, [voice, stop]);

  const remember = async () => {
    setSaved("saving");
    try {
      const note = await apiPost<{ text: string }>("/api/labs/story/remember", { confirm: true, beatsSeen: index + 1 });
      setSaved("saved");
      toast.success("The Coach will skip the tour", { description: note.text });
    } catch (e) {
      setSaved("idle");
      toast.error("That didn't save", { description: e instanceof Error ? e.message : "Try again in a moment." });
    }
  };

  const minutes = Math.max(1, Math.round(story.totalSeconds / 60));
  const progress = finished ? 1 : elapsed / durationMs;
  const first = story.subject.name.split(" ")[0];
  const status = finished ? "Finished" : awaiting ? "Waiting for a person" : playing ? "Playing" : "Paused";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Story Mode"
        subtitle={SUBTITLE}
        actions={
          <>
            {story.mode === "demo" && <DemoDataNote />}
            <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => activity.start(story.runId)}>
              <AgentAvatar agent="orchestrator" size={20} />Watch the Director&apos;s run
            </Button>
          </>
        }
      />

      <SectionCard className="p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-12 min-w-36 basis-full rounded-xl px-6 text-base sm:basis-auto" onClick={togglePlay} aria-keyshortcuts="Space">
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              {playing ? "Pause" : finished ? "Play again" : index === 0 && elapsed === 0 ? `Play ${first}'s story` : "Resume"}
            </Button>
            <Button variant="outline" className="size-12 rounded-xl" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous beat" aria-keyshortcuts="ArrowLeft"><SkipBack aria-hidden /></Button>
            <Button variant="outline" className="size-12 rounded-xl" onClick={() => (awaiting ? passCheckpoint() : go(index + 1))} disabled={index === last && !awaiting} aria-label="Next beat" aria-keyshortcuts="ArrowRight"><SkipForward aria-hidden /></Button>
            <Button variant="outline" className="size-12 rounded-xl" onClick={() => go(0)} aria-label="Start again from beat 1" aria-keyshortcuts="R"><RotateCcw aria-hidden /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Toggle on={voice} onClick={() => setVoice((v) => !v)} label="Voice" shortcut="V" icon={voice ? Volume2 : VolumeX} />
            <Toggle on={captions} onClick={() => setCaptions((c) => !c)} label="Captions" shortcut="C" icon={captions ? Captions : CaptionsOff} />
            <Toggle on={holdAtCheckpoints} onClick={() => setHoldAtCheckpoints((h) => !h)} label="Stop at checkpoints" icon={Hand} />
            <Button variant="ghost" className="h-10 rounded-xl px-3" onClick={() => setHelp((h) => !h)} aria-expanded={help} aria-controls="story-keys" aria-keyshortcuts="?">
              <Keyboard aria-hidden />Shortcuts
            </Button>
          </div>
        </div>

        {help && (
          <dl id="story-keys" className="mt-4 grid gap-x-6 gap-y-1.5 rounded-xl bg-muted/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[["Space", "Play or pause"], ["Left and right arrows", "Previous or next beat"], ["Enter", "Continue past a human checkpoint"], ["1 to 0", "Jump to beat 1 to 10"], ["V", "Voice on or off"], ["C", "Captions on or off"], ["R", "Start again"], ["Esc", "Pause"]].map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt><kbd className="rounded border bg-card px-1.5 font-mono">{k}</kbd></dt><dd className="text-muted-foreground">{v}</dd></div>
            ))}
          </dl>
        )}

        <Timeline beats={beats} index={index} progress={progress} onJump={go} />
        <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:justify-between">
          <p><span className="font-medium text-foreground">{status}.</span> Beat {index + 1} of {beats.length}, about {minutes} minutes in all.</p>
          <p>
            <span className="font-mono tabular-nums text-foreground">{story.grounding.checked}</span> numbers in the script traced to live data,{" "}
            <span className="font-mono tabular-nums text-foreground">{story.grounding.removed}</span> removed by the grounding check.
          </p>
        </div>
        {story.skipped.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {story.skipped.length} {story.skipped.length === 1 ? "beat is" : "beats are"} left out because the data isn&apos;t there yet: {story.skipped.map((s) => s.reason).join("; ")}.
          </p>
        )}
      </SectionCard>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="story-beat-title" className="rounded-2xl border bg-card p-4 shadow-sm md:p-6">
          <motion.div key={beat.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <AgentAvatar agent={beat.agent} size={40} />
              <div className="min-w-0">
                <p className="font-semibold">{AGENT_META[beat.agent].name} acted</p>
                {beat.with.length > 0 && <p className="text-sm text-muted-foreground">With input from {beat.with.map((a) => AGENT_META[a].name).join(", ")}</p>}
              </div>
              <span className="ml-auto rounded-full border bg-muted px-3 py-1 text-sm font-medium">{beat.when}</span>
            </div>
            <h2 id="story-beat-title" className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{beat.title}</h2>
            <BeatVisual visual={beat.visual} />
          </motion.div>

          <div className={cn("mt-5 rounded-xl bg-muted/60 p-4", !captions && "sr-only")}>
            <p aria-live="polite" className="text-lg leading-relaxed text-pretty md:text-xl">{beat.narration}</p>
          </div>

          <div className="mt-4 space-y-3">
            {beat.verify && <LiveCheck verify={beat.verify} state={check} />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Served by <code className="font-mono text-foreground">{beat.api}</code></p>
              <Link href={beat.screen.href} prefetch={false} className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>Open the real screen: {beat.screen.label}</Link>
            </div>
          </div>
        </section>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <SectionCard title="Why the agent did it">
            <p className="text-base">{beat.why}</p>
            <dl className="mt-4 divide-y rounded-xl border">
              {beat.facts.filter((f) => typeof f.value === "number").slice(0, 5).map((f) => (
                <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2">
                  <dt className="min-w-0 text-sm">{f.label}<span className="block truncate font-mono text-sm text-muted-foreground" title={f.source}>{f.source}</span></dt>
                  <dd className="max-w-[12rem] truncate text-right font-mono text-base font-semibold tabular-nums" title={f.display}>{f.display}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <CheckpointCard
            beat={beat}
            awaiting={awaiting}
            onContinue={passCheckpoint}
            finished={finished || index === last}
            saved={saved}
            onRemember={remember}
          />

          <SectionCard title="Handoffs" description="Every agent's output is another agent's input.">
            <Constellation agents={story.agents} beats={beats} current={index} />
          </SectionCard>
          {finished && (
            <Button variant="ghost" className="h-10 rounded-xl px-3" onClick={onRebuild}><RotateCcw aria-hidden />Rebuild the story from live data</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label, shortcut, icon: Icon }: { on: boolean; onClick: () => void; label: string; shortcut?: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }) {
  return (
    <Button
      variant="outline"
      aria-pressed={on}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
      className={cn("h-10 rounded-xl px-3", on && "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/15")}
    >
      <Icon className="size-4" aria-hidden />{label}<span className="sr-only">{on ? ", on" : ", off"}</span>
    </Button>
  );
}

function Timeline({ beats, index, progress, onJump }: { beats: StoryBeat[]; index: number; progress: number; onJump: (i: number) => void }) {
  return (
    <ol className="mt-5 flex gap-1" aria-label="Story timeline">
      {beats.map((b, i) => {
        const fill = i < index ? 100 : i === index ? Math.round(progress * 100) : 0;
        const showWhen = i === 0 || beats[i - 1].when !== b.when;
        return (
          <li key={b.id} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Beat ${i + 1}, ${b.when}: ${b.title}${b.checkpoint ? ". Has a human checkpoint" : ""}`}
              className="group flex w-full flex-col gap-1.5 rounded-lg px-0.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("relative block h-2.5 w-full overflow-hidden rounded-full bg-muted", i === index && "ring-1 ring-primary/40")}>
                <span className="absolute inset-y-0 left-0 rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-100" style={{ width: `${fill}%` }} />
              </span>
              <span className={cn("hidden h-5 items-center gap-1 truncate text-xs md:flex", i === index ? "font-medium text-foreground" : "text-muted-foreground")}>
                {b.checkpoint && <UserCheck className="size-3.5 shrink-0 text-primary" aria-hidden />}
                {showWhen ? b.when : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CheckpointCard({ beat, awaiting, onContinue, finished, saved, onRemember }: {
  beat: StoryBeat; awaiting: boolean; onContinue: () => void; finished: boolean; saved: "idle" | "saving" | "saved"; onRemember: () => void;
}) {
  const cp = beat.checkpoint;
  return (
    <SectionCard title="You decide" className={cn(awaiting && "border-primary ring-2 ring-primary/30")}>
      {cp ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-base">
            <UserCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span><span className="font-semibold">{cp.label}.</span> {cp.note}.</span>
          </p>
          {awaiting && (
            <div className="rounded-xl bg-muted/60 p-4" role="status">
              <p className="text-base">The story is waiting for a person, the way Keystone does. Press Enter or continue when you&apos;re ready.</p>
              <Button variant="outline" className="mt-3 h-10 rounded-xl px-4" onClick={onContinue}>Continue the story</Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-base text-muted-foreground">No person needs to approve this step: it only reads data and proposes. The next consequential step will stop for one.</p>
      )}
      {finished && (
        <div className="mt-4 border-t pt-4">
          <p className="text-base">Seen enough? Tell the Coach, and it will skip the tour and start from this week&apos;s proof. You can delete the note on the Coach page.</p>
          <Button variant="outline" className="mt-3 h-10 rounded-xl px-4" onClick={onRemember} disabled={saved !== "idle"}>
            <BookmarkCheck aria-hidden />{saved === "saved" ? "The Coach will remember" : saved === "saving" ? "Saving" : "Remember that I've watched this"}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
