// Keystone Labs · Viva Check: renders `code` spans in question text as inline code (and plain text for speech).
import * as React from "react";

export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <code key={i} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm break-words">{p}</code>
          : <React.Fragment key={i}>{p}</React.Fragment>,
      )}
    </>
  );
}

/** The same text for text-to-speech: no backticks. */
export const speakable = (text: string) => text.replace(/`/g, "");
