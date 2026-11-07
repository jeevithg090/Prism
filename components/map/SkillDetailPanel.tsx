"use client";
// The side card for the selected skill: status, demand, degree, proof, and the next step.
import Link from "next/link";
import { ArrowRight, BadgeCheck, ExternalLink, GitPullRequest, GraduationCap, HelpCircle } from "lucide-react";
import type { BridgeNode, EvidenceItem, RoadmapWeek, SkippedItem } from "@/lib/types";
import { ReceiptDrawer } from "@/components/keystone/ReceiptDrawer";
import { StatusTag } from "./StatusTag";
import { buttonVariants } from "@/components/ui/button";
import { roleName } from "@/lib/graph/roles";
import { cn } from "@/lib/utils";
import { degreeText, nodeReceipt, pctOf } from "./mapUtils";

export interface PodIssueRef { podId: string; title: string; n: number }

const dayMonth = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};

function LevelDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => <span key={i} className={cn("size-2 rounded-full", i <= level ? "bg-foreground" : "bg-border")} />)}
      </span>
      Level {level} of 3
    </span>
  );
}

export function SkillDetailPanel({
  node, roleId, uid, evidence, week, skipped, issue,
}: {
  node: BridgeNode; roleId: string; uid: string; evidence: EvidenceItem[];
  week?: RoadmapWeek; skipped?: SkippedItem; issue?: PodIssueRef;
}) {
  const mine = evidence.filter((e) => node.evidenceIds.includes(e.id));
  const receipt = week?.receipt ?? nodeReceipt(node, roleId);
  const btn = "h-10 rounded-xl px-4 text-sm";
  return (
    <section aria-labelledby="skill-detail-h" className="rounded-2xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Selected skill</p>
      <h2 id="skill-detail-h" className="mt-1 text-2xl font-semibold tracking-tight">{node.name}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusTag status={node.status} />
        {node.trend && <StatusTag status={node.trend} />}
      </div>
      <div className="mt-3"><LevelDots level={node.level} /></div>

      <dl className="mt-5 space-y-4">
        <div>
          <dt className="sr-only">Demand</dt>
          <dd>
            <span className="font-mono text-4xl font-semibold tabular-nums">{pctOf(node.demand)}%</span>
            <span className="ml-2 text-muted-foreground">of {roleName(roleId)} ads</span>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">Degree</dt>
          <GraduationCap className="mt-0.5 size-5 shrink-0 text-status-degree" aria-hidden />
          <dd>{degreeText(node)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">Proof</dt>
          <BadgeCheck className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
          <dd className="min-w-0">
            {mine.length ? (
              <ul className="space-y-1.5">
                {mine.map((e) => (
                  <li key={e.id}>
                    <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 break-words text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                      {e.quote ?? e.url}
                      <ExternalLink className="mt-1 size-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : node.evidenceIds.length ? (
              `${node.evidenceIds.length} evidence ${node.evidenceIds.length === 1 ? "item" : "items"}`
            ) : (
              <span className="text-muted-foreground">No proof yet</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-6 space-y-3 border-t pt-5">
        <h3 className="text-sm font-semibold text-foreground">Next step</h3>
        {skipped && (
          <p className="rounded-xl border border-status-degree/25 bg-status-degree/10 p-3 text-sm text-foreground">{skipped.message}</p>
        )}
        {week && (
          <>
            <Link href={`/roadmap#skill-${node.skillId}`} className={cn(buttonVariants(), btn, "w-full")}>
              {node.status === "gap" ? `Start week ${week.week}: ${node.name}` : `Week ${week.week}: a head start on ${node.name}`}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="text-sm text-muted-foreground">From {dayMonth(week.startDate)} · {week.tasks.reduce((s, t) => s + t.hours, 0)} hours · {week.proof}</p>
          </>
        )}
        {!week && !skipped && node.status === "gap" && (
          <p className="text-sm text-muted-foreground">Not in your next 12 weeks yet: higher-demand gaps come first.</p>
        )}
        {node.status === "proven" && (
          <Link href={`/profile/${uid}`} className={cn(buttonVariants({ variant: "outline" }), btn, "w-full")}>
            Show your proof <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        {node.status === "degree-done" && (
          <p className="text-sm text-muted-foreground">Your degree covered it. A merged pod PR would turn it into proof.</p>
        )}
        {issue && (
          <Link href={`/pods/${issue.podId}`} className={cn(buttonVariants({ variant: "outline" }), btn, "h-auto min-h-10 w-full justify-start py-2 whitespace-normal text-left")}>
            <GitPullRequest className="size-4" aria-hidden />
            <span>Pod issue #{issue.n}: {issue.title}</span>
          </Link>
        )}
        <ReceiptDrawer
          receipt={receipt}
          title={week ? `Week ${week.week} · ${node.name}` : node.name}
          roleName={roleName(roleId)}
          evidence={evidence}
          moduleLabel={node.upcomingLabel}
          trigger={
            <button type="button" className={cn(buttonVariants({ variant: "ghost" }), btn, "w-full")}>
              <HelpCircle className="size-4" aria-hidden /> Why does {node.name} matter?
            </button>
          }
        />
      </div>
    </section>
  );
}
