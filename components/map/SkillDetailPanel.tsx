"use client";
// The side card for the selected skill: status, then the next step (high in the card, clear of the floating
// Coach button), then demand, degree and proof with the Why? receipt that explains them.
import Link from "next/link";
import { BadgeCheck, ExternalLink, GitPullRequest, GraduationCap, HelpCircle } from "lucide-react";
import type { BridgeNode, EvidenceItem, RoadmapWeek, SkippedItem } from "@/lib/types";
import { ReceiptDrawer } from "@/components/keystone/ReceiptDrawer";
import { StatusTag } from "./StatusTag";
import { buttonVariants } from "@/components/ui/button";
import { roleName } from "@/lib/graph/roles";
import { cn } from "@/lib/utils";
import { degreeText, FOCUS, nodeReceipt, pctOf } from "./mapUtils";

export interface PodIssueRef { podId: string; title: string; n: number }

const dayMonth = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};

/** Three rising bars, the same level mark a SkillChip carries. */
function LevelBars({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("w-1.5 rounded-xs", i === 1 ? "h-2" : i === 2 ? "h-3" : "h-4", i <= level ? "bg-foreground" : "bg-rule-2")} />
        ))}
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
  return (
    <section aria-labelledby="skill-detail-h" className="rounded-2xl border bg-card shadow-sm">
      <div className="space-y-3 p-6 pb-5">
        <h2 id="skill-detail-h" className="text-2xl font-semibold text-foreground">{node.name}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex flex-wrap gap-1.5">
            <StatusTag status={node.status} />
            {node.trend && <StatusTag status={node.trend} />}
          </span>
          <LevelBars level={node.level} />
        </div>
      </div>

      <div className="space-y-3 border-t px-6 py-5">
        <h3 className="text-base font-semibold text-foreground">Next step</h3>
        {skipped && (
          <p className="flex gap-2.5 rounded-xl bg-muted p-3 text-sm text-foreground">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-status-degree" aria-hidden />
            <span>{skipped.message}</span>
          </p>
        )}
        {week && (
          <div className="space-y-2">
            <Link href={`/roadmap#skill-${node.skillId}`} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
              {node.status === "gap" ? `Start week ${week.week}: ${node.name}` : `Week ${week.week}: a head start on ${node.name}`}
            </Link>
            <p className="text-sm text-muted-foreground">
              <span className="block font-medium text-foreground">From {dayMonth(week.startDate)}, {week.tasks.reduce((s, t) => s + t.hours, 0)} hours</span>
              {week.proof}
            </p>
          </div>
        )}
        {!week && !skipped && node.status === "gap" && (
          <p className="text-sm text-muted-foreground">Not in your next 12 weeks yet: higher-demand gaps come first.</p>
        )}
        {node.status === "proven" && (
          <Link href={`/profile/${uid}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}>
            Show your proof
          </Link>
        )}
        {node.status === "degree-done" && (
          <p className="text-sm text-muted-foreground">Your degree covered it. A merged pod PR would turn it into proof.</p>
        )}
        {issue && (
          <Link
            href={`/pods/${issue.podId}`}
            className={cn("group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm transition-[background-color] duration-(--dur-short) hover:bg-muted", FOCUS)}
          >
            <GitPullRequest className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 text-muted-foreground">
              <span className="font-medium text-primary underline decoration-1 underline-offset-4 group-hover:decoration-2">Pod issue #{issue.n}</span>: {issue.title}
            </span>
          </Link>
        )}
      </div>

      <div className="space-y-4 border-t px-6 py-5">
        <dl className="space-y-3">
          <div>
            <dt className="sr-only">Demand</dt>
            <dd className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-4xl leading-none font-semibold text-foreground tabular-nums">{pctOf(node.demand)}%</span>
              <span className="text-muted-foreground">of {roleName(roleId)} ads</span>
            </dd>
          </div>
          <div className="flex gap-2.5 pt-1">
            <dt className="sr-only">Degree</dt>
            <GraduationCap className="mt-0.5 size-5 shrink-0 text-status-degree" aria-hidden />
            <dd className="text-foreground">{degreeText(node)}</dd>
          </div>
          <div className="flex gap-2.5">
            <dt className="sr-only">Proof</dt>
            <BadgeCheck className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
            <dd className="min-w-0 text-foreground">
              {mine.length ? (
                <ul className="space-y-1.5">
                  {mine.map((e) => (
                    <li key={e.id}>
                      <a href={e.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-start gap-1 rounded-sm break-words text-primary underline decoration-1 underline-offset-4 hover:decoration-2", FOCUS)}>
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
        <ReceiptDrawer
          receipt={receipt}
          title={week ? `Week ${week.week}: ${node.name}` : node.name}
          roleName={roleName(roleId)}
          evidence={evidence}
          moduleLabel={node.upcomingLabel}
          trigger={
            <button type="button" className={cn(buttonVariants({ variant: "ghost" }), "h-10 w-full")}>
              <HelpCircle className="size-4" aria-hidden /> Why does {node.name} matter?
            </button>
          }
        />
      </div>
    </section>
  );
}
