"use client";
// The running transcript: "Interviewer" / "You" turns, newest at the bottom, announced politely.
// Set like a script: the speaker in a narrow column, the words beside it, turns split by hairlines.
import * as React from "react";
import type { TranscriptTurn } from "@/lib/voice/questions";
import { cn } from "@/lib/utils";

export function LiveCaptions({ turns, interim }: { turns: TranscriptTurn[]; interim?: string }) {
  // Scroll only the transcript box, never the window, so the question above stays where it is.
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [turns.length, interim]);
  return (
    <div ref={box} role="region" aria-label="Transcript" tabIndex={0} className="max-h-80 overflow-y-auto rounded-xl bg-muted px-4 py-2 outline-2 -outline-offset-2 outline-transparent focus-visible:outline-ring">
      {turns.length === 0 && !interim ? (
        <p className="py-2 text-sm text-muted-foreground">The transcript appears here as you talk.</p>
      ) : (
        <ol aria-live="polite" aria-relevant="additions">
          {turns.map((t, i) => (
            <li key={i} className="grid gap-1 border-t py-3 first:border-t-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
              <span className={cn("text-sm font-medium", t.speaker === "ai" ? "text-muted-foreground" : "text-foreground")}>{t.speaker === "ai" ? "Interviewer" : "You"}</span>
              <p className="max-w-prose text-pretty text-foreground">{t.text}</p>
            </li>
          ))}
          {interim && (
            <li className="grid gap-1 border-t py-3 first:border-t-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
              <span className="text-sm font-medium text-foreground">You (listening)</span>
              <p className="max-w-prose text-pretty text-muted-foreground">{interim}</p>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
