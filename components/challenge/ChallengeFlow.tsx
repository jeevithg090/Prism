"use client";
// P5 · /challenge: pick a gap skill (the roadmap week's focus first), do a 20-minute task, check it against the
// rubric, and on a pass climb rung 1 of the Proof Ladder.
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FlaskConical, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewerId } from "@/components/community/useViewerId";
import { useActivity } from "@/components/shell/ActivityPanel";
import { ProofLadder } from "@/components/ladder/ProofLadder";
import { ApiError, getJSON, sendJSON } from "./api";
import { ChallengeCard } from "./ChallengeCard";
import { DEMO_CHALLENGE, DEMO_MENU } from "./demo";
import { GradeResults } from "./GradeResults";
import { RungCelebration } from "./RungCelebration";
import { SkillPicker } from "./SkillPicker";
import type { ChallengeMenu, GradeResult, PublicChallenge } from "./model";

export function ChallengeSkeleton() {
  return (
    <div role="status" aria-label="Loading your micro-challenge" className="space-y-6">
      <div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-36 rounded-full" />)}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function WhatWeCheck({ challenge }: { challenge: PublicChallenge }) {
  return (
    <section aria-labelledby="rubric-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="rubric-title" className="flex items-center gap-2 text-lg font-semibold">
        <ListChecks className="size-5 text-primary" aria-hidden /> What we check
      </h2>
      <ul className="mt-3 space-y-3">
        {challenge.rubric.map((c) => (
          <li key={c.id}>
            <p className="font-medium">{c.title}</p>
            <p className="text-sm text-muted-foreground">{c.description}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        Plus <span className="tabular-nums">{challenge.checksCount}</span> hidden tests that make sure it still works. You pass with every test
        and at least 3 of the 4 criteria.
      </p>
      {challenge.resources.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Read after you try</h3>
          <ul className="mt-2 space-y-1">
            {challenge.resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {r.title}<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
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
        toast.success(`Rung 1 · Tried it: ${r.skillName}`, { description: "Saved to your Skill Passport as micro-challenge evidence." });
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
        action={<Link href="/map" className={buttonVariants()}>Open your Bridge Map</Link>}
      />
    );
  }

  const notFound = chQ.error instanceof ApiError && chQ.error.code === "not_found";
  return (
    <div className="space-y-8">
      <section aria-labelledby="pick-title" className="space-y-3">
        <div>
          <h2 id="pick-title" className="text-xl font-semibold">Choose a skill</h2>
          <p className="text-sm text-muted-foreground">
            {menu.focusWeek ? `Week ${menu.focusWeek} of your roadmap is first.` : "Your top gap is first."} Gaps are marked red; a tick means you&apos;ve tried it.
          </p>
        </div>
        <SkillPicker menu={menu} value={skillId} onChange={(id) => { setPicked(id); }} />
      </section>

      {result?.passed && challenge && <RungCelebration key={`${challenge.id}:${result.evidenceId}`} result={result} passportHref={`/profile/${encodeURIComponent(userId)}`} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {!demo && chQ.isPending && skillId ? (
            <div role="status" aria-label="Preparing your challenge" className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : notFound || (demo && !challenge) ? (
            <EmptyState
              icon={FlaskConical}
              title="No 20-minute challenge for this skill yet"
              body={notFound ? (chQ.error as ApiError).message : "The demo has the Docker challenge only."}
              action={<button type="button" className={buttonVariants()} onClick={() => setPicked("docker")}>Try the Docker challenge</button>}
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
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 id="results-title" className="text-xl font-semibold">Your results</h2>
                    <p className="text-sm text-muted-foreground">
                      {result ? (result.passed ? "Passed. Rung 1 is on your ladder." : "Not yet. Each open item has a question to think about.") : "Check your work when you're ready. You can check as often as you like."}
                    </p>
                  </div>
                  {result?.runId && (
                    <button type="button" onClick={() => activity.start(result.runId!)} className={buttonVariants({ variant: "ghost" })}>
                      See what the agents did
                    </button>
                  )}
                </div>
                {grade.isPending ? (
                  <div className="space-y-3" aria-hidden>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
                ) : result ? (
                  <GradeResults result={result} />
                ) : (
                  <ul className="divide-y">
                    {challenge.rubric.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 text-muted-foreground">
                        <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-border" />
                        <span>{c.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          {skillId && (
            <section aria-labelledby="ladder-title" className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 id="ladder-title" className="text-lg font-semibold">Your {menu.options.find((o) => o.skillId === skillId)?.skillName ?? "skill"} ladder</h2>
              <p className="mb-4 text-sm text-muted-foreground">Each rung is proven by a different agent and confirmed by a person.</p>
              <ProofLadder userId={userId} skillId={skillId} />
            </section>
          )}
          {challenge && <WhatWeCheck challenge={challenge} />}
        </aside>
      </div>
    </div>
  );
}
