"use client";
// One agent from the registry, set as a row: who it is and its job, its tools and guardrails,
// then the human checkpoint and the fallback. Columns line up when the registry card is wide.
import { LifeBuoy, Wrench } from "lucide-react";
import { AgentAvatar } from "@/components/keystone";
import type { AgentRegistryEntry } from "@/lib/agents/registry";
import { GuardrailChip, YouDecideChip } from "./pills";

export function RegistryCard({ entry }: { entry: AgentRegistryEntry }) {
  const titleId = `agent-${entry.agent}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className="grid gap-4 px-6 py-5 @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] @4xl:gap-8"
    >
      <header className="flex items-start gap-3">
        <AgentAvatar agent={entry.agent} size={40} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-lg font-semibold text-foreground">{entry.name}</h3>
          <span className="sr-only">{`Owned by ${entry.owner}`}</span>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{entry.role}</p>
        </div>
      </header>

      <dl className="space-y-3">
        <div>
          <dt className="text-sm font-medium text-muted-foreground @4xl:sr-only">Tools</dt>
          <dd className="mt-1 flex items-start gap-2 text-sm text-foreground @4xl:mt-0">
            <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{entry.tools.join(", ")}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-muted-foreground @4xl:sr-only">Guardrails</dt>
          <dd className="mt-1.5 @4xl:mt-0">
            <ul className="flex flex-wrap gap-1.5" aria-label={`${entry.name} guardrails`}>
              {entry.guardrails.map((g) => <li key={g}><GuardrailChip name={g} /></li>)}
            </ul>
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        {entry.humanCheckpoint ? (
          <div className="space-y-1.5">
            <YouDecideChip kind={entry.checkpointKind} />
            <p className="text-sm text-pretty text-foreground">{entry.humanCheckpoint}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No human checkpoint needed: it only suggests.</p>
        )}
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><span className="font-medium text-foreground">If it fails:</span> {entry.fallback}</span>
        </p>
      </div>
    </article>
  );
}
