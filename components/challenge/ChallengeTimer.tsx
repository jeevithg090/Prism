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
    <div className="flex flex-col items-start gap-3 sm:items-end">
      <span className="inline-flex items-center gap-2">
        <Timer className="size-5 text-muted-foreground" aria-hidden />
        <span role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`} className="font-mono text-3xl leading-none font-semibold text-foreground tabular-nums">{fmt(left)}</span>
      </span>
      {left === 0 ? (
        <span className="max-w-[28ch] text-sm text-pretty text-muted-foreground sm:text-end" aria-live="polite">Time&apos;s up. Finish your thought and check your work; there&apos;s no penalty.</span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {started && (
          <Button variant="ghost" onClick={() => { setRunning(false); setLeft(total); }}>
            <RotateCcw aria-hidden /> Reset timer
          </Button>
        )}
        {left > 0 && (
          <Button variant="outline" onClick={() => setRunning((r) => !r)} aria-pressed={running}>
            {running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {running ? "Pause" : started ? "Resume" : `Start ${minutes}-minute timer`}
          </Button>
        )}
      </div>
    </div>
  );
}
