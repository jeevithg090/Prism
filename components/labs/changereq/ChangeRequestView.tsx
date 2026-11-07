"use client";
// /labs/changereq: your roadmap as code. The weekly market refresh opens a change request (a diff of weeks with
// receipts and checks); you approve, reject or comment. Approving writes roadmap v+1; every version can be restored.
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitMerge, GitPullRequest, MessageSquare, RefreshCw, Route, Send, ShieldCheck, X } from "lucide-react";
import { AgentAvatar, DemoDataNote, EmptyState, ErrorState, PageHeader, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiGet, isNotFound, useMapViewer } from "@/components/map/hooks";
import { apiPost } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { ActionReq, ChangeReqState, ChangeRequest } from "@/lib/labs/changereq/types";
import { ChecksList, DiffHunk, PlanWeeks, RiskPill, StatusPill, VersionHistory, dayMonth } from "./parts";

type ActionResult = { runId: string; message: string; state: ChangeReqState; version?: number; reused?: boolean };
type ActionBody = ActionReq extends infer A ? (A extends { userId: string } ? Omit<A, "userId" | "runId"> : never) : never;

const newRunId = () => `run_${Math.random().toString(36).slice(2, 12)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (g: number) => `${g >= 0 ? "+" : "−"}${Math.abs(Math.round(g * 100))}%`;

export function ChangeRequestSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your change requests">
      <Skeleton className="h-12 w-2/3 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6"><Skeleton className="h-96 w-full rounded-2xl" /><Skeleton className="h-56 w-full rounded-2xl" /></div>
        <Skeleton className="h-[32rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function ChangeRequestView({ demo = false }: { demo?: boolean }) {
  const viewer = useMapViewer(demo);
  const [forceDemo, setForceDemo] = React.useState(false);
  const uid = forceDemo ? "aisha" : viewer;
  const key = React.useMemo(() => ["labs", "changereq", uid] as const, [uid]);
  const qc = useQueryClient();
  const activity = useActivity();
  const [comment, setComment] = React.useState("");
  const inputId = React.useId();

  const state = useQuery({ queryKey: key, queryFn: () => apiGet<ChangeReqState>(`/api/labs/changereq?userId=${encodeURIComponent(uid)}`), retry: 0 });

  const act = useMutation({
    mutationFn: async (body: ActionBody) => {
      const runId = newRunId();
      if (body.action !== "comment" && body.action !== "reject") activity.start(runId);
      return apiPost<ActionResult>("/api/labs/changereq", { ...body, userId: uid, runId });
    },
    onSuccess: (r, body) => {
      qc.setQueryData(key, r.state);
      if (body.action === "approve" || body.action === "revert") {
        void qc.invalidateQueries({ queryKey: ["roadmap", uid] });
        toast.success(r.message, { description: "Your roadmap page and your Coach now plan from this version." });
      } else if (body.action === "refresh") {
        toast(r.state.open ? (r.reused ? "This change request is still open" : "New change request to review") : "Your plan still fits", { description: r.message });
      } else if (body.action === "reject") {
        toast(r.message);
      } else {
        setComment("");
      }
    },
    onError: (e) => toast.error("That didn't go through", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  const s = state.data;
  const busy = act.isPending;
  const cr = s?.open ?? null;
  const refreshButton = (primary: boolean) => (
    <Button variant={primary ? "default" : "outline"} className="h-10 rounded-xl px-4" disabled={busy || !s} onClick={() => act.mutate({ action: "refresh" })}>
      <RefreshCw className={cn(busy && act.variables?.action === "refresh" && "motion-safe:animate-spin")} aria-hidden />
      {busy && act.variables?.action === "refresh" ? "Refreshing…" : "Run this week's refresh"}
    </Button>
  );

  const header = (
    <PageHeader
      title="Plan change requests"
      subtitle="When the job market moves, your roadmap gets a pull request. You review the diff; nothing changes until you approve it."
      actions={<>{s?.demo && <DemoDataNote />}{refreshButton(!cr)}</>}
    />
  );

  if (state.isPending) return <>{header}<ChangeRequestSkeleton /></>;
  if (state.isError && isNotFound(state.error)) {
    return (
      <>
        {header}
        <EmptyState
          icon={Route}
          title="No roadmap to review yet"
          body="Change requests are diffs against your roadmap. Build your 12-week plan first, then come back for this week's refresh."
          action={<Link href="/roadmap" className={cn(buttonVariants(), "h-10 rounded-xl px-5")}>Build my roadmap</Link>}
        />
      </>
    );
  }
  if (!s) {
    return (
      <>
        {header}
        <ErrorState
          title="We couldn't load your change requests"
          body="That's on us, not you. Try again, or look at the demo student's plan."
          onRetry={() => void state.refetch()}
          onUseDemo={() => setForceDemo(true)}
        />
      </>
    );
  }

  const pending = new Map<number, string>();
  for (const h of cr?.hunks ?? []) {
    pending.set(h.week, h.incoming.after.name);
    if (h.kind === "reorder" && h.otherWeek) pending.set(h.otherWeek, h.outgoing.after.name);
  }
  const hoursByWeek = new Map(s.weeks.map((w) => [w.week, w.hours]));

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {cr ? (
            <OpenRequest cr={cr} roleName={s.roleName} hoursByWeek={hoursByWeek} busy={busy} pendingAction={act.variables?.action}
              onApprove={() => act.mutate({ action: "approve", id: cr.id })}
              onReject={() => act.mutate({ action: "reject", id: cr.id })}
              comment={comment} setComment={setComment} inputId={inputId}
              onComment={() => comment.trim() && act.mutate({ action: "comment", id: cr.id, text: comment.trim() })}
            />
          ) : (
            <EmptyState
              icon={GitPullRequest}
              title="No open change requests"
              body={`Your roadmap v${s.version} is live. Run this week's refresh: the Trend Forecaster refits every skill, the Market Agent re-weights ${s.roleName} ads, and the Roadmap Agent proposes a diff only if a week clears the 15% churn threshold.`}
            />
          )}
          {s.history.length > 0 && (
            <SectionCard title="Past requests" description="Every decision you made, newest first.">
              <ul className="divide-y">
                {s.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <span className="font-mono text-sm text-muted-foreground tabular-nums">#{h.number}</span>
                    <span className="min-w-0 flex-1 font-medium">{h.title}</span>
                    <StatusPill status={h.status} />
                    {h.resultVersion && <span className="text-sm text-muted-foreground">became v{h.resultVersion}</span>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
          <SectionCard title={`Your plan, v${s.version}`} description={cr ? "Highlighted weeks change if you approve." : "Locked weeks have started or start within 7 days."}>
            <PlanWeeks weeks={s.weeks} pending={pending} />
            <Link href="/roadmap" className="mt-4 inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">Open the full roadmap</Link>
          </SectionCard>
          <SectionCard title="Versions" description="Reverting restores an old plan as a new version, so nothing is lost.">
            <VersionHistory versions={s.versions} busy={busy} onRevert={(v) => act.mutate({ action: "revert", toVersion: v })} />
          </SectionCard>
        </aside>
      </div>
    </>
  );
}

function OpenRequest(p: {
  cr: ChangeRequest; roleName: string; hoursByWeek: Map<number, number>; busy: boolean; pendingAction?: string;
  onApprove: () => void; onReject: () => void; comment: string; setComment: (s: string) => void; inputId: string; onComment: () => void;
}) {
  const { cr } = p;
  const passes = cr.checks.filter((c) => c.status === "pass").length;
  return (
    <>
      <SectionCard className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={cr.status} />
          <RiskPill risk={cr.risk} />
          <span className="text-sm text-muted-foreground">Opened by the Roadmap Agent on {dayMonth(cr.createdAt)}, against v{cr.baseVersion}</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
          <span className="font-mono text-muted-foreground tabular-nums">#{cr.number}</span> {cr.title}
        </h2>

        <div className="mt-4 rounded-xl bg-muted/60 p-3 sm:p-4">
          <p className="text-sm">
            <span className="font-medium">{cr.refresh.label}{cr.refresh.simulated ? " (simulated)" : ""}.</span>{" "}
            <span className="text-muted-foreground">
              {cr.refresh.seriesRefit} hiring trends refitted on the last {cr.refresh.monthsFit} months, {cr.refresh.adsAnalysed} {p.roleName} ads re-weighted.
            </span>
          </p>
          {cr.refresh.movers.length > 0 && (
            <div role="region" tabIndex={0} aria-label="Biggest market moves this week" className="mt-3 overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full min-w-[17rem] text-sm">
              <caption className="sr-only">Biggest market moves this week</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 font-medium">Skill</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Share of ads</th>
                  <th scope="col" className="py-1 text-right font-medium">Forecast a year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {cr.refresh.movers.map((m) => (
                  <tr key={m.skillId}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">{m.name}</th>
                    <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums">{pct(m.demandBefore)} → <span className="text-foreground">{pct(m.demandAfter)}</span></td>
                    <td className="py-1.5 text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums">{signed(m.growthBefore)} → <span className="text-foreground">{signed(m.growthAfter)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <h3 className="mt-6 text-lg font-semibold">The diff</h3>
        <p className="text-sm text-muted-foreground">
          {cr.hunks.length} {cr.hunks.length === 1 ? "week changes" : "changes"}. Projected readiness {pct(cr.readiness.before)} → {pct(cr.readiness.after)}, same hours every week.
        </p>
        <ol className="mt-3 space-y-3">
          {cr.hunks.map((h, i) => <DiffHunk key={h.id} hunk={h} index={i} hoursByWeek={p.hoursByWeek} />)}
        </ol>

        <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
            <span><span className="font-medium text-foreground">You decide.</span> The agent can&rsquo;t merge its own request.</span>
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="h-10 rounded-xl px-4" disabled={p.busy} onClick={p.onReject}>
              <X aria-hidden />{p.busy && p.pendingAction === "reject" ? "Closing…" : "Reject"}
            </Button>
            <Button className="h-10 rounded-xl px-5" disabled={p.busy || cr.checks.some((c) => c.status === "fail")} onClick={p.onApprove}>
              <GitMerge aria-hidden />{p.busy && p.pendingAction === "approve" ? "Merging…" : `Approve and merge as v${cr.baseVersion + 1}`}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Checks" description={`${passes} of ${cr.checks.length} passed. Warnings don't block a merge; a failure does.`}>
        <ChecksList checks={cr.checks} />
      </SectionCard>

      <SectionCard title="Conversation" description={'Ask "why?", or reply "keep Kubernetes" to drop a change before you merge.'}>
        <ul className="space-y-4" aria-live="polite">
          {cr.comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              {c.author === "roadmap" ? <AgentAvatar agent="roadmap" size={32} /> : (
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-medium" aria-hidden>You</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.author === "roadmap" ? "Roadmap Agent" : "You"}{c.flagged && <span className="ml-2 text-status-gap">flagged as instructions, not followed</span>}</p>
                <p className="mt-0.5 whitespace-pre-line break-words text-muted-foreground">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); p.onComment(); }}>
          <label htmlFor={p.inputId} className="sr-only">Comment on this change request</label>
          <input
            id={p.inputId} value={p.comment} onChange={(e) => p.setComment(e.target.value)} maxLength={500}
            placeholder="Reply, for example: keep Kubernetes"
            className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" variant="outline" className="h-10 rounded-xl px-4" disabled={p.busy || !p.comment.trim()}>
            {p.busy && p.pendingAction === "comment" ? <MessageSquare aria-hidden /> : <Send aria-hidden />}Comment
          </Button>
        </form>
      </SectionCard>
    </>
  );
}
