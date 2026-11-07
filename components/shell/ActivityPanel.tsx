"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AgentEvent } from "@/lib/types";
import { AgentAvatar } from "@/components/keystone";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiPost } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";

type ActivityContextValue = {
  runId: string | null;
  events: AgentEvent[];
  open: boolean;
  setOpen: (open: boolean) => void;
  start: (runId: string) => void;
};
const ActivityContext = createContext<ActivityContextValue | null>(null);
const emptyContext: ActivityContextValue = { runId: null, events: [], open: false, setOpen: () => {}, start: () => {} };
export function useActivity() { return useContext(ActivityContext) ?? emptyContext; }

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [open, setOpen] = useState(false);
  const source = useRef<EventSource | null>(null);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((id: string) => {
    source.current?.close();
    if (poller.current) clearInterval(poller.current);
    setRunId(id); setEvents([]); setOpen(true);
    if (typeof EventSource === "undefined") return;
    let failures = 0;
    const stream = new EventSource(`/api/agents/stream?runId=${encodeURIComponent(id)}`);
    source.current = stream;
    stream.addEventListener("agent", (message) => {
      try {
        const event = JSON.parse((message as MessageEvent<string>).data) as AgentEvent;
        setEvents((previous) => [...previous, event]);
        if (event.agent === "orchestrator" && (event.status === "done" || event.status === "error")) {
          stream.close(); if (poller.current) clearInterval(poller.current);
        }
      } catch { /* ignore malformed stream messages */ }
    });
    stream.onerror = () => {
      failures += 1;
      if (failures !== 2) return;
      stream.close();
      poller.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/agents/stream?runId=${encodeURIComponent(id)}&poll=1`);
          if (!response.ok) return;
          const result = await response.json() as { data?: AgentEvent[]; events?: AgentEvent[] };
          const incoming = result.data ?? result.events ?? [];
          setEvents((previous) => {
            const seen = new Set(previous.map((event) => `${event.runId}:${event.agent}:${event.status}:${event.ts}`));
            return [...previous, ...incoming.filter((event) => !seen.has(`${event.runId}:${event.agent}:${event.status}:${event.ts}`))];
          });
          if (incoming.some((event) => event.agent === "orchestrator" && (event.status === "done" || event.status === "error")) && poller.current) {
            clearInterval(poller.current); poller.current = null;
          }
        } catch { /* retry on the next poll */ }
      }, 1000);
    };
  }, []);

  useEffect(() => () => { source.current?.close(); if (poller.current) clearInterval(poller.current); }, []);
  const value = useMemo(() => ({ runId, events, open, setOpen, start }), [runId, events, open, start]);
  return <ActivityContext.Provider value={value}>{children}<ActivityPanel/></ActivityContext.Provider>;
}

function emphasizeNumbers(message: string) {
  return message.split(/(\d+%?)/g).map((part, index) => /^\d+%?$/.test(part)
    ? <span key={index} className="font-mono font-semibold text-foreground">{part}</span> : part);
}

export function ActivityPanel() {
  const { events, open, setOpen, start } = useActivity();
  const completed = events.some((event) => event.agent === "orchestrator" && event.status === "done");
  async function replay() {
    try { const result = await apiPost<{ runId: string }>("/api/onboard/run", { userId: "aisha" }); start(result.runId); }
    catch { toast.error("The demo run isn't available yet. Try again when the agents are connected."); }
  }
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[420px]" aria-live="polite">
      <SheetHeader><SheetTitle className="text-xl">Agents at work</SheetTitle><SheetDescription><span className="mr-2 inline-block size-2 rounded-full bg-emerald-500"/>Live · 9 agents</SheetDescription></SheetHeader>
      {completed && <div className="mx-4 rounded-xl border border-status-proven/30 bg-status-proven/10 p-4"><p className="font-semibold">Bridge ready · 38% → 84%</p><Link href="/map" className="mt-2 inline-block text-sm font-medium text-primary">See my Bridge Map →</Link></div>}
      {events.length === 0 ? <div className="px-5 py-10 text-center"><Sparkles className="mx-auto text-primary"/><p className="mt-3 text-sm text-muted-foreground">No agents running. Start onboarding or replay the demo run.</p><Button onClick={replay} className="mt-4 min-h-11">Replay demo run</Button></div> :
        <ol className="space-y-4 px-4 py-5">{events.map((event, index) => <li key={`${event.runId}-${event.ts}-${index}`} className="flex gap-3">
          <AgentAvatar agent={event.agent} size={36}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="capitalize">{event.agent}</strong>{event.status === "done" ? <CheckCircle2 size={16} className="text-status-proven"/> : event.status === "error" ? <AlertTriangle size={16} className="text-status-gap"/> : <LoaderCircle size={16} className="animate-spin text-primary"/>}</div>
          <p className="mt-1 text-sm text-muted-foreground">{emphasizeNumbers(event.message)}</p><time dateTime={event.ts} className="mt-1 block text-xs text-muted-foreground">{new Date(event.ts).toLocaleTimeString()}</time></div>
        </li>)}</ol>}
    </SheetContent>
  </Sheet>;
}
