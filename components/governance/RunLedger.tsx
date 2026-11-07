"use client";
// The live run ledger: one row per agent run (table on desktop, stacked cards on mobile).
import { formatDistanceToNowStrict } from "date-fns";
import { AgentAvatar } from "@/components/keystone";
import type { AgentRunEntry } from "@/lib/agents/harness";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { GuardrailActionChip, StatusPill, YouDecideChip } from "./pills";

const NAMES = Object.fromEntries(AGENT_REGISTRY.map((e) => [e.agent, e.name])) as Record<string, string>;
export const agentName = (agent: string) => NAMES[agent] ?? agent;

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "–";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNowStrict(d, { addSuffix: true });
}

function Guardrails({ entry }: { entry: AgentRunEntry }) {
  if (!entry.guardrails.length) return <span className="text-sm text-muted-foreground">None needed</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Guardrail results">
      {entry.guardrails.map((g, i) => <li key={`${g.name}-${i}`}><GuardrailActionChip finding={g} /></li>)}
    </ul>
  );
}

function Checkpoint({ entry }: { entry: AgentRunEntry }) {
  if (!entry.checkpoint) return <span className="text-sm text-muted-foreground" aria-label="No human checkpoint">–</span>;
  return (
    <div className="space-y-1">
      <YouDecideChip kind={entry.checkpoint.kind} title={entry.checkpoint.note} />
      <p className="max-w-56 text-[13px] text-muted-foreground">{entry.checkpoint.note}</p>
    </div>
  );
}

function statusTitle(e: AgentRunEntry): string | undefined {
  return e.status === "fallback" ? `Fallback: ${e.fallbackReason ?? "safe default"}` : e.status === "error" ? e.error : undefined;
}

export function RunLedger({ runs }: { runs: AgentRunEntry[] }) {
  return (
    <>
      {/* Desktop / tablet: a real table */}
      <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Agent run ledger, newest first</caption>
          <thead className="border-b bg-muted/50 text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Agent</th>
              <th scope="col" className="px-4 py-3 font-medium">Purpose</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Duration</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Guardrails</th>
              <th scope="col" className="px-4 py-3 font-medium">Human checkpoint</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((e) => (
              <tr key={e.id} className="border-b align-top last:border-0">
                <th scope="row" className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    <AgentAvatar agent={e.agent} size={28} />
                    <span>{agentName(e.agent)}</span>
                  </span>
                </th>
                <td className="max-w-80 px-4 py-3">
                  <p>{e.purpose}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {when(e.startedAt)} · input <span className="font-mono">#{e.inputDigest}</span> · {e.model}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{formatDuration(e.durationMs)}</td>
                <td className="px-4 py-3"><StatusPill status={e.status} title={statusTitle(e)} /></td>
                <td className="px-4 py-3"><Guardrails entry={e} /></td>
                <td className="px-4 py-3"><Checkpoint entry={e} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per run */}
      <ul className="space-y-3 md:hidden" aria-label="Agent run ledger, newest first">
        {runs.map((e) => (
          <li key={e.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2 font-medium">
                <AgentAvatar agent={e.agent} size={28} />
                {agentName(e.agent)}
              </span>
              <StatusPill status={e.status} title={statusTitle(e)} />
            </div>
            <p className="mt-2 text-sm">{e.purpose}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              <span className="font-mono tabular-nums">{formatDuration(e.durationMs)}</span> · {when(e.startedAt)}
            </p>
            <div className="mt-3 space-y-2">
              <Guardrails entry={e} />
              {e.checkpoint && <Checkpoint entry={e} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
