"use client";
// P5, /challenge: pick a gap skill (the roadmap week's focus first), do a 20-minute task, check it against the
// rubric, and on a pass climb rung 1 of the Proof Ladder.
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, ExternalLink, FlaskConical, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewerId } from "@/components/community/useViewerId";
import { useActivity } from "@/components/shell/ActivityPanel";
import { cn } from "@/lib/utils";
import { ProofLadder } from "@/components/ladder/ProofLadder";
import { ApiError, getJSON, sendJSON } from "./api";
import { ChallengeCard } from "./ChallengeCard";
import { DEMO_CHALLENGE, DEMO_MENU } from "./demo";
import { GradeResults } from "./GradeResults";
import { RungCelebration } from "./RungCelebration";
import { SkillPicker } from "./SkillPicker";
import type { ChallengeMenu, GradeResult, PublicChallenge } from "./model";

/** The challenge card's shape while it is being prepared: title and timer, the task well, the editor. */
function ChallengeCardSkeleton({ label }: { label?: string }) {
  return (
    <div role={label ? "status" : undefined} aria-label={label} className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="flex-1 space-y-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-7 w-56 rounded-md" /></div>
        <Skeleton className="h-16 w-44 rounded-xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export function ChallengeSkeleton() {
  return (
    <div role="status" aria-label="Loading your micro-challenge" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-36 rounded-xl" />)}</div>
      </div>
      <div className="flex flex-col gap-6">
        <div className="order-last rounded-2xl border bg-card p-6 shadow-sm lg:order-none">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-12 shrink-0 rounded-full md:size-9" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ChallengeCardSkeleton />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function WhatWeCheck({ challenge }: { challenge: PublicChallenge }) {
  return (
    <section aria-labelledby="rubric-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="rubric-title" className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <ListChecks className="size-5 shrink-0 text-muted-foreground" aria-hidden /> What we check
      </h2>
      <ol className="mt-4 divide-y border-t">
        {challenge.rubric.map((c, i) => (
          <li key={c.id} className="flex gap-3 py-3">
            <span aria-hidden className="w-4 shrink-0 pt-0.5 font-mono text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{c.title}</p>
              <p className="text-sm text-pretty text-muted-foreground">{c.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-pretty text-foreground">
        Plus <span className="tabular-nums">{challenge.checksCount}</span> hidden tests that make sure it still works. You pass with every test
        and at least 3 of the 4 criteria.
      </p>
      {challenge.resources.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <h3 className="text-base font-semibold text-foreground">Read after you try</h3>
          <ul className="mt-2 space-y-2">
            {challenge.resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 rounded-sm text-sm text-primary underline decoration-1 underline-offset-4 transition-[color] duration-(--dur-short) hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px">
                  {r.title}<ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ChallengeFlow() {
  const userId = useViewerId();
  const params = useSearchParams();
  const qc = useQueryClient();
  const activity = useActivity();
  const [demo, setDemo] = React.useState(false);
  const [picked, setPicked] = React.useState<string | undefined>();
  const [code, setCode] = React.useState<Record<string, string>>({});
  const [results, setResults] = React.useState<Record<string, GradeResult>>({});

  const menuQ = useQuery({
    queryKey: ["challenge-menu", userId],
    queryFn: () => getJSON<ChallengeMenu>(`/api/challenges?userId=${encodeURIComponent(userId)}`),
    retry: false,
    enabled: !demo,
  });
  const menu = demo ? DEMO_MENU : menuQ.data;
  const skillId = picked ?? params.get("skill") ?? menu?.focusSkillId;

  const chQ = useQuery({
    queryKey: ["challenge", userId, skillId],
    queryFn: () => sendJSON<PublicChallenge>("/api/challenges/generate", { userId, skillId }),
    enabled: !!skillId && !demo,
    retry: false,
    staleTime: Infinity,
  });
  const challenge = demo ? (skillId === DEMO_CHALLENGE.skillId ? DEMO_CHALLENGE : undefined) : chQ.data;
  const value = challenge ? code[challenge.id] ?? challenge.starter : "";
  const result = challenge ? results[challenge.id] : undefined;

  const grade = useMutation({
    mutationFn: (c: PublicChallenge) => sendJSON<GradeResult>("/api/challenges/grade", { userId, challengeId: c.id, submission: code[c.id] ?? c.starter }),
    onSuccess: (r, c) => {
      // Lock the skill: the menu refetch below moves the default focus to the next gap.
      setPicked(c.skillId);
      setResults((m) => ({ ...m, [c.id]: r }));
      if (r.passed) {
        toast.success(`Rung 1, Tried it: ${r.skillName}`, { description: "Saved to your Skill Passport as micro-challenge evidence." });
        void qc.invalidateQueries({ queryKey: ["proof-ladder", userId] });
        void qc.invalidateQueries({ queryKey: ["challenge-menu", userId] });
      } else {
        toast(`${r.rubricMet} of ${r.rubric.length} criteria met`, { description: "Not yet. The hints below are questions to think about." });
      }
    },
    onError: (e) => toast.error("We couldn't check your work", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  const sample = useMutation({
    mutationFn: (c: PublicChallenge) => sendJSON<{ sampleAnswer: string }>("/api/challenges/sample", { challengeId: c.id }),
    onSuccess: (r, c) => {
      setCode((m) => ({ ...m, [c.id]: r.sampleAnswer }));
      toast("Sample answer loaded", { description: "If you pass with it, your passport says you used the sample." });
    },
    onError: () => toast.error("We couldn't load the sample answer", { description: "Try again in a moment." }),
  });

  if (!demo && menuQ.isPending) return <ChallengeSkeleton />;
  if (!menu) {
    return (
      <ErrorState
        title="We couldn't load your challenges"
        body="That's on us, not you. Try again, or use the demo Docker challenge."
        onRetry={() => void menuQ.refetch()}
        onUseDemo={() => { setDemo(true); setPicked(DEMO_CHALLENGE.skillId); toast("Showing the demo Docker challenge"); }}
      />
    );
  }
  if (!menu.options.length) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="No micro-challenges yet"
        body="Challenges appear for the skills on your Bridge Map. Map your degree first."
        action={<Link href="/map" className={cn(buttonVariants(), "active:translate-y-px")}>Open your Bridge Map</Link>}
      />
    );
  }

  const notFound = chQ.error instanceof ApiError && chQ.error.code === "not_found";
  const skillName = menu.options.find((o) => o.skillId === skillId)?.skillName ?? "skill";
  return (
    <div className="space-y-8">
      <section aria-labelledby="pick-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="pick-title" className="text-xl font-semibold text-foreground">Choose a skill</h2>
          <p className="text-sm text-muted-foreground">
            {menu.focusWeek ? `Week ${menu.focusWeek} of your roadmap is first.` : "Your top gap is first."} Skills are grouped by status; a tick means you&apos;ve tried it.
          </p>
        </div>
        <SkillPicker menu={menu} value={skillId} onChange={(id) => { setPicked(id); }} />
      </section>

      {result?.passed && challenge && <RungCelebration key={`${challenge.id}:${result.evidenceId}`} result={result} passportHref={`/profile/${encodeURIComponent(userId)}`} />}

      {/* Phones get the challenge first and the standing ladder after it; wide screens keep the compact ladder band on top. */}
      <div className="flex flex-col gap-6">
        {skillId && (
          <section aria-labelledby="ladder-title" className="order-last rounded-2xl border bg-card p-6 shadow-sm lg:order-none">
            <div className="mb-1 space-y-1">
              <h2 id="ladder-title" className="text-xl font-semibold text-foreground">Your {skillName} ladder</h2>
              <p className="text-sm text-muted-foreground">Each rung is proven by a different agent and confirmed by a person.</p>
            </div>
            <ProofLadder userId={userId} skillId={skillId} />
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0 space-y-6">
            {!demo && chQ.isPending && skillId ? (
              <ChallengeCardSkeleton label="Preparing your challenge" />
            ) : notFound || (demo && !challenge) ? (
              <EmptyState
                icon={FlaskConical}
                title="No 20-minute challenge for this skill yet"
                body={notFound ? (chQ.error as ApiError).message : "The demo has the Docker challenge only."}
                action={<button type="button" className={cn(buttonVariants(), "active:translate-y-px")} onClick={() => setPicked("docker")}>Try the Docker challenge</button>}
              />
            ) : !challenge ? (
              <ErrorState
                title="We couldn't prepare this challenge"
                body="That's on us, not you. Your progress is safe."
                onRetry={() => void chQ.refetch()}
                onUseDemo={() => { setDemo(true); setPicked(DEMO_CHALLENGE.skillId); toast("Showing the demo Docker challenge"); }}
              />
            ) : (
              <>
                <ChallengeCard
                  challenge={challenge}
                  code={value}
                  onCode={(v) => setCode((m) => ({ ...m, [challenge.id]: v }))}
                  onCheck={() => grade.mutate(challenge)}
                  onSample={() => sample.mutate(challenge)}
                  checking={grade.isPending}
                  loadingSample={sample.isPending}
                  passed={!!result?.passed}
                  isDemo={demo}
                />
                <section aria-labelledby="results-title" aria-live="polite" className="rounded-2xl border bg-card p-6 shadow-sm">
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h2 id="results-title" className="text-xl font-semibold text-foreground">Your results</h2>
                      <p className="text-sm text-muted-foreground">
                        {result ? (result.passed ? "Passed. Rung 1 is on your ladder." : "Not yet. Each open item has a question to think about.") : "Check your work when you're ready. You can check as often as you like."}
                      </p>
                    </div>
                    {result?.runId && (
                      <button type="button" onClick={() => activity.start(result.runId!)} className={cn(buttonVariants({ variant: "ghost" }), "active:translate-y-px")}>
                        See what the agents did
                      </button>
                    )}
                  </div>
                  {grade.isPending ? (
                    <div className="grid gap-8 md:grid-cols-2 md:gap-6" aria-hidden>
                      {[0, 1].map((c) => (
                        <div key={c} className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-32" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
                      ))}
                    </div>
                  ) : result ? (
                    <GradeResults result={result} />
                  ) : (
                    <ul className="divide-y border-t">
                      {challenge.rubric.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 py-3 text-muted-foreground">
                          <Circle className="size-5 shrink-0 text-rule-2" aria-hidden />
                          <span>{c.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-[calc(var(--topbar-height)+1.5rem)]">
            {challenge ? <WhatWeCheck challenge={challenge} /> : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
