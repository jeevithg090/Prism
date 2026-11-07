"use client";
// Story Mode: "don't trust the script". When a beat appears, the player calls the existing Keystone API behind
// it and compares what the API says now with what the narration says.
import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";
import type { StoryVerify } from "@/lib/labs/story/schema";
import { compareVerify, type VerifyOutcome } from "@/lib/labs/story/pure";

export type LiveState = { phase: "loading" } | { phase: "error"; message: string } | { phase: "done"; ms: number; outcome: VerifyOutcome };

export function useLiveCheck(id: string | undefined, verify: StoryVerify | null | undefined): LiveState | null {
  const [results, setResults] = React.useState<Record<string, LiveState>>({});
  const asked = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!id || !verify || asked.current.has(id)) return;
    asked.current.add(id);
    const t0 = performance.now();
    fetch(verify.path, { headers: { accept: "application/json" } })
      .then(async (res) => {
        const json = (await res.json()) as { ok: boolean; data?: unknown; error?: { message: string } };
        return json.ok
          ? ({ phase: "done", ms: Math.round(performance.now() - t0), outcome: compareVerify(verify, json.data) } as const)
          : ({ phase: "error", message: json.error?.message ?? `HTTP ${res.status}` } as const);
      })
      .catch(() => ({ phase: "error", message: "The API didn't answer." }) as const)
      .then((next: LiveState) => setResults((r) => ({ ...r, [id]: next })));
  }, [id, verify]);
  if (!id || !verify) return null;
  return results[id] ?? { phase: "loading" };
}

export function LiveCheck({ verify, state }: { verify: StoryVerify; state: LiveState | null }) {
  const api = <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm break-all">GET {verify.path}</code>;
  let icon: React.ReactNode;
  let text: React.ReactNode;
  if (!state || state.phase === "loading") {
    icon = <Loader2 className="size-5 shrink-0 text-muted-foreground motion-safe:animate-spin" aria-hidden />;
    text = <>{verify.label}: checking against {api}</>;
  } else if (state.phase === "error") {
    icon = <CircleSlash className="size-5 shrink-0 text-status-gap" aria-hidden />;
    text = <>{verify.label}: couldn&apos;t check {api}. {state.message}</>;
  } else if (state.outcome.status === "match") {
    icon = <CheckCircle2 className="size-5 shrink-0 text-status-proven" aria-hidden />;
    text = <>{verify.label}: <span className="font-mono font-semibold tabular-nums">{state.outcome.actual}</span>, checked live against {api} in {state.ms} ms. It matches the narration.</>;
  } else {
    icon = <AlertTriangle className="size-5 shrink-0 text-status-rising" aria-hidden />;
    const o = state.outcome;
    text = o.status === "missing"
      ? <>{verify.label}: {api} has no value right now (the script said {o.expected}).</>
      : <>{verify.label} changed since the script was built: {api} now says <span className="font-mono font-semibold tabular-nums">{o.actual}</span> (script: {o.expected}). Restart to rebuild it.</>;
  }
  return (
    <p role="status" className="flex items-start gap-2 text-sm">
      {icon}<span className="min-w-0">{text}</span>
    </p>
  );
}
