"use client";
// Readiness Explained (/labs/shapley): what makes up your readiness, source by source, what moved it this week,
// and the one proof that raises it most per hour. Data: GET /api/labs/shapley; the choice: POST …/commit.
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, Map as MapIcon, Sigma } from "lucide-react";
import { toast } from "sonner";
import { DemoDataNote, EmptyState, ErrorState, ReadinessRing, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewerId } from "@/components/community/useViewerId";
import { useActivity } from "@/components/shell/ActivityPanel";
import { COVERAGE } from "@/lib/graph/readiness";
import type { Explanation, NextAction } from "@/lib/labs/shapley/model";
import type { ApiResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fmt1, signed } from "./format";
import { NextProof } from "./NextProof";
import { Waterfall } from "./Waterfall";
import { WeekChange } from "./WeekChange";

class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let json: ApiResult<T>;
  try { json = (await res.json()) as ApiResult<T>; } catch { throw new HttpError("The server sent something we couldn't read.", res.status); }
  if (!json.ok) throw new HttpError(json.error.message, res.status);
  return json.data;
}

/** The same explainer, run in the browser on Aisha's seeded fixtures ("Use demo data" when the API is down). */
async function demoExplanation(): Promise<Explanation> {
  const [{ explainReadiness }, { skillName }, map, evidence, programme, roadmap] = await Promise.all([
    import("@/lib/labs/shapley/explain"),
    import("@/lib/schemas/community"),
    import("@/data/fixtures/bridgemap.aisha.ml-engineer.json"),
    import("@/data/fixtures/evidence.aisha.json"),
    import("@/data/fixtures/programme.uom-bsc-cs.json"),
    import("@/data/fixtures/roadmap.aisha.ml-engineer.json"),
  ]);
  return explainReadiness({
    map: map.default as never, evidence: evidence.default as never, programme: programme.default as never, roadmap: roadmap.default as never,
    startedAt: "2026-09-21", challenges: [], hoursPerWeek: 8, firstName: "Aisha", roleName: "ML engineer", now: new Date(), skillName,
  });
}

export function ExplainedSkeleton() {
  return (
    <div role="status" aria-label="Working out what makes up your readiness" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-6"><Skeleton className="size-[120px] rounded-full md:size-40" /><div className="flex-1 space-y-2"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div></div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem] items-center gap-4 py-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 rounded-full" style={{ marginLeft: `${i * 12}%`, width: `${30 - i * 4}%` }} /><Skeleton className="h-4 w-full" /></div>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-[28rem] w-full rounded-2xl" />
    </div>
  );
}

function headlineSentence(x: Explanation): string {
  const top = x.contributors.filter((c) => c.points > 0);
  const named = top.slice(0, 3).map((c) => `${c.label.replace(/ \(recorded\)$/, "")} ${signed(c.points)}`);
  const more = top.length - named.length;
  return `${Math.round(x.readiness.now * 100)}% = ${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

const EVIDENCE_NOUN: Record<string, [string, string]> = {
  "GitHub evidence": ["GitHub item", "GitHub items"],
  "Pod pull requests": ["merged pod PR", "merged pod PRs"],
  "Micro-challenges": ["micro-challenge", "micro-challenges"],
  "Mock interviews": ["mock interview", "mock interviews"],
  Certificates: ["certificate", "certificates"],
};

function groupSummary(x: Explanation): string {
  const parts = x.groups.filter((g) => g.points > 0.05).map((g) => {
    const what = g.kind === "module" ? `${g.count} degree ${g.count === 1 ? "module" : "modules"}`
      : g.kind === "evidence" ? `${g.count} ${EVIDENCE_NOUN[g.label]?.[g.count === 1 ? 0 : 1] ?? (g.count === 1 ? "piece of evidence" : "pieces of evidence")}`
      : `${g.count} recorded ${g.count === 1 ? "skill" : "skills"}`;
    return `${fmt1(g.points)} points from ${what}`;
  });
  if (!parts.length) return "Nothing counts toward your readiness yet.";
  const d = x.readiness.adjustmentPoints;
  const adj = !x.readiness.adjustmentNote ? ""
    : d > 0 ? ` The last ${fmt1(d)} points are your stored score's adjustment, not a source.`
    : ` Your stored score sits ${fmt1(-d)} points below that sum: an adjustment, not a source.`;
  return `Your ${Math.round(x.readiness.now * 100)}% splits into ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}.${adj}`;
}

interface Committed { actionId: string; noteText: string; committedAt: string }

