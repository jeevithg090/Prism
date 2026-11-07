"use client";
// /governance: "How Keystone's agents are governed". The EU AI Act stance leads (it must sit in the first
// fold on a projector), then the live run ledger (newest runs first, capped so it never takes over the page:
// every agent run, its guardrails and who decides next), then the registry of every agent
// (job, tools, guardrails, human checkpoint, fallback) set as rows, not a wall of cards.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/keystone";
import type { AgentRunEntry } from "@/lib/agents/harness";
import { AGENT_REGISTRY, type AgentRegistryEntry } from "@/lib/agents/registry";
import { apiGet } from "@/lib/fetcher";
import { AiActPanel } from "./AiActPanel";
import { RegistryCard } from "./RegistryCard";
import { RunLedger } from "./RunLedger";

export const LEDGER_POLL_MS = 5000;
/** Rows the ledger shows before "Show all": the 5-second poll can add up to 50 runs during a live demo. */
export const LEDGER_PREVIEW_ROWS = 6;

export function GovernanceView() {
  const [demoRegistry, setDemoRegistry] = React.useState(false);
  const [demoRuns, setDemoRuns] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const registry = useQuery({
    queryKey: ["agents-registry", demoRegistry],
    queryFn: () => (demoRegistry ? Promise.resolve(AGENT_REGISTRY) : apiGet<AgentRegistryEntry[]>("/api/agents/registry")),
    staleTime: Infinity,
  });
  const runs = useQuery({
    queryKey: ["agents-runs", demoRuns],
    queryFn: async () => {
      const rows = await apiGet<AgentRunEntry[]>(`/api/agents/runs?limit=50${demoRuns ? "&demo=1" : ""}`);
      // Presenting with ?demo=1 on a fresh deploy: an empty ledger leaves the governance story without
      // evidence, so it switches to the sample runs (tagged "Demo data") until real runs exist.
      if (!demoRuns && rows.length === 0 && new URLSearchParams(window.location.search).get("demo") === "1") setDemoRuns(true);
      return rows;
    },
    refetchInterval: demoRuns ? false : LEDGER_POLL_MS,
  });

  const showSampleRuns = () => {
    setDemoRuns(true);
    toast("Showing sample agent runs", { description: "Real runs appear here as soon as an agent works for you." });
  };
  const refresh = async () => {
    const r = await runs.refetch();
    if (r.data) toast.success(`Ledger refreshed: ${r.data.length} ${r.data.length === 1 ? "run" : "runs"}`);
  };

  const list = runs.data ?? [];
  const guarded = list.reduce((n, e) => n + e.guardrails.filter((g) => g.action !== "pass").length, 0);
  const checkpoints = list.filter((e) => e.checkpoint).length;
  const stats = [
    { label: "Agent runs logged", value: list.length, hint: `Latest ${agoShort(list[0]?.startedAt)}` },
    { label: "Guardrail actions", value: guarded, hint: "Outputs a guardrail changed or stopped" },
    { label: "Human checkpoints", value: checkpoints, hint: "Runs where a person makes the call" },
  ];

  return (
    <div className="space-y-10 pb-16">
      <PageHeader
        title="How Keystone's agents are governed"
        subtitle="Agents propose, people decide. Every agent has one job, guardrails, a fallback and a log you can read."
      />

      <AiActPanel />

      <section aria-labelledby="ledger-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="ledger-title" className="flex flex-wrap items-center gap-2 text-xl font-semibold text-foreground">
              Run ledger {demoRuns && <DemoDataNote />}
            </h2>
            <p className="mt-1 max-w-[68ch] text-pretty text-muted-foreground">
              Every agent run, newest first: how long it took, which guardrails acted, and who decides next.
              Inputs are kept as a short fingerprint, never as your data.
            </p>
          </div>
          <Button
            variant="outline"
            className="self-start focus-visible:outline-ring active:translate-y-px disabled:opacity-55 sm:self-auto"
            onClick={refresh}
            disabled={runs.isFetching}
            aria-label="Refresh the run ledger"
          >
            {runs.isFetching ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            Refresh
          </Button>
        </div>

        {runs.isPending ? (
          <div aria-busy="true">
            <span className="sr-only">Loading the run ledger…</span>
            <LoadingSkeleton variant="list" />
          </div>
        ) : runs.isError ? (
          <ErrorState
            title="We couldn't load the run ledger"
            body={`${runs.error.message || "The connection dropped."} You can try again, or look at sample runs.`}
            onRetry={() => runs.refetch()}
            onUseDemo={showSampleRuns}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No agent runs yet"
            body="When you find a pod, start a project or look for guides, each agent step is logged here."
            action={<Button size="lg" onClick={showSampleRuns}>Show sample runs</Button>}
          />
        ) : (
          <div className="@container rounded-2xl border bg-card shadow-sm">
            <div className="grid divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-live="polite">
              {stats.map((s) => (
                <div key={s.label} className="grid grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)] items-baseline gap-x-4 px-6 py-4 sm:block sm:py-6">
                  <p className="row-span-2 font-mono text-4xl leading-none font-semibold text-foreground tabular-nums">{s.value}</p>
                  <p className="text-sm font-medium text-foreground sm:mt-3">{s.label}</p>
                  <p className="text-sm text-muted-foreground sm:mt-1">{s.hint}</p>
                </div>
              ))}
            </div>
            <RunLedger runs={expanded ? list : list.slice(0, LEDGER_PREVIEW_ROWS)} />
            {list.length > LEDGER_PREVIEW_ROWS && (
              <div className="border-t px-6 py-4">
                <Button variant="outline" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? `Show the latest ${LEDGER_PREVIEW_ROWS} runs` : `Show all ${list.length} runs`}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="registry-title" className="space-y-4">
        <div>
          <h2 id="registry-title" className="flex flex-wrap items-center gap-2 text-xl font-semibold text-foreground">
            Every agent, its job and its limits {demoRegistry && <DemoDataNote />}
          </h2>
          <p className="mt-1 max-w-[68ch] text-pretty text-muted-foreground">
            {registry.data ? `${registry.data.length} specialised agents.` : "Specialised agents."} Each has typed inputs and outputs, a safe fallback,
            and a <span className="font-semibold text-foreground">You decide</span> checkpoint wherever a step matters.
          </p>
        </div>

        {registry.isPending ? (
          <div aria-busy="true">
            <span className="sr-only">Loading the agent registry…</span>
            <LoadingSkeleton variant="list" />
          </div>
        ) : registry.isError ? (
          <ErrorState
            title="We couldn't load the agent registry"
            body={registry.error.message || "Something went wrong on our side."}
            onRetry={() => registry.refetch()}
            onUseDemo={() => setDemoRegistry(true)}
          />
        ) : registry.data.length === 0 ? (
          <EmptyState icon={ScrollText} title="No agents registered" body="The registry is empty right now." />
        ) : (
          <div className="@container rounded-2xl border bg-card shadow-sm">
            <div aria-hidden className="hidden gap-8 border-b px-6 py-3 text-sm font-medium text-muted-foreground @4xl:grid @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <span>Agent</span>
              <span>Tools and guardrails</span>
              <span>Human checkpoint and fallback</span>
            </div>
            <ul className="divide-y" aria-label="Keystone agents">
              {registry.data.map((entry) => (
                <li key={entry.agent}>
                  <RegistryCard entry={entry} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function agoShort(iso: string | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} days ago`;
}
