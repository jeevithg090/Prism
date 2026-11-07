"use client";
// SCAFFOLD STUB (owner: P3). useActivity() + provider; P3 replaces it with the real Activity panel.
import * as React from "react";
import type { AgentEvent } from "@/lib/types";
type Ctx = { runId: string | null; events: AgentEvent[]; open: boolean; setOpen: (o: boolean) => void; start: (runId: string) => void };
const ActivityContext = React.createContext<Ctx | null>(null);
const noop: Ctx = { runId: null, events: [], open: false, setOpen: () => {}, start: () => {} };
export function useActivity(): Ctx { return React.useContext(ActivityContext) ?? noop; }
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [runId, setRunId] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<AgentEvent[]>([]);
  const [open, setOpen] = React.useState(false);
  const start = React.useCallback((id: string) => {
    setRunId(id); setEvents([]); setOpen(true);
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/agents/stream?runId=${id}`);
    es.addEventListener("agent", (m) => { const e = JSON.parse((m as MessageEvent).data) as AgentEvent; setEvents((p) => [...p, e]); if (e.agent === "orchestrator" && (e.status === "done" || e.status === "error")) es.close(); });
    es.onerror = () => es.close();
  }, []);
  return <ActivityContext.Provider value={{ runId, events, open, setOpen, start }}>{children}</ActivityContext.Provider>;
}
