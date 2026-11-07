"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Hammer, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, SectionCard } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import { skillName } from "@/lib/schemas/community";
import type { Pod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useViewerId } from "@/components/community/useViewerId";
import { GitHubMark, IssueList } from "./IssueList";
import { AvatarStack, MemberAvatar } from "./MemberAvatar";
import { DEMO_POD_ID, fallbackMember, memberIds, useMemberProfiles } from "./members";
import { StartProjectButton } from "./StartProjectButton";

const HOW_PODS_WORK = [
  "Pick your issue.",
  "Open a PR.",
  "Your reviewer gives feedback.",
  "Merged PRs become proof on your passport.",
];

const linkBtn = (variant: "default" | "outline") =>
  cn(buttonVariants({ variant, size: "lg" }), "h-12 rounded-xl px-5 text-base");

export function ProjectViewSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your pod's project">
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-3/4 max-w-2xl" />
        <Skeleton className="h-6 w-2/3 max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function MilestoneStepper({ milestones, current = 0 }: { milestones: string[]; current?: number }) {
  return (
    <ol aria-label="Milestones" className="grid gap-3 sm:grid-cols-3">
      {milestones.map((m, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li
            key={m}
            aria-current={active ? "step" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-2xl border p-4",
              active ? "border-primary/40 bg-primary/5 shadow-sm" : "bg-card",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                active || done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted-foreground">
                Milestone {i + 1}
                {active ? " · Now" : ""}
              </p>
              <p className="leading-snug font-semibold">{m}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ProjectActions({ repoUrl, discordUrl, className }: { repoUrl?: string; discordUrl?: string; className?: string }) {
  if (!repoUrl && !discordUrl) return null;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {repoUrl && (
        <a href={repoUrl} target="_blank" rel="noreferrer" className={cn(linkBtn("default"), "max-sm:flex-1")}>
          <GitHubMark className="size-5" />
          Open repo ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {discordUrl && (
        <a href={discordUrl} target="_blank" rel="noreferrer" className={cn(linkBtn("outline"), "max-sm:flex-1")}>
          <MessageCircle className="size-5" aria-hidden />
          Open Discord ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

/** /pods/[podId]: the pod's project brief, milestones and issues. */
export function ProjectView({ podId }: { podId: string }) {
  const router = useRouter();
  const viewerId = useViewerId();
  const reduce = useReducedMotion();
  const q = useQuery({
    queryKey: ["pod", podId],
    queryFn: () => apiGet<Pod>(`/api/pods/${encodeURIComponent(podId)}`),
  });
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

  const members = pod.members.map((m) => people[m.userId]);
  const back = (
    <Link
      href="/pods"
      className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to pods
    </Link>
  );

  if (!pod.project) {
    return (
      <div className="space-y-6">
        {back}
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{pod.name}</h1>
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

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-8"
    >
      <header className="space-y-5">
        {back}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <AvatarStack members={members} size="md" />
              <p className="text-sm font-medium text-muted-foreground">
                {pod.name} · 3-week project · {project.issues.length} issues
              </p>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">{project.title}</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">{project.pitch}</p>
          </div>
          <ProjectActions repoUrl={project.repoUrl} discordUrl={pod.discordChannelUrl} className="hidden shrink-0 md:flex" />
        </div>
      </header>

      <MilestoneStepper milestones={project.milestones} current={0} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <SectionCard
          title="Issues"
          description="Each issue is reviewed by a teammate who already has that skill."
        >
          <IssueList project={project} people={people} viewerId={viewerId} />
        </SectionCard>

        <aside className="space-y-6" aria-label="About this pod">
          {myIssue && (
            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-sm">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Start here</h2>
              <p className="mt-2 text-lg leading-snug font-semibold">{myIssue.title}</p>
              <p className="mt-1 text-[15px] text-muted-foreground">
                You&apos;ll practise {skillName(myIssue.skillId)}, and{" "}
                {(people[myIssue.reviewerUserId] ?? fallbackMember(myIssue.reviewerUserId)).firstName} reviews your PR.
              </p>
            </section>
          )}
          <SectionCard title="How pods work">
            <ol className="space-y-3">
              {HOW_PODS_WORK.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="pt-0.5">
                    <span className="sr-only">{i + 1}. </span>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard title={pod.name} description={`${pod.members.length} students learning by teaching`}>
            <ul className="space-y-3">
              {pod.members.map((m) => {
                const info = people[m.userId];
                return (
                  <li key={m.userId} className="flex items-center gap-3">
                    <MemberAvatar member={info} size="md" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {info.name}
                        {m.userId === viewerId && <span className="text-muted-foreground"> (you)</span>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {m.role ||
                          `Learns ${m.learns.map(skillName).join(", ")} · Teaches ${m.teaches.map(skillName).join(", ")}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </aside>
      </div>

      <div className="sticky bottom-[calc(var(--mobile-nav-height,0px)+env(safe-area-inset-bottom))] z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <ProjectActions repoUrl={project.repoUrl} discordUrl={pod.discordChannelUrl} />
      </div>
    </motion.div>
  );
}
