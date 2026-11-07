"use client";
// One agent from the registry: its job, tools, guardrails, the human checkpoint and the fallback.
import { LifeBuoy, Wrench } from "lucide-react";
import { AgentAvatar } from "@/components/keystone";
import type { AgentRegistryEntry } from "@/lib/agents/registry";
import { GuardrailChip, YouDecideChip } from "./pills";

export function RegistryCard({ entry }: { entry: AgentRegistryEntry }) {
  const titleId = `agent-${entry.agent}-title`;
  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <header className="flex items-start gap-3">
        <AgentAvatar agent={entry.agent} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={titleId} className="text-lg font-semibold">{entry.name}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[13px] text-muted-foreground" title={`Owned by ${entry.owner}`}>{entry.owner}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{entry.role}</p>
        </div>
      </header>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
          <Wrench className="size-3.5" aria-hidden />Tools
        </h4>
        <p className="text-sm">{entry.tools.join(" · ")}</p>
      </div>

      <div>
        <h4 className="mb-1.5 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">Guardrails</h4>
        <ul className="flex flex-wrap gap-1.5" aria-label={`${entry.name} guardrails`}>
          {entry.guardrails.map((g) => <li key={g}><GuardrailChip name={g} /></li>)}
        </ul>
      </div>

      <div className="mt-auto space-y-3 border-t pt-4">
        {entry.humanCheckpoint ? (
          <div className="space-y-1.5">
            <YouDecideChip kind={entry.checkpointKind} />
            <p className="text-sm">{entry.humanCheckpoint}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No human checkpoint needed: it only suggests.</p>
        )}
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><span className="font-medium text-foreground">If it fails:</span> {entry.fallback}</span>
        </p>
      </div>
    </article>
  );
}
