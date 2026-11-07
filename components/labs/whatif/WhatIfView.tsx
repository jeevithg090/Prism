"use client";
// /labs/whatif: two plans side by side, 200 simulated futures each, from your Bridge Map, your roadmap and the
// demand forecast. Move a slider and the futures re-run; adopt one and the Roadmap Agent proposes it, you decide.
import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Activity, CheckCircle2, Map as MapIcon, RotateCcw, Split, TriangleAlert } from "lucide-react";
import { DemoDataNote, EmptyState, ErrorState, PageHeader, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { useViewerId } from "@/components/community/useViewerId";
import { apiGet, apiPost } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { AdoptDialog } from "./AdoptDialog";
import { FuturesChart } from "./FuturesChart";
import { adoptChanges, dayLabel, favoured, PLAN_COLOR, type PlanSpec, type ProposalResponse, type SimResponse, type WhatIfContextView } from "./model";
import { PlanCard } from "./PlanCard";

const SUBTITLE = "Try two futures before you spend the hours. Built from your Bridge Map, your roadmap and the hiring forecast.";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function WhatIfSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the What-if Simulator">
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <Skeleton className="h-40 w-full rounded-2xl lg:col-start-2 lg:row-start-1" />
        <div className="space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">{[0, 1].map((i) => <Skeleton key={i} className="h-[30rem] w-full rounded-2xl" />)}</div>
        <Skeleton className="h-[26rem] w-full rounded-2xl lg:col-start-2 lg:row-start-2" />
      </div>
    </div>
  );
}

