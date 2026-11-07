"use client";
// Where a result came from under the Demo toggle: "Replayed from a real run · gpt-4.1-mini · 7 Nov, 15:20".
// Story routes return it as `replay` in their envelope (lib/replay.ts withReplayInfo); place this next to the
// result, and show it instead of DemoDataNote when `replay` is present (the result is real, not seeded).
import { AlertTriangle, Repeat, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatReplayTime, replayNoteText, type ReplayInfo } from "@/lib/replay-info";

export function ReplayNote({ replay, className }: { replay: ReplayInfo | null | undefined; className?: string }) {
  const text = replayNoteText(replay);
  if (!replay || !text) return null;
  const Icon = replay.source === "template" ? AlertTriangle : replay.source === "live" ? Sparkles : Repeat;
  const at = formatReplayTime(replay.recordedAt);
  const title =
    replay.source === "template"
      ? "No real run of this exact request was recorded, so Keystone's deterministic template answered."
      : replay.source === "live"
        ? "Called the AI services just now."
        : `Recorded from a real Live AI run${at ? ` on ${at}` : ""}${replay.similar ? " with slightly different inputs" : ""}.`;
  return (
    <span
      title={title}
      data-replay-source={replay.source}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
        replay.source === "template" ? "border-dashed border-rule-2" : "border-border",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{text}</span>
    </span>
  );
}