function Explained({ x, runId, demo, live, committed = null }: { x: Explanation; runId: string | null; demo: boolean; live: boolean; committed?: Committed | null }) {
  const { start } = useActivity();
  const [saved, setSaved] = React.useState<string | null>(committed?.noteText ?? null);
  const commit = useMutation({
    mutationFn: (a: NextAction) =>
      request<{ noteText: string; runId: string; action: NextAction }>("/api/labs/shapley/commit", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionId: a.id, approved: true }),
      }),
    onSuccess: (r) => {
      setSaved(r.noteText);
      toast.success(`${r.action.skillName} is your next proof`, { description: "Your Coach will plan your week around it." });
    },
    onError: (e: Error) => toast.error("We couldn't save your choice", { description: e.message }),
  });
  const pct = Math.round(x.readiness.now * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-6">
        <SectionCard
          title={`Where your ${pct}% comes from`}
          description="Each bar is one source's exact share of your score, worked out with Shapley values. The bars add up to the whole."
          actions={demo ? <DemoDataNote /> : undefined}
        >
          <div className="space-y-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <ReadinessRing value={x.readiness.now} projected={x.readiness.projected} label={`ready for ${x.roleName}`} />
              <div className="min-w-0 space-y-2">
                <p className="text-lg font-medium text-balance">{headlineSentence(x)}</p>
                <p className="text-sm text-muted-foreground">
                  {x.firstName}, you&apos;re {pct}% of the way to {x.roleName} today and {Math.round(x.readiness.projected * 100)}% by your target date if you follow your roadmap.
                </p>
              </div>
            </div>
            {x.mode === "skills" && (
              <p role="note" className="rounded-xl border border-status-rising/25 bg-status-rising/10 px-3 py-2 text-sm text-foreground">
                Your evidence couldn&apos;t be read just now, so this splits readiness per skill only. Try again in a minute for the source-by-source view.
              </p>
            )}
            <figure className="space-y-3">
              <Waterfall x={x} />
              <figcaption className="text-sm text-muted-foreground">{groupSummary(x)}</figcaption>
            </figure>
          </div>
        </SectionCard>

        <SectionCard title="What moved this week" description="The change since a week ago, split the same way, with six weeks replayed from your evidence dates and module term ends.">
          <WeekChange x={x} />
        </SectionCard>
      </div>

      <div className="min-w-0 space-y-6">
        <SectionCard title="Your best next proof" description="The roadmap step that adds the most readiness for each hour you put in." className="lg:sticky lg:top-6">
          <NextProof
            x={x}
            pending={commit.isPending}
            savedNote={saved}
            onCommit={(a) => commit.mutate(a)}
            disabledReason={live ? undefined : "This is demo data from your browser, so there's nothing to save. Retry to load your own."}
          />
        </SectionCard>

        {x.insights.length > 0 && (
          <SectionCard title="What the split tells you">
            <ul className="space-y-3">
              {x.insights.map((s) => <li key={s} className="text-sm">{s}</li>)}
            </ul>
          </SectionCard>
        )}

        <SectionCard title="How it's worked out">
          <div className="space-y-3 text-sm">
            <p>
              Readiness adds up each skill&apos;s share of {x.roleName} job ads, times how well it&apos;s covered: proof counts {Math.round(COVERAGE.proven * 100)}%, a
              finished module {Math.round(COVERAGE["degree-done"] * 100)}%, a module still to come {Math.round(COVERAGE["degree-upcoming"] * 100)}%. When two sources cover the same skill, the Shapley value splits the overlap fairly, by averaging what each source adds
              over every order you could have gained them in.
            </p>
            <div className="flex gap-3 rounded-xl bg-muted/60 p-4">
              <Sigma className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p>
                <span className="font-mono tabular-nums">{x.checks.players}</span> sources across <span className="font-mono tabular-nums">{x.skills.length}</span> skills.
                {" "}<span className="font-mono tabular-nums">{x.checks.coalitions}</span> coalitions checked one by one against the closed form, and the shares add up
                to <span className="font-mono tabular-nums">{fmt1(x.readiness.mappedPoints)}</span> points with a gap of <span className="font-mono tabular-nums">{x.checks.efficiencyGap.toFixed(2)}</span>.
                {x.readiness.adjustmentNote && <> {x.readiness.adjustmentNote}</>}
              </p>
            </div>
            {runId && (
              <Button variant="ghost" className="h-10 rounded-xl px-4" onClick={() => start(runId)}>
                <Activity aria-hidden /> Watch the agents&apos; steps
              </Button>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function ReadinessExplained() {
  const userId = useViewerId();
  const [demo, setDemo] = React.useState<Explanation | null>(null);
  const q = useQuery({
    queryKey: ["labs-shapley", userId],
    queryFn: () => request<{ explanation: Explanation; runId: string; committed?: Committed | null; demo?: boolean }>("/api/labs/shapley"),
    retry: (n, e) => !(e instanceof HttpError && e.status < 500) && n < 1,
    retryDelay: 400,
  });
  const useDemo = React.useCallback(() => {
    demoExplanation().then(setDemo).catch(() => toast.error("The demo data couldn't load either", { description: "Refresh the page to try again." }));
  }, []);

  if (demo) return <Explained x={demo} runId={null} demo live={false} />;
  if (q.isPending) return <ExplainedSkeleton />;
  if (q.isError) {
    if (q.error instanceof HttpError && q.error.status === 404) {
      return (
        <EmptyState
          icon={MapIcon}
          title="No Bridge Map to explain yet"
          body="Readiness Explained splits your Bridge Map's score between your evidence and your degree. Add your programme and target role first."
          action={<Link href="/onboard" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>Build your Bridge Map</Link>}
        />
      );
    }
    return <ErrorState title="We couldn't work out your readiness split" body="That's on us, not you. Your map and evidence are safe." onRetry={() => q.refetch()} onUseDemo={useDemo} />;
  }
  const x = q.data.explanation;
  if (!x.contributors.length) {
    return (
      <EmptyState
        icon={MapIcon}
        title="Nothing counts toward your readiness yet"
        body={`None of your evidence or modules covers a skill in ${x.roleName} job ads so far. Your first proof will show up here as its own bar.`}
        action={<Link href="/challenge" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>Try a 20-minute challenge</Link>}
      />
    );
  }
  return <Explained x={x} runId={q.data.runId} demo={!!q.data.demo} committed={q.data.committed ?? null} live />;
}
