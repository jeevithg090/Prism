"use client";
// Dashboard slot: "Your weekly briefing". Plays the briefing's audioUrl, else ElevenLabs TTS, else the browser voice.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Headphones, Pause, Play } from "lucide-react";
import { DemoDataNote, EmptyState, ErrorState } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import type { Briefing } from "@/lib/types";
import demoBriefing from "@/data/fixtures/briefing.aisha.json";
import { playText, type Playback } from "./playText";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return Number.isNaN(d.getTime()) ? iso : `Week of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

export function BriefingPlayer({ userId }: { userId: string }) {
  const [demo, setDemo] = React.useState(false);
  const q = useQuery({ queryKey: ["briefing", userId], queryFn: () => apiGet<Briefing>(`/api/briefing/${encodeURIComponent(userId)}`), enabled: !demo });
  const [state, setState] = React.useState<"idle" | "loading" | "playing">("idle");
  const [rate, setRate] = React.useState(1);
  const pb = React.useRef<Playback | null>(null);
  React.useEffect(() => () => pb.current?.stop(), []);
  const b: Briefing | undefined = demo ? (demoBriefing as Briefing) : q.data;

  if (!demo && q.isPending) return <div className="rounded-2xl border bg-card p-6 shadow-sm" aria-busy="true"><Skeleton className="h-6 w-48" /><Skeleton className="mt-4 h-12 w-full rounded-xl" /></div>;
  if (!demo && q.isError) return <ErrorState title="Couldn't load your briefing." body="That's on us, not you." onRetry={() => void q.refetch()} onUseDemo={() => setDemo(true)} />;
  if (!b?.script) return <EmptyState icon={Headphones} title="Your first briefing arrives Monday." body="It sums up your week's plan, your pod and the job market in about a minute." />;

  const toggle = async () => {
    if (state === "playing") { pb.current?.stop(); setState("idle"); return; }
    setState("loading");
    if (b.audioUrl) {
      const audio = new Audio(b.audioUrl);
      audio.playbackRate = rate;
      const done = new Promise<void>((r) => { audio.onended = () => r(); audio.onerror = () => r(); });
      try { await audio.play(); pb.current = { via: "elevenlabs", done, stop: () => audio.pause(), audio }; } catch { pb.current = await playText(b.script, { rate }); }
    } else {
      pb.current = await playText(b.script, { rate });
    }
    if (pb.current.via === "none") { setState("idle"); return; }
    setState("playing");
    void pb.current.done.then(() => setState("idle"));
  };

  return (
    <section aria-labelledby="briefing-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="briefing-title" className="text-xl font-semibold">Your weekly briefing</h2>
          <p className="text-sm text-muted-foreground">{weekLabel(b.weekOf)} · about a minute</p>
        </div>
        {(demo || userId === "aisha") && <DemoDataNote />}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button className="size-12 rounded-full" onClick={() => void toggle()} aria-label={state === "playing" ? "Pause briefing" : "Play briefing"} disabled={state === "loading"}>
          {state === "playing" ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
        </Button>
        <Button variant="outline" className="h-10 rounded-xl" aria-label={`Playback speed ${rate}x`} onClick={() => setRate((r) => (r === 1 ? 1.25 : 1))}>
          {rate}×
        </Button>
        <ul className="hidden min-w-0 flex-1 text-sm text-muted-foreground sm:block">
          {b.marketMoves.slice(0, 2).map((m) => <li key={m} className="truncate">{m}</li>)}
        </ul>
      </div>
      <details className="mt-4 rounded-xl bg-muted/60 p-4">
        <summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">Read instead</summary>
        <p className="mt-3 leading-7">{b.script}</p>
        {b.topTasks.length > 0 && (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{b.topTasks.map((t) => <li key={t}>{t}</li>)}</ol>
        )}
      </details>
    </section>
  );
}
