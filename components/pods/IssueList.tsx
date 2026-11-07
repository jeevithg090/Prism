"use client";
import * as React from "react";
import { SkillChip } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { skillName } from "@/lib/schemas/community";
import type { ProjectProgress, ProofResult } from "@/lib/schemas/studio";
import type { ProjectBrief, ProjectIssue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./MemberAvatar";
import { MergedPill, MergeProofButton } from "./MergeProofButton";
import { fallbackMember, type MemberInfo } from "./members";
import { isMerged } from "./useProjectProgress";

/** GitHub's mark (Octicons mark-github), since lucide no longer ships brand icons. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false" className={cn("size-5", className)}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

/** Issues grouped under the project's milestones (issues with an unknown milestone go under the first one). */
export function groupByMilestone(project: ProjectBrief): { milestone: string; issues: ProjectIssue[] }[] {
  const milestones = project.milestones.length ? project.milestones : ["Milestone 1"];
  const groups = milestones.map((milestone) => ({ milestone, issues: [] as ProjectIssue[] }));
  for (const issue of project.issues) {
    const g = groups.find((x) => x.milestone === issue.milestone) ?? groups[0];
    g.issues.push(issue);
  }
  return groups;
}

function IssueRow({
  issue,
  people,
  viewerId,
  repoUrl,
  action,
  merged,
}: {
  issue: ProjectIssue;
  people: Record<string, MemberInfo>;
  viewerId?: string;
  repoUrl?: string;
  action?: React.ReactNode;
  merged?: boolean;
}) {
  const assignee = people[issue.assigneeUserId] ?? fallbackMember(issue.assigneeUserId);
  const reviewer = people[issue.reviewerUserId] ?? fallbackMember(issue.reviewerUserId);
  const mine = !!viewerId && issue.assigneeUserId === viewerId;
  const reviewing = !!viewerId && issue.reviewerUserId === viewerId;
  const href = issue.githubIssueUrl ?? (repoUrl ? `${repoUrl.replace(/\/$/, "")}/issues` : undefined);
  return (
    <li
      data-testid="issue-row"
      // With only the GitHub link the row keeps it beside the title on a phone instead of on a line of its own.
      className={cn("flex gap-3 py-4 sm:flex-row sm:items-start sm:gap-4", action ? "flex-col" : "flex-row items-start")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug font-semibold text-pretty text-foreground">{issue.title}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {mine && (
            <span className="inline-flex h-7 items-center rounded-md border border-primary/45 px-2 text-sm font-medium text-primary">
              Your issue
            </span>
          )}
          <SkillChip skillId={issue.skillId} name={skillName(issue.skillId)} status={merged ? "proven" : undefined} />
          {mine ? (
            <span className="font-medium text-foreground">Assigned to you</span>
          ) : (
            <span>Assignee: {assignee.firstName}</span>
          )}
          <span className="inline-flex items-center gap-2">
            <MemberAvatar member={reviewer} size="xs" />
            {reviewing ? (
              <span className="font-medium text-foreground">You review this</span>
            ) : (
              <span>Reviewer: {reviewer.firstName}</span>
            )}
          </span>
        </div>
      </div>
      {(action || href) && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open “${issue.title}” on GitHub (opens in a new tab)`}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <GitHubMark className="size-5" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

export function IssueList({
  project,
  people,
  viewerId,
  podId,
  progress,
  progressPending,
  onProof,
}: {
  project: ProjectBrief;
  people: Record<string, MemberInfo>;
  viewerId?: string;
  /** When set, the viewer's rows (as assignee or reviewer) carry a MergeProofButton for this pod. */
  podId?: string;
  progress?: ProjectProgress | null;
  progressPending?: boolean;
  onProof?: (result: ProofResult) => void;
}) {
  const groups = groupByMilestone(project);
  return (
    <div className="space-y-10">
      {groups.map((g, i) => {
        const headingId = `milestone-${i}-heading`;
        return (
          <section key={g.milestone} aria-labelledby={headingId}>
            <h3 id={headingId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-base font-semibold text-muted-foreground">
              <span className="min-w-0 leading-snug">{g.milestone}</span>{" "}
              <span className="text-sm font-normal whitespace-nowrap text-muted-foreground">
                {g.issues.length} {g.issues.length === 1 ? "issue" : "issues"}
              </span>
            </h3>
            {g.issues.length ? (
              <ul aria-labelledby={headingId} className="mt-2 divide-y border-t">
                {g.issues.map((issue, j) => {
                  const index = project.issues.indexOf(issue);
                  const merged = isMerged(progress, index);
                  const mine = !!viewerId && issue.assigneeUserId === viewerId;
                  const reviewing = !!viewerId && issue.reviewerUserId === viewerId;
                  // Only the assignee and the reviewer merge an issue; other rows just show whether it's merged.
                  const action = !podId ? undefined : !(mine || reviewing) ? (
                    merged ? <MergedPill /> : undefined
                  ) : progressPending ? (
                    <Skeleton className={cn("rounded-lg", mine ? "h-9 w-36" : "h-8 w-32")} />
                  ) : (
                    <MergeProofButton
                      podId={podId}
                      issueIndex={index}
                      issueTitle={issue.title}
                      merged={merged}
                      onProof={onProof}
                      variant={mine ? "outline" : "ghost"}
                      size={mine ? "default" : "sm"}
                    />
                  );
                  return (
                    <IssueRow
                      key={`${issue.title}-${j}`}
                      issue={issue}
                      people={people}
                      viewerId={viewerId}
                      repoUrl={project.repoUrl}
                      action={action}
                      merged={merged}
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">No issues here yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
