"use client";
// Contract §9.6 ReceiptDrawer: every recommendation's "Why?". A sheet that shows the numbers behind it:
// share of job ads, the trend, what your degree covers, your proof, and the agent that worked it out.
import * as React from "react";
import { BadgeCheck, BarChart3, ExternalLink, GraduationCap, TrendingUp } from "lucide-react";
import type { AgentName, EvidenceItem, Receipt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AgentAvatar, StatusBadge } from "./index";

export interface ReceiptDrawerProps {
  receipt: Receipt;
  /** What the receipt explains, e.g. "Week 1 · Docker". */
  title: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens the drawer (uncontrolled use). Defaults to a "Why?" button. */
  trigger?: React.ReactElement;
  /** "ML engineer", for "41% of ML engineer ads". */
  roleName?: string;
  /** Evidence to link for receipt.evidenceIds. */
  evidence?: Pick<EvidenceItem, "id" | "url" | "quote" | "source">[];
  /** "Year 1 · Semester 2", shown next to the module code. */
  moduleLabel?: string;
  agent?: AgentName;
}

const SOURCE_LABEL: Record<EvidenceItem["source"], string> = {
  github: "GitHub", leetcode: "LeetCode", codeforces: "Codeforces", stackoverflow: "Stack Overflow", kaggle: "Kaggle",
  "linkedin-pdf": "LinkedIn", certificate: "Certificate", "keystone-pod": "Pod PR", "keystone-interview": "Mock interview",
  "micro-challenge": "Challenge",
};

function degreeLine(r: Receipt, moduleLabel?: string): string {
  const mod = r.moduleCode ? `${r.moduleCode}${moduleLabel ? `, ${moduleLabel}` : ""}` : moduleLabel;
  if (r.coveredByDegree === "done") return mod ? `Your degree already covered it in ${mod}.` : "Your degree already covered it.";
  if (r.coveredByDegree === "upcoming") return mod ? `Your degree teaches it later, in ${mod}.` : "Your degree teaches it later.";
  return "None of your modules teach it.";
}

function Row({ icon: Icon, label, children, tone }: { icon: typeof BarChart3; label: string; children: React.ReactNode; tone: string }) {
  return (
    <div className="flex gap-4 py-4">
      <span className={cn("mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-base text-foreground">{children}</dd>
      </div>
    </div>
  );
}

export function ReceiptDrawer({
  receipt, title, open, onOpenChange, trigger, roleName = "your target role's", evidence, moduleLabel, agent = "roadmap",
}: ReceiptDrawerProps) {
  const ids = receipt.evidenceIds ?? [];
  const linked = (evidence ?? []).filter((e) => ids.includes(e.id));
  const growth = typeof receipt.growthPerYear === "number" ? Math.round(receipt.growthPerYear * 100) : null;
  const controlled = open !== undefined;
  return (
    <Sheet {...(controlled ? { open, onOpenChange: (o: boolean) => onOpenChange?.(o) } : {})}>
      {!controlled && (
        <SheetTrigger
          render={
            trigger ?? (
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-xl border bg-card px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              />
            )
          }
        >
          {trigger ? (trigger.props as { children?: React.ReactNode }).children : "Why?"}
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b p-6 pr-14">
          <SheetTitle className="text-xl font-semibold">Why am I seeing this?</SheetTitle>
          <SheetDescription className="text-base">{title}</SheetDescription>
        </SheetHeader>
        <div className="px-6">
          <dl className="divide-y">
            <Row icon={BarChart3} label="Job ads" tone="bg-primary/10 text-primary">
              <span className="font-mono text-4xl font-semibold tabular-nums">{receipt.demandPct}%</span>
              <span className="ml-2 text-muted-foreground">of {roleName} ads ask for it</span>
            </Row>
            <Row icon={TrendingUp} label="Trend" tone="bg-status-rising/10 text-status-rising">
              {receipt.trend ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex [&>span]:text-foreground", receipt.trend === "rising" && "[&_svg]:text-status-rising")}>
                    <StatusBadge status={receipt.trend} />
                  </span>
                  {growth !== null && <span className="font-mono tabular-nums">{growth > 0 ? "+" : ""}{growth}% a year</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">No trend data for this skill yet.</span>
              )}
            </Row>
            <Row icon={GraduationCap} label="Your degree" tone="bg-status-degree/10 text-status-degree">
              {degreeLine(receipt, moduleLabel)}
            </Row>
            <Row icon={BadgeCheck} label="Your proof" tone="bg-status-proven/10 text-status-proven">
              {linked.length ? (
                <ul className="space-y-2">
                  {linked.map((e) => (
                    <li key={e.id}>
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-start gap-1.5 rounded-md text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>{SOURCE_LABEL[e.source]}{e.quote ? `: ${e.quote}` : ""}</span>
                        <ExternalLink className="mt-1 size-3.5 shrink-0" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : ids.length ? (
                `${ids.length} evidence ${ids.length === 1 ? "item" : "items"} on your Bridge Map.`
              ) : (
                <span className="text-muted-foreground">No proof yet. This week&apos;s pull request will be your first.</span>
              )}
            </Row>
          </dl>
          <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-base text-foreground">{receipt.reason}</p>
        </div>
        <div className="mt-auto flex items-start gap-3 border-t p-6 text-sm text-muted-foreground">
          <AgentAvatar agent={agent} />
          <p>Worked out by the Roadmap Agent from job ads, your syllabus and your proof. Agents propose, you decide.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ReceiptDrawer;
