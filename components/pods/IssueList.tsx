"use client";
import { SkillChip } from "@/components/keystone";
import { skillName } from "@/lib/schemas/community";
import type { ProjectBrief, ProjectIssue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./MemberAvatar";
import { fallbackMember, type MemberInfo } from "./members";

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

function IssueRow({ issue, people, viewerId, repoUrl }: { issue: ProjectIssue; people: Record<string, MemberInfo>; viewerId?: string; repoUrl?: string }) {
  const assignee = people[issue.assigneeUserId] ?? fallbackMember(issue.assigneeUserId);
  const reviewer = people[issue.reviewerUserId] ?? fallbackMember(issue.reviewerUserId);
  const mine = !!viewerId && issue.assigneeUserId === viewerId;
  const href = issue.githubIssueUrl ?? (repoUrl ? `${repoUrl.replace(/\/$/, "")}/issues` : undefined);
  return (
    <li
      data-testid="issue-row"
      className={cn("flex items-start gap-4 p-4 md:p-5", mine && "bg-primary/5")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base leading-snug font-semibold">{issue.title}</p>
          {mine && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[13px] font-medium text-primary">Your issue</span>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <SkillChip skillId={issue.skillId} name={skillName(issue.skillId)} />
          <span className="text-muted-foreground">Assignee: {assignee.firstName}</span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <MemberAvatar member={reviewer} size="xs" />
            <span>Reviewer: {reviewer.firstName}</span>
          </span>
        </div>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open “${issue.title}” on GitHub (opens in a new tab)`}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GitHubMark />
        </a>
      )}
    </li>
  );
}

export function IssueList({ project, people, viewerId }: { project: ProjectBrief; people: Record<string, MemberInfo>; viewerId?: string }) {
  const groups = groupByMilestone(project);
  return (
    <div className="space-y-8">
      {groups.map((g, i) => {
        const headingId = `milestone-${i}-heading`;
        return (
          <section key={g.milestone} aria-labelledby={headingId}>
            <h3 id={headingId} className="flex items-start gap-3 text-lg font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary tabular-nums" aria-hidden>
                {i + 1}
              </span>
              <span className="min-w-0 pt-px leading-snug">
                {g.milestone}{" "}
                <span className="text-sm font-normal whitespace-nowrap text-muted-foreground">
                  {g.issues.length} {g.issues.length === 1 ? "issue" : "issues"}
                </span>
              </span>
            </h3>
            {g.issues.length ? (
              <ul aria-labelledby={headingId} className="mt-3 divide-y overflow-hidden rounded-xl border">
                {g.issues.map((issue, j) => (
                  <IssueRow key={`${issue.title}-${j}`} issue={issue} people={people} viewerId={viewerId} repoUrl={project.repoUrl} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No issues here yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
