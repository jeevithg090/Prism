"use client";
// "Why pods work": a pedagogy receipt with real citations (WIN-PLAN item 7).
import * as React from "react";
import {
  BookOpenCheck,
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
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-sm leading-snug font-medium text-pretty text-foreground">
                {r.claim}
              </p>
              {r.cite && (
                <a
                  href={r.cite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm text-sm text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span>
                    {r.cite.authors} ({r.cite.year}),{" "}
                    <cite>{r.cite.journal}</cite>{" "}
                    {r.cite.issue}
                  </span>
                  <span className="sr-only"> (opens in a new tab)</span>
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
      <BookOpenCheck className="size-4 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold">Why pods work</h3>
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
          "space-y-3 rounded-xl bg-muted p-4 sm:p-5",
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
            size="sm"
            className={className}
            aria-label="Why pods work: the research"
          />
        }
      >
        <BookOpenCheck aria-hidden />
        Why?
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(26rem,calc(100vw-2rem))] gap-4 rounded-2xl p-5"
      >
        <Heading />
        <ReceiptList dense />
      </PopoverContent>
    </Popover>
  );
}

export default WhyPodsWork;
