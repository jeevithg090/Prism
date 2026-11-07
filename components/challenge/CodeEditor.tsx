"use client";
// A labelled, tab-friendly monospace editor. Tab indents; Esc then Tab leaves (so keyboard users are never trapped).
import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CodeEditor({ id, label, value, onChange, disabled, className }: {
  id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean; className?: string;
}) {
  const escaped = React.useRef(false);
  const helpId = `${id}-help`;
  const lines = value.split("\n").length;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { escaped.current = true; return; }
    if (e.key === "Tab" && !e.shiftKey && !escaped.current) {
      e.preventDefault();
      const el = e.currentTarget;
      el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
      onChange(el.value);
      return;
    }
    if (e.key !== "Tab" && e.key !== "Shift") escaped.current = false;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="font-mono text-sm">{label}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">{lines} {lines === 1 ? "line" : "lines"}</span>
      </div>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={helpId}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        rows={Math.min(Math.max(lines + 2, 10), 22)}
        className="block w-full resize-y overflow-x-auto rounded-xl border border-input bg-muted/40 px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none [tab-size:2] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
      />
      <p id={helpId} className="text-xs text-muted-foreground">Tab indents. Press Esc, then Tab, to move on.</p>
    </div>
  );
}
