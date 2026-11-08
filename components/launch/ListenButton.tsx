"use client";
import * as React from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playText, type Playback } from "@/components/voice/playText";

export function ListenButton({ text, label = "Listen to the voiceover" }: { text: string; label?: string }) {
  const [state, setState] = React.useState<"idle" | "loading" | "playing" | "unsupported">("idle");
  const pb = React.useRef<Playback | null>(null);
  React.useEffect(() => () => pb.current?.stop(), []);
  const toggle = async () => {
    if (state === "playing") { pb.current?.stop(); setState("idle"); return; }
    setState("loading");
    const p = await playText(text);
    if (p.via === "none") { setState("unsupported"); return; }
    pb.current = p;
    setState("playing");
    void p.done.then(() => setState("idle"));
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="lg" onClick={() => void toggle()} aria-pressed={state === "playing"} aria-busy={state === "loading"} disabled={state === "loading"}>
        {state === "playing" ? <Pause className="size-4" aria-hidden /> : state === "loading" ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
        {state === "playing" ? "Stop" : state === "loading" ? "Loading…" : label}
      </Button>
      {state === "unsupported" && <span className="text-sm text-muted-foreground">Your browser can&apos;t read text aloud. The script is above.</span>}
    </div>
  );
}
