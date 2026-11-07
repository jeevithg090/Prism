"use client";
// The running transcript: "Interviewer" / "You" turns, newest at the bottom, announced politely.
import * as React from "react";
import type { TranscriptTurn } from "@/lib/voice/questions";
import { cn } from "@/lib/utils";

export function LiveCaptions({ turns, interim }: { turns: TranscriptTurn[]; interim?: string }) {
  const end = React.useRef<HTMLLIElement>(null);
  React.useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest" }); }, [turns.length, interim]);
  return (
    <div role="region" aria-label="Transcript" tabIndex={0} className="max-h-80 overflow-y-auto rounded-xl bg-muted/60 p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {turns.length === 0 && !interim ? (
        <p className="text-sm text-muted-foreground">The transcript appears here as you talk.</p>
      ) : (
        <ol className="space-y-3" aria-live="polite" aria-relevant="additions">
          {turns.map((t, i) => (
            <li key={i} className={cn("flex flex-col gap-0.5", t.speaker === "user" && "items-end text-right")}>
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.speaker === "ai" ? "Interviewer" : "You"}</span>
              <p className={cn("max-w-prose rounded-xl px-3 py-2 text-sm", t.speaker === "ai" ? "bg-card" : "bg-primary/10")}>{t.text}</p>
            </li>
          ))}
          {interim && (
            <li className="flex flex-col items-end gap-0.5 text-right">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">You (listening)</span>
              <p className="max-w-prose rounded-xl border border-dashed bg-card px-3 py-2 text-sm text-muted-foreground">{interim}</p>
            </li>
          )}
          <li ref={end} aria-hidden className="h-0" />
        </ol>
      )}
    </div>
  );
}
