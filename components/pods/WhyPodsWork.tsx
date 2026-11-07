"use client";
// "Why pods work": a pedagogy receipt with real citations (WIN-PLAN item 7).
import * as React from "react";
import {
  BookOpenCheck,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Receipt = {
  icon: LucideIcon;
  claim: string;
  cite?: {
    authors: string;
    year: number;
    journal: string;
    issue: string;
    url: string;
  };
};

export const WHY_PODS_RECEIPTS: Receipt[] = [
  {
    icon: GraduationCap,
    claim: "Expecting to teach makes you learn better.",
    cite: {
      authors: "Nestojko, Bui, Kornell & Bjork",
      year: 2014,
      journal: "Memory & Cognition",
      issue: "42(7)",
      url: "https://doi.org/10.3758/s13421-014-0416-z",
    },
  },
  {
    icon: Users,
    claim:
      "Peer review raises academic performance: a meta-analysis of 54 studies found an effect of g = 0.31.",
    cite: {
      authors: "Double, McGrane & Hopfenbeck",
      year: 2020,
      journal: "Educational Psychology Review",
      issue: "32",
      url: "https://doi.org/10.1007/s10648-019-09510-3",
    },
  },
  {
    icon: ShieldCheck,
    claim:
      "Matched on skills, interests and availability. Never on personal characteristics.",
  },
];

function ReceiptList({ dense }: { dense?: boolean }) {
  return (
    <ul className={cn("flex flex-col", dense ? "gap-3" : "gap-4")}>
      {WHY_PODS_RECEIPTS.map((r) => {
        const Icon = r.icon;
        return (
          <li key={r.claim} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-snug text-foreground">
                {r.claim}
              </p>
              {r.cite && (
                <a
                  href={r.cite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-wrap items-baseline gap-x-1 rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-2 outline-none hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    {r.cite.authors} ({r.cite.year}),{" "}
                    <cite className="italic">{r.cite.journal}</cite>{" "}
                    {r.cite.issue}
                  </span>
                  <ExternalLink className="size-3 self-center" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <BookOpenCheck className="size-4 text-primary" aria-hidden />
      <h3 className="text-sm font-semibold">Why pods work</h3>
    </div>
  );
}

export function WhyPodsWork({
  variant = "popover",
  className,
}: {
  variant?: "popover" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <section
        aria-label="Why pods work"
        className={cn(
          "space-y-3 rounded-2xl border bg-muted/30 p-4 sm:p-5",
          className,
        )}
      >
        <Heading />
        <ReceiptList />
      </section>
    );
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            className={cn("rounded-full", className)}
            aria-label="Why pods work: the research"
          />
        }
      >
        <BookOpenCheck aria-hidden />
        Why?
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-2xl p-4"
      >
        <Heading />
        <ReceiptList dense />
      </PopoverContent>
    </Popover>
  );
}

export default WhyPodsWork;