export function WhatIfView({ demo = false }: { demo?: boolean }) {
  const viewer = useViewerId();
  const [useDemo, setUseDemo] = React.useState(demo);
  const uid = useDemo ? "aisha" : viewer;
  const qc = useQueryClient();
  const activity = useActivity();
  const reduce = useReducedMotion();

  const context = useQuery({
    queryKey: ["whatif", uid],
    queryFn: () => apiGet<WhatIfContextView>(`/api/labs/whatif?userId=${encodeURIComponent(uid)}`),
    retry: 0,
  });

  // null = the defaults from the server (the Roadmap Agent's order vs its runner-up, at your hours).
  const [plans, setPlans] = React.useState<PlanSpec[] | null>(null);
  const current = plans ?? context.data?.defaults ?? null;
  const debounced = useDebounced(current, 250);

  const sim = useQuery({
    queryKey: ["whatif-sim", uid, debounced],
    queryFn: () => apiPost<SimResponse>("/api/labs/whatif/simulate", { userId: uid, plans: debounced }),
    enabled: !!debounced && !!context.data,
    placeholderData: keepPreviousData,
    retry: 0,
  });

  const [proposal, setProposal] = React.useState<ProposalResponse | null>(null);
  const propose = useMutation({
    mutationFn: (plan: PlanSpec) => apiPost<ProposalResponse>("/api/labs/whatif/adopt", { action: "propose", userId: uid, plan }),
    onSuccess: (p) => {
      if (p.status === "unchanged") toast("That's already your roadmap", { description: "Same weeks and the same hours, so there's nothing to approve." });
      else setProposal(p);
    },
    onError: (e) => toast.error("We couldn't draft that roadmap", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });
  const decide = useMutation({
    mutationFn: (v: { action: "approve" | "decline" | "undo"; proposalId: string }) => apiPost<ProposalResponse>("/api/labs/whatif/adopt", { ...v, userId: uid }),
    onSuccess: (p, v) => {
      setProposal(null);
      void qc.invalidateQueries({ queryKey: ["roadmap", uid] });
      void qc.invalidateQueries({ queryKey: ["whatif", uid] });
      void qc.invalidateQueries({ queryKey: ["profile", uid] });
      if (v.action === "approve") {
        activity.start(p.runId);
        toast.success(`Roadmap v${p.roadmapVersion} now follows "${p.plan.label}"`, {
          description: `Week 1 is ${p.weeks[0]?.name ?? "ready"}. Open your roadmap to see every week.`,
          action: { label: "Undo", onClick: () => decide.mutate({ action: "undo", proposalId: p.id }) },
        });
      } else if (v.action === "undo") {
        toast("Your previous roadmap is back", { description: "Nothing else changed." });
      } else {
        toast("You kept your roadmap", { description: "Nothing changed." });
      }
    },
    onError: (e) => toast.error("That didn't go through", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  if (context.isPending) return (<><PageHeader title="What-if Simulator" subtitle={SUBTITLE} /><WhatIfSkeleton /></>);
  if (context.isError) {
    const notFound = /no bridge map/i.test(context.error.message);
    return (
      <>
        <PageHeader title="What-if Simulator" subtitle={SUBTITLE} />
        {notFound ? (
          <EmptyState icon={MapIcon} title="No Bridge Map to start from yet" body="The simulator tries futures from your map and roadmap. Finish onboarding and your first futures appear here." action={<Link href="/onboard" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>Build my Bridge Map</Link>} />
        ) : (
          <ErrorState title="We couldn't load your plans" body="That's on us, not you. Your roadmap is unchanged." onRetry={() => void context.refetch()} onUseDemo={!useDemo ? () => setUseDemo(true) : undefined} />
        )}
      </>
    );
  }

  const ctx = context.data;
  const shown = current ?? ctx.defaults;
  const data = sim.data;
  const stale = sim.isFetching || JSON.stringify(debounced) !== JSON.stringify(shown);
  const pick = data ? favoured(data) : "a";
  const setPlan = (next: PlanSpec) => setPlans((ps) => (ps ?? ctx.defaults).map((p) => (p.id === next.id ? next : p)));

  return (
    <>
      <PageHeader
        title="What-if Simulator"
        subtitle={SUBTITLE}
        actions={
          <>
            {ctx.demo && <DemoDataNote />}
            <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => setPlans(null)}>
              <RotateCcw aria-hidden />Reset plans
            </Button>
            <Button variant="outline" className="h-10 rounded-xl px-4" disabled={!data?.runId} onClick={() => data?.runId && activity.start(data.runId)}>
              <Activity aria-hidden />Watch the agents
            </Button>
          </>
        }
      />

      {/* The verdict comes first in the DOM, so on phones and narrow windows the headline result sits above the two
          plan cards; from lg the cards take the left column and the verdict, chart and proofs the right. */}
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          {!data && sim.isError ? (
            <ErrorState title="We couldn't run those futures" body={sim.error.message} onRetry={() => void sim.refetch()} onUseDemo={!useDemo ? () => setUseDemo(true) : undefined} />
          ) : !data ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <p className="text-muted-foreground" aria-live="polite">Running {ctx.runs} futures for each plan.</p>
            </div>
          ) : (
              <SectionCard title={`Your two futures to ${ctx.targetLabel}`} description={`${ctx.name.split(" ")[0]}, you're ${Math.round(ctx.readinessNow * 100)}% ready for ${ctx.role} roles today. ${data.runs} futures per plan, the same futures for both, so the comparison is fair.`}>
                <motion.p
                  key={data.comparison?.verdict ?? data.plans[0].label}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  aria-live="polite"
                  className="text-xl font-medium text-balance md:text-2xl"
                >
                  {data.comparison?.verdict ?? `${data.plans[0].label} is your only plan. Change plan B to compare.`}
                </motion.p>
                {sim.isError && (
                  <p role="alert" className="mt-3 flex items-center gap-2 text-sm">
                    <TriangleAlert className="size-4 text-status-gap" aria-hidden />That change didn&apos;t simulate, so you&apos;re seeing the last result.
                    <button type="button" onClick={() => void sim.refetch()} className="rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">Retry</button>
                  </p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
                  {data.plans.map((p) => {
                    const spec = shown.find((c) => c.id === p.id) ?? p.spec;
                    const changes = adoptChanges(spec, ctx);
                    return (
                      <Button
                        key={p.id}
                        variant={p.id === pick ? "default" : "outline"}
                        className="h-10 rounded-xl px-4"
                        disabled={propose.isPending || stale || !changes}
                        onClick={() => propose.mutate(spec)}
                      >
                        {changes ? <span className="size-2.5 rounded-full" style={{ background: PLAN_COLOR[p.id] }} aria-hidden /> : <CheckCircle2 aria-hidden />}
                        {changes ? `Adopt ${p.label}` : `${p.label} is your roadmap`}
                      </Button>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">Adopting asks the Roadmap Agent to draft it as your roadmap. You see every change and decide.</p>
              </SectionCard>
          )}
        </div>

        <div className="space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {shown.map((p) => (
            <PlanCard key={p.id} spec={p} ctx={ctx} result={data?.plans.find((r) => r.id === p.id)} onChange={setPlan} stale={stale} />
          ))}
        </div>

        <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-2">
          {!data ? (
            sim.isError ? null : <Skeleton className="h-[26rem] w-full rounded-2xl" />
          ) : (
            <>
              <SectionCard title="Readiness, week by week" description="Each line is the middle future. The shaded band holds 8 of 10 futures.">
                <FuturesChart sim={data} targetLabel={ctx.targetLabel} />
              </SectionCard>

              <SectionCard title="When each proof lands" description={`Your roadmap's ${data.queue.length} focus skills, in the order each plan learns them. A proof is a merged PR, rung 2 of your Proof Ladder.`}>
                <div className="grid gap-6 md:grid-cols-2">
                  {data.plans.map((p) => (
                    <div key={p.id} className="min-w-0">
                      <h3 className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full" style={{ background: PLAN_COLOR[p.id] }} aria-hidden />{p.label}</h3>
                      <ol className="mt-2 divide-y">
                        {p.milestones.map((m, i) => (
                          <li key={m.skillId} className="flex items-baseline justify-between gap-3 py-2">
                            <span className="min-w-0"><span className="font-mono text-sm text-muted-foreground tabular-nums">{i + 1}.</span> {m.name}{m.slowStart && <span className="text-sm text-muted-foreground"> (prerequisite missing)</span>}</span>
                            <span className="shrink-0 text-right tabular-nums">{m.date ? dayLabel(m.date, true) : <span className="text-muted-foreground">after {ctx.targetLabel}</span>}</span>
                          </li>
                        ))}
                      </ol>
                      {p.notes.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                          {p.notes.map((n) => <li key={n}>{n}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="How the futures are made" description="Every number comes from Keystone's own data and rules. These are the assumptions, so you can judge them.">
                <ul className="divide-y">
                  {ctx.assumptions.map((a) => (
                    <li key={a.id} className="py-3">
                      <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-status-proven" aria-hidden />{a.label}</p>
                      <p className="mt-1 text-muted-foreground">{a.text}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Source: {a.source}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                  <Split className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Decision support, not a prediction. The bands show how sure the model is, and &ldquo;8 of 10 futures&rdquo; counts the {ctx.runs} simulated ones.
                </p>
              </SectionCard>
            </>
          )}
        </div>
      </div>

      <AdoptDialog
        proposal={proposal}
        ctx={ctx}
        busy={decide.isPending ? (decide.variables?.action === "decline" ? "decline" : "approve") : null}
        onApprove={() => proposal && decide.mutate({ action: "approve", proposalId: proposal.id })}
        onDecline={() => {
          if (proposal) decide.mutate({ action: "decline", proposalId: proposal.id });
        }}
      />
    </>
  );
}
