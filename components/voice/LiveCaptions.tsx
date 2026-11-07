"use client";

import { useEffect, useRef } from "react";

export interface CaptionLine {
  role: "ai" | "user";
  text: string;
}

/**
 * Alternating "Interviewer" / "You" bubbles, latest at the bottom.
 * role="log" + aria-live="polite" so screen readers hear new lines without interruption.
 */
export function LiveCaptions({ lines, thinking = false }: { lines: CaptionLine[]; thinking?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, thinking]);

  return (
    <div
      ref={boxRef}
      role="log"
      aria-live="polite"
      aria-label="Live captions"
      tabIndex={0}
      className="max-h-80 w-full overflow-y-auto rounded-xl border bg-background p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {lines.length === 0 && !thinking ? (
        <p className="text-sm text-muted-foreground">Captions will appear here once your interviewer starts talking.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const ai = l.role === "ai";
            return (
              <li key={i} className={`flex flex-col gap-1 ${ai ? "items-start" : "items-end"}`}>
                <span className="text-[13px] font-medium text-muted-foreground">{ai ? "Interviewer" : "You"}</span>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-base leading-relaxed ${
                    ai ? "rounded-tl-sm bg-primary/10 text-foreground" : "rounded-tr-sm border bg-card text-foreground"
                  }`}
                >
                  {l.text}
                </p>
              </li>
            );
          })}
          {thinking && (
            <li className="flex flex-col items-start gap-1">
              <span className="text-[13px] font-medium text-muted-foreground">Interviewer</span>
              <p className="rounded-2xl rounded-tl-sm bg-primary/10 px-4 py-2 text-base italic text-foreground">
                Thinking of your next question…
              </p>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
