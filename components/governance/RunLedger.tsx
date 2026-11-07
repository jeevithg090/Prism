"use client";
// The live run ledger: one row per agent run (a real table when the card is wide, stacked rows when it is not).
// Repeated runs in a row (same agent, same input, same outcome) fold into one row with a count.
import { formatDistanceToNowStrict } from "date-fns";
import { Minus } from "lucide-react";
import { AgentAvatar } from "@/components/keystone";
import type { AgentRunEntry, RunSource } from "@/lib/agents/harness";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { GuardrailActionChip, StatusPill, YouDecideChip } from "./pills";

const NAMES = Object.fromEntries(AGENT_REGISTRY.map((e) => [e.agent, e.name])) as Record<string, string>;
export const agentName = (agent: string) => NAMES[agent] ?? agent;

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "Not timed";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export type RunGroup = { entry: AgentRunEntry; count: number; runs: AgentRunEntry[] };

/** Folds consecutive runs of the same agent on the same input with the same outcome into one row (newest first). */
export function collapseRuns(runs: AgentRunEntry[]): RunGroup[] {
  const groups: RunGroup[] = [];
  for (const e of runs) {
    const last = groups.at(-1);
    if (last && last.entry.agent === e.agent && last.entry.inputDigest === e.inputDigest && last.entry.status === e.status) {
      last.runs.push(e);
      last.count += 1;
    } else {
      groups.push({ entry: e, count: 1, runs: [e] });
    }
  }
  return groups;
}

const SOURCE_LABEL: Record<Exclude<RunSource, "model">, string> = {
  replay: "Replayed from a recorded run",
  cache: "Cached result, no model call",
  rules: "Rules, no AI model",
};

function Source({ entry }: { entry: AgentRunEntry }) {
  const source = entry.source ?? (entry.model === "deterministic" ? "rules" : "model");
  return source === "model" ? <span className="font-mono">{entry.model}</span> : <span>{SOURCE_LABEL[source]}</span>;
}

function Duration({ ms }: { ms: number }) {
  const text = formatDuration(ms);
  const timed = Number.isFinite(ms) && ms >= 0;
  return <span className={timed ? "font-mono text-sm text-foreground tabular-nums" : "text-sm text-muted-foreground"}>{text}</span>;
}

function Repeats({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span className="rounded-md bg-muted px-1.5 text-sm text-foreground" title={`${count} runs in a row with the same input`}>
      <span className="font-mono tabular-nums">×{count}</span>
      <span className="sr-only"> runs in a row with the same input</span>
    </span>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNowStrict(d, { addSuffix: true });
}

function Guardrails({ entry }: { entry: AgentRunEntry }) {
  if (!entry.guardrails.length) return <span className="text-sm text-muted-foreground">None needed</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Guardrail results">
      {entry.guardrails.map((g, i) => <li key={`${g.name}-${i}`} className="max-w-full"><GuardrailActionChip finding={g} /></li>)}
    </ul>
  );
}

function Checkpoint({ entry }: { entry: AgentRunEntry }) {
  if (!entry.checkpoint) {
    // A quiet mark, so a real "You decide" is the only thing that stands out in this column.
    return (
      <>
        <Minus className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">No human checkpoint</span>
      </>
    );
  }
  return (
    <div className="space-y-1.5">
      <YouDecideChip kind={entry.checkpoint.kind} title={entry.checkpoint.note} />
      <p className="text-sm text-pretty text-muted-foreground">{entry.checkpoint.note}</p>
    </div>
  );
}

function Meta({ entry, count }: { entry: AgentRunEntry; count: number }) {
  const ago = when(entry.startedAt);
  return (
    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
      <time dateTime={entry.startedAt}>{count > 1 && ago ? `Latest ${ago}` : ago}</time>
      <span>Input <span className="font-mono">#{entry.inputDigest}</span></span>
      <Source entry={entry} />
    </p>
  );
}

function statusTitle(e: AgentRunEntry): string | undefined {
  return e.status === "fallback" ? `Fallback: ${e.fallbackReason ?? "safe default"}` : e.status === "error" ? e.error : undefined;
}

export function RunLedger({ runs }: { runs: AgentRunEntry[] }) {
  const groups = collapseRuns(runs);
  return (
    <>
      {/* Wide card: a real table. Who ran and how it ended lead each row. */}
      <div className="hidden @4xl:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Agent run ledger, newest first</caption>
          <thead className="text-sm text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="w-48 py-3 pr-3 pl-6 font-medium">Agent</th>
              <th scope="col" className="px-3 py-3 font-medium">Purpose</th>
              <th scope="col" className="w-72 px-3 py-3 font-medium">Guardrails</th>
              <th scope="col" className="w-52 py-3 pr-6 pl-3 font-medium">Human checkpoint</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ entry: e, count }) => (
              <tr key={e.id} className="border-t align-top first:border-t-0">
                <th scope="row" className="py-4 pr-3 pl-6 font-normal">
                  <span className="flex items-start gap-2.5">
                    <AgentAvatar agent={e.agent} size={32} />
                    <span className="min-w-0 space-y-1.5">
                      <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                        {agentName(e.agent)}
                        <Repeats count={count} />
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusPill status={e.status} title={statusTitle(e)} />
                        <Duration ms={e.durationMs} />
                      </span>
                    </span>
                  </span>
                </th>
                <td className="px-3 py-4">
                  <p className="text-base text-pretty text-foreground">{e.purpose}</p>
                  <Meta entry={e} count={count} />
                </td>
                <td className="px-3 py-4"><Guardrails entry={e} /></td>
                <td className="py-4 pr-6 pl-3"><Checkpoint entry={e} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow card: one stacked row per run, split by hairlines. */}
      <ul className="divide-y @4xl:hidden" aria-label="Agent run ledger, newest first">
        {groups.map(({ entry: e, count }) => (
          <li key={e.id} className="space-y-3 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5 text-base font-semibold">
                <AgentAvatar agent={e.agent} size={32} />
                {agentName(e.agent)}
                <Repeats count={count} />
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Duration ms={e.durationMs} />
                <StatusPill status={e.status} title={statusTitle(e)} />
              </span>
            </div>
            <div>
              <p className="text-base text-pretty">{e.purpose}</p>
              <Meta entry={e} count={count} />
            </div>
            <Guardrails entry={e} />
            {e.checkpoint && <Checkpoint entry={e} />}
          </li>
        ))}
      </ul>
    </>
  );
}
