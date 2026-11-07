"use client";
// An optional countdown. Formative practice: running out of time costs nothing.
import * as React from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function ChallengeTimer({ minutes }: { minutes: number }) {
  const total = minutes * 60;
  const [left, setLeft] = React.useState(total);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { setRunning(false); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [running]);

  const started = left !== total;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5">
        <Timer className="size-4 text-muted-foreground" aria-hidden />
        <span role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`} className="font-mono text-lg font-semibold tabular-nums">{fmt(left)}</span>
      </span>
      {left === 0 ? (
        <span className="text-sm text-muted-foreground" aria-live="polite">Time&apos;s up. Finish your thought and check your work; there&apos;s no penalty.</span>
      ) : (
        <Button variant="outline" onClick={() => setRunning((r) => !r)} aria-pressed={running}>
          {running ? <Pause aria-hidden /> : <Play aria-hidden />}
          {running ? "Pause" : started ? "Resume" : `Start ${minutes}-minute timer`}
        </Button>
      )}
      {started && (
        <Button variant="ghost" onClick={() => { setRunning(false); setLeft(total); }}>
          <RotateCcw aria-hidden /> Reset timer
        </Button>
      )}
    </div>
  );
}
