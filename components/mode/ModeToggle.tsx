"use client";
// The Demo toggle in the top bar: "Demo" replays recorded results of real runs; "Live AI" calls the services now
// and records what they return (lib/replay.ts). The choice is the ks_mode cookie, set by POST /api/mode; after a
// switch the page re-renders on the server with router.refresh(). On phones the switch sits in the popover.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export type RunMode = "demo" | "live";
export type ModeState = {
  mode: RunMode;
  demoModeEnv?: boolean;
  total?: number;
  recordings?: Record<string, number>;
  recordedAt?: { first: string | null; last: string | null };
};

export const MODE_EXPLAINER = "Demo replays real results recorded from live runs (OpenAI, Firecrawl, ElevenLabs). Live AI calls them now.";

const OPTIONS: { value: RunMode; label: string }[] = [
  { value: "demo", label: "Demo" },
  { value: "live", label: "Live AI" },
];

const NS_LABEL: Record<string, [string, string]> = {
  llm: ["AI answer", "AI answers"], embed: ["embedding batch", "embedding batches"], firecrawl: ["Firecrawl page or search", "Firecrawl pages and searches"],
  tts: ["voice clip", "voice clips"], hn: ["Hacker News backfill", "Hacker News backfills"],
};

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** "38 recordings from real runs: 30 AI answers, 2 voice clips… Last recorded 7 Nov, 15:20." */
export function recordingsSummary(s: ModeState | null): string {
  if (!s) return "Checking what has been recorded…";
  const total = s.total ?? 0;
  if (!total) return "Nothing is recorded yet. Use Keystone in Live AI to record real runs; Demo then replays them.";
  const parts = Object.entries(s.recordings ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([ns, n]) => `${n} ${NS_LABEL[ns]?.[n === 1 ? 0 : 1] ?? ns}`);
  const last = when(s.recordedAt?.last);
  return `${total} recording${total === 1 ? "" : "s"} from real runs: ${parts.join(", ")}.${last ? ` Last recorded ${last}.` : ""}`;
}

function Segments({ mode, busy, onChoose, idPrefix }: { mode: RunMode | null; busy: boolean; onChoose: (m: RunMode) => void; idPrefix: string }) {
  return (
    <div role="group" aria-label="AI mode" className="inline-flex h-10 shrink-0 items-stretch gap-0.5 rounded-xl border bg-card p-0.5">
      {OPTIONS.map((o) => {
        const on = mode === o.value;
        return (
          <button
            key={o.value}
            id={`${idPrefix}-${o.value}`}
            type="button"
            aria-pressed={on}
            disabled={busy && !on}
            onClick={() => onChoose(o.value)}
            className={cn(
              "inline-flex min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ModeToggle({ className, initial }: { className?: string; initial?: ModeState }) {
  const router = useRouter();
  const [state, setState] = React.useState<ModeState | null>(initial ?? null);
  const [mode, setMode] = React.useState<RunMode | null>(initial?.mode ?? null);
  const [busy, setBusy] = React.useState(false);
  const [live, setLive] = React.useState("");
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    let alive = true;
    fetch("/api/mode", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; data?: ModeState }) => {
        if (alive && j?.ok && j.data) {
          setState(j.data);
          setMode(j.data.mode);
        }
      })
      .catch(() => { /* the switch still works; it just starts without a highlighted option */ });
    return () => { alive = false; };
  }, []);

  const choose = async (next: RunMode) => {
    if (busy || next === mode) return;
    const prev = mode;
    setMode(next);
    setBusy(true);
    try {
      const r = await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: next }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; data?: ModeState } | null;
      if (!r.ok || !j?.ok) throw new Error("mode_failed");
      if (j.data) setState(j.data);
      setLive(next === "demo" ? "Demo: replaying recorded results of real runs." : "Live AI: calling OpenAI, Firecrawl and ElevenLabs now.");
      startTransition(() => router.refresh());
    } catch {
      setMode(prev);
      toast.error("Couldn't switch mode", { description: "Nothing changed. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const current = OPTIONS.find((o) => o.value === mode)?.label;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="hidden sm:block">
        <Segments mode={mode} busy={busy} onChoose={choose} idPrefix="ks-mode" />
      </div>
      <Popover>
        <PopoverTrigger
          className={cn(
            "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border bg-card px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:border-transparent sm:bg-transparent sm:px-0",
          )}
        >
          <span aria-hidden className="text-foreground sm:hidden">{current ?? "Mode"}</span>
          <Info className="size-5" aria-hidden />
          <span className="sr-only">{current ? `Mode: ${current}. ` : ""}About Demo and Live AI</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-3 p-4">
          <PopoverTitle className="text-base font-semibold">Demo or Live AI</PopoverTitle>
          <PopoverDescription className="text-sm leading-6 text-foreground">{MODE_EXPLAINER}</PopoverDescription>
          <div className="sm:hidden">
            <Segments mode={mode} busy={busy} onChoose={choose} idPrefix="ks-mode-sheet" />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{recordingsSummary(state)}</p>
          {state?.demoModeEnv && (
            <p className="text-sm leading-6 text-muted-foreground">This server runs the offline demo, so both options show Keystone&apos;s built-in demo data here.</p>
          )}
        </PopoverContent>
      </Popover>
      <span className="sr-only" aria-live="polite">{live}</span>
    </div>
  );
}
