"use client";
// Story Mode: the real screen data for one beat, drawn with Keystone's shared components.
import { ArrowRight, BookOpen, Briefcase, CheckCircle2, Circle, GitPullRequest, GraduationCap, Repeat, Users } from "lucide-react";
import { ReadinessRing, StatusBadge } from "@/components/keystone";
import type { StoryVisual } from "@/lib/labs/story/schema";
import { cn } from "@/lib/utils";

const panel = "rounded-xl bg-muted/60 p-4";
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Big({ value, children }: { value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={panel}>
      <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function DemandBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className={cn("block h-full rounded-full bg-primary", className)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </span>
  );
}

export function BeatVisual({ visual }: { visual: StoryVisual }) {
  switch (visual.kind) {
    case "sources":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Big value={visual.modules}><BookOpen className="mr-1 inline size-4 align-[-2px] text-status-degree" aria-hidden />modules read from {visual.programme}</Big>
          <Big value={visual.ads}><Briefcase className="mr-1 inline size-4 align-[-2px]" aria-hidden />{visual.role} job ads analysed</Big>
          <Big value={visual.evidence}>
            <CheckCircle2 className="mr-1 inline size-4 align-[-2px] text-status-proven" aria-hidden />pieces of proof
            {visual.repos.length > 0 && <> from {visual.repos.join(", ")}</>}
          </Big>
        </div>
      );
    case "map":
      return (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ReadinessRing value={visual.now} projected={visual.projected} label={`→ ${pct(visual.projected)} by ${visual.byLabel}`} />
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-sm text-muted-foreground">The top {visual.gaps.length} of {visual.skills} skills, by share of job ads</p>
            <ul className="space-y-2.5">
              {visual.gaps.map((g) => (
                <li key={g.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                  <span className="truncate font-medium">{g.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm tabular-nums">{g.demandPct}% of ads</span>
                    <StatusBadge status={g.status} size="sm" />
                  </span>
                  <span className="col-span-2"><DemandBar value={g.demandPct} className={g.status === "gap" ? "bg-status-gap" : g.status === "proven" ? "bg-status-proven" : "bg-status-degree"} /></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    case "receipt":
      return (
        <div className="space-y-3">
          <div className={cn(panel, "flex flex-wrap items-baseline gap-x-4 gap-y-1")}>
            <p className="text-2xl font-semibold">Week {visual.week}: {visual.focus}</p>
            <p className="font-mono text-lg tabular-nums">{visual.demandPct}% of ads</p>
            {visual.trend && <StatusBadge status={visual.trend as "rising" | "stable" | "declining"} size="sm" />}
            <p className="w-full text-base">{visual.reason}</p>
          </div>
          <ul className="divide-y rounded-xl border">
            {visual.tasks.map((t) => (
              <li key={t.title} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">{t.title}</span>
                <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">{t.hours} h</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Proof for the week:</span> {visual.proof}</p>
          {visual.skip && (
            <p className="flex gap-2 rounded-xl border border-status-degree/30 bg-status-degree/10 p-3 text-sm">
              <GraduationCap className="mt-0.5 size-4 shrink-0 text-status-degree" aria-hidden />
              <span>{visual.skip.message}</span>
            </p>
          )}
        </div>
      );
    case "pod":
      return (
        <div className="space-y-3">
          <p className="flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold">
            <Users className="size-5 self-center text-primary" aria-hidden />{visual.name}
            <span className="font-mono text-lg font-normal tabular-nums text-muted-foreground">{visual.scorePct}% fit score</span>
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {visual.members.map((m) => (
              <li key={m.name} className={cn(panel, "p-3", m.isSubject && "ring-2 ring-primary/50")}>
                <p className="font-semibold">{m.name}{m.isSubject && <span className="font-normal text-muted-foreground"> (this story)</span>}</p>
                <p className="text-sm"><span className="text-muted-foreground">Learns:</span> {m.learns.join(", ") || "nothing yet"}</p>
                <p className="text-sm"><span className="text-muted-foreground">Teaches:</span> {m.teaches.join(", ") || "nothing yet"}</p>
              </li>
            ))}
          </ul>
          {visual.explanation && <blockquote className="border-l-2 border-primary pl-3 text-base">{visual.explanation}</blockquote>}
        </div>
      );
    case "project":
      return (
        <div className="space-y-3">
          <p className="text-2xl font-semibold">{visual.title}</p>
          {visual.repoUrl && (
            <a href={visual.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md font-mono text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              {visual.repoUrl.replace(/^https:\/\//, "")} ↗<span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <div className={panel}>
            <p className="flex items-center gap-2 font-semibold"><GitPullRequest className="size-4 text-primary" aria-hidden />Issue {visual.issue.number}: {visual.issue.title}</p>
            <p className="mt-1 text-sm"><span className="text-muted-foreground">Learning focus:</span> {visual.issue.skill}. <span className="text-muted-foreground">Reviewer:</span> {visual.issue.reviewer}</p>
            {visual.weekProof && <p className="mt-1 text-sm"><span className="text-muted-foreground">Roadmap proof:</span> {visual.weekProof}</p>}
          </div>
          <ol className="space-y-1 text-sm text-muted-foreground">
            {visual.milestones.map((m) => <li key={m}>{m}</li>)}
          </ol>
          <p className="text-sm text-muted-foreground">{visual.issues} issues in all, each with a podmate reviewer who knows the skill.</p>
        </div>
      );
    case "review":
      return (
        <div className="space-y-3">
          <p className="flex flex-wrap items-baseline gap-x-3 text-xl font-semibold">
            <GitPullRequest className="size-5 self-center text-primary" aria-hidden />PR {visual.prNumber}: {visual.prTitle}
            <span className="font-mono text-base font-normal tabular-nums text-muted-foreground">{visual.diffLines}-line diff</span>
          </p>
          <ol className="space-y-2">
            {visual.hints.map((h, i) => (
              <li key={h.topic} className={cn(panel, "p-3", i === 0 && "ring-2 ring-primary/50")}>
                <p className="font-semibold">{h.topic}</p>
                <p className="text-base">{h.question}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    case "delta":
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="font-mono text-5xl font-semibold tabular-nums text-muted-foreground">{pct(visual.before)}</p>
            <ArrowRight className="size-8 text-primary" aria-hidden />
            <p className="font-mono text-5xl font-semibold tabular-nums">{pct(visual.after)}</p>
            <p className="text-base text-muted-foreground">readiness, when {visual.skill} becomes <StatusBadge status="proven" size="sm" /></p>
          </div>
          <div className="space-y-1.5" aria-hidden>
            <DemandBar value={visual.before * 100} className="bg-muted-foreground/50" />
            <DemandBar value={visual.after * 100} className="bg-status-proven" />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li className={panel}><span className="font-mono text-2xl font-semibold tabular-nums">+{visual.points}</span> <span className="text-sm text-muted-foreground">momentum points for the learner</span></li>
            <li className={panel}><span className="font-semibold">{visual.reviewer}</span> <span className="text-sm text-muted-foreground">earns a code-review proof for teaching</span></li>
          </ul>
          <p className="text-sm text-muted-foreground">
            {visual.merged ? "Merged: these numbers come from the stored proof." : "Nothing has merged yet: this is the proof engine's own formula applied to the live Bridge Map."}
          </p>
        </div>
      );
    case "ladder":
      return (
        <ol className="flex flex-col-reverse gap-2">
          {visual.rungs.map((r) => (
            <li key={r.rung} className={cn(panel, "flex items-start gap-3 p-3", r.done && "border border-status-proven/30 bg-status-proven/10")}>
              {r.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0">
                <span className="font-semibold">Rung {r.rung}: {r.label}</span>
                <span className="sr-only">{r.done ? ", done" : ", open"}</span>
                <span className="block text-sm text-muted-foreground">{r.meaning}</span>
              </span>
            </li>
          ))}
        </ol>
      );
    case "cohort":
      return (
        <div className="space-y-3">
          <p className="text-base"><span className="font-mono text-3xl font-semibold tabular-nums">{visual.cohortSize}</span> <span className="text-muted-foreground">students in the anonymous cohort view</span></p>
          <div role="region" tabIndex={0} aria-label="Top cohort gaps" className="overflow-x-auto rounded-xl border outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Skills no module covers, with demand and how many students need or can teach them</caption>
              <thead className="bg-muted/60 text-muted-foreground">
                <tr><th scope="col" className="px-3 py-2 font-medium">Skill</th><th scope="col" className="px-3 py-2 font-medium">Share of ads</th><th scope="col" className="px-3 py-2 font-medium">Need it</th><th scope="col" className="px-3 py-2 font-medium">Can teach it</th></tr>
              </thead>
              <tbody className="divide-y">
                {visual.gaps.map((g) => (
                  <tr key={g.name}>
                    <th scope="row" className="px-3 py-2 font-medium">{g.name}</th>
                    <td className="px-3 py-2 font-mono tabular-nums">{g.demandPct}%</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{g.students} of {visual.cohortSize}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{g.teachers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visual.labIdea && <p className={cn(panel, "text-base")}><span className="font-semibold">Suggested lab:</span> {visual.labIdea}</p>}
        </div>
      );
    case "flywheel":
      return (
        <div className="space-y-4">
          <ol className="flex flex-wrap items-center gap-2 text-base font-medium">
            {visual.loop.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-full border bg-card px-3 py-1">{step}</span>
                {i < visual.loop.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" aria-hidden /> : <><Repeat className="size-4 text-primary" aria-hidden /><span className="sr-only">and back to the start</span></>}
              </li>
            ))}
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <Big value={visual.trajectories}>senior journeys guide newcomers on this programme</Big>
            <Big value={`${visual.openToChat} of ${visual.trajectories}`}>seniors are open to a short chat</Big>
          </div>
        </div>
      );
  }
}
