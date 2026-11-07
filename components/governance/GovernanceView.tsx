"use client";
// /governance: "How Keystone's agents are governed". The registry of every agent (job, tools,
// guardrails, human checkpoint, fallback), the live run ledger, and the EU AI Act stance.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoDataNote, EmptyState, ErrorState, PageHeader, StatCard } from "@/components/keystone";
import type { AgentRunEntry } from "@/lib/agents/harness";
import { AGENT_REGISTRY, type AgentRegistryEntry } from "@/lib/agents/registry";
import { apiGet } from "@/lib/fetcher";
import { AiActPanel } from "./AiActPanel";
import { RegistryCard } from "./RegistryCard";
import { RunLedger } from "./RunLedger";

export const LEDGER_POLL_MS = 5000;

export function GovernanceView() {
  const reduce = useReducedMotion();
  const [demoRegistry, setDemoRegistry] = React.useState(false);
  const [demoRuns, setDemoRuns] = React.useState(false);

  const registry = useQuery({
    queryKey: ["agents-registry", demoRegistry],
    queryFn: () => (demoRegistry ? Promise.resolve(AGENT_REGISTRY) : apiGet<AgentRegistryEntry[]>("/api/agents/registry")),
    staleTime: Infinity,
  });
  const runs = useQuery({
    queryKey: ["agents-runs", demoRuns],
    queryFn: () => apiGet<AgentRunEntry[]>(`/api/agents/runs?limit=50${demoRuns ? "&demo=1" : ""}`),
    refetchInterval: demoRuns ? false : LEDGER_POLL_MS,
  });

  const showSampleRuns = () => {
    setDemoRuns(true);
    toast("Showing sample agent runs", { description: "Real runs appear here as soon as an agent works for you." });
  };
  const refresh = async () => {
    const r = await runs.refetch();
    if (r.data) toast.success(`Ledger refreshed · ${r.data.length} ${r.data.length === 1 ? "run" : "runs"}`);
  };

  const list = runs.data ?? [];
  const guarded = list.reduce((n, e) => n + e.guardrails.filter((g) => g.action !== "pass").length, 0);
  const checkpoints = list.filter((e) => e.checkpoint).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="How Keystone's agents are governed"
        subtitle="Agents propose, people decide. Every agent has one job, guardrails, a fallback and a log you can read."
      />

      <AiActPanel />

      <section aria-labelledby="ledger-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="ledger-title" className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
              Run ledger {demoRuns && <DemoDataNote />}
            </h2>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Every agent run, newest first: how long it took, which guardrails acted, and who decides next.
              Inputs are kept as a short fingerprint, never as your data.
            </p>
          </div>
          <Button variant="outline" className="h-10 rounded-xl" onClick={refresh} disabled={runs.isFetching} aria-label="Refresh the run ledger">
            <RefreshCw className={runs.isFetching && !reduce ? "animate-spin" : undefined} aria-hidden />
            Refresh
          </Button>
        </div>

        {runs.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">Loading the run ledger…</span>
            <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
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
            action={<Button size="lg" className="h-10 rounded-xl" onClick={showSampleRuns}>Show sample runs</Button>}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">
              <StatCard label="Agent runs logged" value={list.length} hint={`Latest ${agoShort(list[0]?.startedAt)}`} />
              <StatCard label="Guardrail actions" value={guarded} hint="Outputs a guardrail changed or stopped" />
              <StatCard label="Human checkpoints" value={checkpoints} hint="Runs where a person makes the call" />
            </div>
            <RunLedger runs={list} />
          </div>
        )}
      </section>

      <section aria-labelledby="registry-title" className="space-y-4">
        <div>
          <h2 id="registry-title" className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
            Every agent, its job and its limits {demoRegistry && <DemoDataNote />}
          </h2>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            {registry.data ? `${registry.data.length} specialised agents.` : "Specialised agents."} Each has typed inputs and outputs, a safe fallback,
            and a <span className="font-medium text-primary">You decide</span> checkpoint wherever a step matters.
          </p>
        </div>

        {registry.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            <span className="sr-only">Loading the agent registry…</span>
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
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
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Keystone agents">
            {registry.data.map((entry, i) => (
              <motion.li
                key={entry.agent}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.04, ease: "easeOut" }}
              >
                <RegistryCard entry={entry} />
              </motion.li>
            ))}
          </ul>
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
