"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Hammer, MessageCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { DemoDataNote, EmptyState, ErrorState, PageHeader, SectionCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import { skillName } from "@/lib/schemas/community";
import type { ProofResult } from "@/lib/schemas/studio";
import type { Pod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useViewerId } from "@/components/community/useViewerId";
import { GitHubMark, IssueList } from "./IssueList";
import { AvatarStack, MemberAvatar } from "./MemberAvatar";
import { DEMO_POD_ID, fallbackMember, memberIds, useMemberProfiles } from "./members";
import { PRReviewPanel } from "./PRReviewPanel";
import { ProofCelebration } from "./ProofCelebration";
import { StartProjectButton } from "./StartProjectButton";
import { useProjectProgress } from "./useProjectProgress";

const HOW_PODS_WORK = [
  "Pick your issue.",
  "Open a PR.",
  "Your reviewer gives feedback.",
  "Merged PRs become proof on your passport.",
];

export function ProjectViewSkeleton() {
  return (
    <div role="status" className="space-y-8" aria-busy="true" aria-label="Loading your pod's project">
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-11 w-3/4 max-w-2xl" />
        <Skeleton className="h-6 w-2/3 max-w-xl" />
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-1.5 rounded-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** The three weeks as one track: coral marks the week you're in. */
function MilestoneStepper({ milestones, current = 0 }: { milestones: string[]; current?: number }) {
  return (
    <ol aria-label="Milestones" className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
      {milestones.map((m, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={m} aria-current={active ? "step" : undefined} className="min-w-0">
            <span
              aria-hidden
              className={cn("block h-1.5 rounded-full", active ? "bg-primary" : done ? "bg-foreground" : "bg-rule-2")}
            />
            <p className="mt-3 text-base leading-snug font-semibold text-pretty">{m}</p>
            {active && <p className="mt-1 text-sm font-medium text-primary">Now</p>}
          </li>
        );
      })}
    </ol>
  );
}

function ProjectActions({ repoUrl, discordUrl, className }: { repoUrl?: string; discordUrl?: string; className?: string }) {
  if (!repoUrl && !discordUrl) return null;
  const btn = cn(buttonVariants({ variant: "outline", size: "lg" }), "max-sm:flex-1");
  return (
    <div className={cn("flex w-full flex-wrap gap-3 sm:w-auto", className)}>
      {repoUrl && (
        <a href={repoUrl} target="_blank" rel="noreferrer" className={btn}>
          <GitHubMark className="size-4" />
          Open repo<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {discordUrl && (
        <a href={discordUrl} target="_blank" rel="noreferrer" className={btn}>
          <MessageCircle aria-hidden />
          Open Discord<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

/** How many issues are merged, in the four states the progress query can be in. */
function MergedTally({
  total,
  merged,
  pending,
  error,
  onRetry,
}: {
  total: number;
  merged: number;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (pending) {
    return (
      <div role="status" aria-label="Checking which issues are merged" className="flex items-baseline gap-2">
        <Skeleton className="h-8 w-10" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>We couldn&apos;t check which issues are merged.</span>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          Retry
        </Button>
      </div>
    );
  }
  return (
    <p className="flex items-baseline gap-2" aria-label={`${merged} of ${total} issues merged`}>
      <span className="font-mono text-3xl leading-none font-semibold text-foreground tabular-nums">{merged}</span>
      <span className="text-sm text-muted-foreground">
        of <span className="font-mono tabular-nums">{total}</span> merged
      </span>
    </p>
  );
}

/** /pods/[podId]: the pod's project brief, milestones and issues, and the merge that turns an issue into proof. */
export function ProjectView({ podId }: { podId: string }) {
  const router = useRouter();
  const viewerId = useViewerId();
  const q = useQuery({
    queryKey: ["pod", podId],
    queryFn: () => apiGet<Pod>(`/api/pods/${encodeURIComponent(podId)}`),
  });
  const progress = useProjectProgress(podId);
  const [proof, setProof] = React.useState<ProofResult | null>(null);
  const pod = q.data;
  const people = useMemberProfiles(pod ? memberIds(pod) : []);

  if (q.isPending) return <ProjectViewSkeleton />;
  if (q.isError || !pod) {
    return (
      <ErrorState
        title="We couldn't load this pod"
        body="It might have been moved, or the server is busy. Try again, or explore the demo pod."
        onRetry={() => void q.refetch()}
        onUseDemo={() => {
          if (podId === DEMO_POD_ID) void q.refetch();
          else router.push(`/pods/${DEMO_POD_ID}`);
        }}
      />
    );
  }

  const back = (
    <Link
      href="/pods"
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground underline-offset-4 outline-none transition-[color,transform] duration-(--dur-short) hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to pods
    </Link>
  );

  if (!pod.project) {
    return (
      <div className="space-y-6">
        {back}
        <PageHeader title={pod.name} />
        <EmptyState
          icon={Hammer}
          title="Your pod doesn't have a project yet"
          body="Our Project Architect designs a 3-week project where everyone practises what they want to learn, reviewed by a teammate who already knows it."
          action={<StartProjectButton pod={pod} />}
        />
      </div>
    );
  }

  const project = pod.project;
  const myIssue = project.issues.find((i) => i.assigneeUserId === viewerId);
  const names = Object.fromEntries(pod.members.map((m) => [m.userId, (people[m.userId] ?? fallbackMember(m.userId)).name]));
  const mergedCount = progress.data?.merged.length ?? 0;

  return (
    <div className="space-y-8 pb-16">
      <div className="space-y-6">
        {back}
        <PageHeader
          title={project.title}
          subtitle={project.pitch}
          actions={
            <>
              <AvatarStack
                members={pod.members.map((m) => people[m.userId] ?? fallbackMember(m.userId))}
                size="md"
                className="mr-2"
              />
              <ProjectActions repoUrl={project.repoUrl} discordUrl={pod.discordChannelUrl} />
            </>
          }
        />
      </div>

      <section aria-labelledby="milestones-heading" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="milestones-heading" className="text-xl font-semibold text-foreground">
            3-week project
          </h2>
          {podId === DEMO_POD_ID && <DemoDataNote />}
        </div>
        <MilestoneStepper milestones={project.milestones} current={0} />
      </section>

      {/* Start here leads on a phone; from lg it sits atop the side column. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
        {myIssue && (
          <SectionCard title="Start here" className="lg:col-start-2 lg:row-start-1">
            <p className="text-lg leading-snug font-semibold text-foreground">{myIssue.title}</p>
            <p className="mt-2 text-muted-foreground">
              You&apos;ll practise {skillName(myIssue.skillId)}, and{" "}
              {(people[myIssue.reviewerUserId] ?? fallbackMember(myIssue.reviewerUserId)).firstName} reviews your PR.
            </p>
          </SectionCard>
        )}
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <PRReviewPanel podId={pod.id} />
          <SectionCard
            title="Issues"
            description="Each issue is reviewed by a teammate who already has that skill."
            actions={
              <MergedTally
                total={project.issues.length}
                merged={mergedCount}
                pending={progress.isPending}
                error={progress.isError}
                onRetry={() => void progress.refetch()}
              />
            }
          >
            <IssueList
              project={project}
              people={people}
              viewerId={viewerId}
              podId={pod.id}
              progress={progress.data}
              progressPending={progress.isPending}
              onProof={setProof}
            />
          </SectionCard>
        </div>

        <aside
          className={cn("space-y-6 lg:col-start-2", myIssue ? "lg:row-start-2" : "lg:row-start-1")}
          aria-label="About this pod"
        >
          <SectionCard title="How pods work">
            <ol className="divide-y border-t">
              {HOW_PODS_WORK.map((step, i) => (
                <li key={step} className="flex items-baseline gap-3 py-3 last:pb-0">
                  <span className="w-4 shrink-0 font-mono text-sm text-muted-foreground tabular-nums" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="text-foreground">
                    <span className="sr-only">{i + 1}. </span>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard title={pod.name} description={`${pod.members.length} students learning by teaching`}>
            <ul className="divide-y border-t">
              {pod.members.map((m) => {
                const info = people[m.userId];
                const role = m.role
                  ? m.role.replace(/\s*·\s*/g, ", ").replace(/, Teaches/g, ", teaches")
                  : `Learns ${m.learns.map(skillName).join(", ")}, teaches ${m.teaches.map(skillName).join(", ")}`;
                return (
                  <li key={m.userId} className="flex items-center gap-3 py-3 last:pb-0">
                    <MemberAvatar member={info} size="md" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {info.name}
                        {m.userId === viewerId && <span className="text-muted-foreground"> (you)</span>}
                      </p>
                      <p className="text-sm text-pretty text-muted-foreground">{role}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </aside>
      </div>

      <ProofCelebration result={proof} names={names} onClose={() => setProof(null)} />
    </div>
  );
}
