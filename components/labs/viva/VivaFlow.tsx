"use client";
// Keystone Labs · /labs/viva: pick your PR, answer three questions written from its diff, and see your understanding
// mapped onto the code. A pass lights Proof Ladder rung 3; a weak answer goes to your pod reviewer for a re-viva.
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitPullRequest, History } from "lucide-react";
import { toast } from "sonner";
import { DemoDataNote, EmptyState, ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewerId } from "@/components/community/useViewerId";
import { useActivity } from "@/components/shell/ActivityPanel";
import { getJSON, sendJSON } from "@/components/challenge/api";
import { cn } from "@/lib/utils";
import type { SourceRef, VivaOverview, VivaSession, VivaSessionSummary } from "@/lib/labs/viva/model";
import { DiffView } from "./DiffView";
import { QuestionList, type Draft } from "./QuestionList";
import { ResultPanel } from "./ResultPanel";
import { ReviewerQueue } from "./ReviewerQueue";
import { StartPanel } from "./StartPanel";
import { InlineCode } from "./InlineCode";

export function VivaSkeleton() {
  return (
    <div role="status" aria-label="Loading your viva" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-3/4" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 pt-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-24 w-full rounded-xl" /></div>
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-4" style={{ width: `${40 + ((i * 37) % 55)}%` }} />)}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<VivaSessionSummary["status"], string> = {
  open: "Not submitted yet", passed: "Passed", "re-viva": "Re-viva with your reviewer", cleared: "Cleared in person",
};

function History_({ items, currentId }: { items: VivaSessionSummary[]; currentId?: string }) {
  const rest = items.filter((s) => s.id !== currentId).slice(0, 5);
  if (!rest.length) return null;
  return (
    <section aria-labelledby="viva-history-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="viva-history-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight"><History className="size-5 text-primary" aria-hidden />Your earlier vivas</h2>
      <ul className="mt-3 divide-y">
        {rest.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <Link href={`/labs/viva?session=${encodeURIComponent(s.id)}`} className="min-w-0 rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              PR #{s.prNumber}: {s.prTitle}
            </Link>
            <span className="text-sm text-muted-foreground tabular-nums">
              {STATUS_TEXT[s.status]}{s.score !== undefined && s.maxScore !== undefined ? `, ${s.score} of ${s.maxScore} points` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VivaFlow() {
  const viewer = useViewerId();
  const params = useSearchParams();
  const qc = useQueryClient();
  const activity = useActivity();
  const [asDemo, setAsDemo] = React.useState(false);
  const userId = asDemo ? "aisha" : viewer;
  const sessionParam = params.get("session") ?? undefined;

  const [local, setLocal] = React.useState<VivaSession | null>(null);
  const [fresh, setFresh] = React.useState(false); // "Start another viva": show the picker even if a session exists
  const [retrying, setRetrying] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [activeQ, setActiveQ] = React.useState<number | null>(null);
  const [busyReview, setBusyReview] = React.useState<string | null>(null);

  const key = ["labs-viva", userId, sessionParam ?? null] as const;
  const overview = useQuery({
    queryKey: key,
    queryFn: () => getJSON<VivaOverview>(`/api/labs/viva?${new URLSearchParams({ userId, ...(sessionParam ? { sessionId: sessionParam } : {}) })}`),
  });

  const session = local ?? (fresh ? null : overview.data?.session ?? null);
  const isOwner = session?.userId === userId;

  const start = useMutation({
    mutationFn: (source: SourceRef) => sendJSON<VivaSession>("/api/labs/viva", { userId, source }),
    onSuccess: (s) => {
      setLocal(s); setFresh(false); setRetrying(false); setDrafts({});
      toast.success(`${s.questions.length} questions on PR #${s.source.prNumber}`, { description: "Written from your own diff. Take your time." });
    },
    onError: (e: Error) => toast.error("We couldn't start the viva", { description: e.message }),
  });

  const grade = useMutation({
    mutationFn: (s: VivaSession) => sendJSON<VivaSession>("/api/labs/viva/grade", {
      userId, sessionId: s.id,
      answers: s.questions.map((q) => ({ questionId: q.id, text: drafts[q.id]?.text ?? "", mode: drafts[q.id]?.mode ?? "text" })),
    }),
    onSuccess: (s) => {
      setLocal(s); setRetrying(false);
      void qc.invalidateQueries({ queryKey: ["labs-viva"] });
      const r = s.result!;
      if (r.passed) toast.success(`${s.source.skillName}: Can teach it is lit`, { description: `${r.score} of ${r.maxScore} points. Saved to your Proof Ladder.` });
      else toast(`Re-viva with ${s.source.reviewerName ?? "your reviewer"}`, { description: "Not a fail: a five-minute chat in person clears it." });
    },
    onError: (e: Error) => toast.error("We couldn't grade your answers", { description: e.message }),
  });

  const review = useMutation({
    mutationFn: (v: { sessionId: string; decision: "cleared" | "keep" }) => sendJSON<VivaSession>("/api/labs/viva/review", { reviewerId: userId, ...v }),
    onMutate: (v) => setBusyReview(v.sessionId),
    onSettled: () => setBusyReview(null),
    onSuccess: (s, v) => {
      void qc.invalidateQueries({ queryKey: ["labs-viva"] });
      if (v.decision === "cleared") toast.success(`Cleared ${s.studentName}'s re-viva`, { description: `${s.source.skillName}: Can teach it is saved on their Proof Ladder.` });
      else toast("Kept open", { description: `${s.studentName} can try again, or talk it through with you.` });
    },
    onError: (e: Error) => toast.error("We couldn't save your decision", { description: e.message }),
  });

  if (overview.isPending) return <VivaSkeleton />;
  if (overview.isError) {
    return (
      <ErrorState
        title="We couldn't load your viva"
        body="That's on us, not you. Your answers are safe; try again in a moment."
        onRetry={() => void overview.refetch()}
        onUseDemo={() => { setAsDemo(true); setLocal(null); }}
      />
    );
  }
  const data = overview.data;
  const answering = !!session && isOwner && (session.status === "open" || (session.status === "re-viva" && retrying));
  const fillDemo = (set: "honest" | "gamed") => {
    if (!session?.demo) return;
    setDrafts(Object.fromEntries(session.questions.map((q, k) => [q.id, { text: session.demo![set][k] ?? "", mode: "text" as const }])));
  };
  const newViva = () => { setLocal(null); setFresh(true); setRetrying(false); setDrafts({}); };
  // A retry starts from the answers already given, so nothing typed is lost.
  const retry = (s: VivaSession) => {
    setDrafts(Object.fromEntries((s.answers ?? []).map((a) => [a.questionId, { text: a.text, mode: a.mode }])));
    setRetrying(true);
  };

  return (
    <div className="space-y-8">
      {data.demo && <div className="-mt-4 flex justify-end md:-mt-6"><DemoDataNote /></div>}

      <ReviewerQueue items={data.reviewQueue} busyId={busyReview} onDecide={(sessionId, decision) => review.mutate({ sessionId, decision })} />

      {!session && (
        data.sources.length
          ? <StartPanel sources={data.sources} starting={start.isPending} onStart={(ref) => start.mutate(ref)} />
          : (
            <EmptyState
              icon={GitPullRequest}
              title="No pull request to ask about yet"
              body="A viva asks about code you wrote. Join a pod and open your first PR, then come back."
              action={<Link href="/pods" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>Find your pod</Link>}
            />
          )
      )}

      {session && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 self-start lg:sticky lg:top-6 lg:order-2">
            <DiffView session={session} activeQ={activeQ} />
          </div>
          <div className="min-w-0 space-y-6 lg:order-1">
            {!isOwner && (
              <p className="rounded-xl bg-muted/60 p-4 text-sm">
                You&apos;re reading {session.studentName}&apos;s viva as their pod reviewer. Ask them to talk you through the marked lines.
              </p>
            )}
            {session.result && !answering && (
              <ResultPanel
                session={session}
                onNew={newViva}
                onRetry={isOwner && session.status === "re-viva" ? () => retry(session) : undefined}
                onActivity={session.result.runId ? () => activity.start(session.result!.runId) : undefined}
              />
            )}
            {answering && (
              <QuestionList
                session={session}
                drafts={drafts}
                onDraft={(id, d) => setDrafts((all) => ({ ...all, [id]: d }))}
                onFocusQ={setActiveQ}
                onSubmit={() => grade.mutate(session)}
                submitting={grade.isPending}
                onDemo={session.demo ? fillDemo : undefined}
              />
            )}
            {!isOwner && session.answers?.length ? (
              <section aria-labelledby="viva-answers-title" className="rounded-2xl border bg-card p-6 shadow-sm">
                <h2 id="viva-answers-title" className="text-xl font-semibold tracking-tight">What {session.studentName} said</h2>
                <ol className="mt-3 divide-y">
                  {session.questions.map((q, k) => (
                    <li key={q.id} className="py-3">
                      <p className="font-medium">Q{k + 1}: {q.topic}</p>
                      <p className="mt-1 text-sm text-muted-foreground"><InlineCode text={q.prompt} /></p>
                      <p className="mt-2 text-base whitespace-pre-wrap">{session.answers?.find((a) => a.questionId === q.id)?.text || "No answer."}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </div>
      )}

      <History_ items={data.sessions} currentId={session?.id} />
    </div>
  );
}
