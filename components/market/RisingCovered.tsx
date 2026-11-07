"use client";
// Industry Radar: rising skills your roadmap already covers (and the rising ones it doesn't yet), each linking to /roadmap.
import Link from "next/link";
import { ArrowRight, Route, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { skillName } from "@/lib/schemas/community";
import { cn } from "@/lib/utils";
import { StatusTag } from "./StatusTag";
import { growthText, pctAds, type RisingItem } from "./summaries";

export function risingCoveredSummary(items: RisingItem[], roleLabel: string): string {
  const covered = items.filter((i) => i.week !== undefined);
  if (!items.length) return `None of the skills ${roleLabel} ads ask for is rising fast right now.`;
  if (!covered.length) return `${items.length} rising skill${items.length === 1 ? "" : "s"} ${roleLabel} ads ask for ${items.length === 1 ? "isn't" : "aren't"} in your roadmap yet.`;
  const [first] = covered;
  return `${skillName(first.skillId)} is rising fast (${growthText(first.growthPerYear)}). Your roadmap already includes it in week ${first.week}.`;
}

export function RisingCovered({ items, roleLabel, hasRoadmap }: { items: RisingItem[]; roleLabel: string; hasRoadmap: boolean }) {
  const covered = items.filter((i) => i.week !== undefined);
  const notYet = items.filter((i) => i.week === undefined && i.status !== "proven");
  const shown = (covered.length ? covered : notYet).slice(0, 3);
  if (!shown.length) {
    return <p className="text-muted-foreground">{risingCoveredSummary(items, roleLabel)}</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-base text-foreground" data-testid="rising-summary">{risingCoveredSummary(items, roleLabel)}</p>
      <ul className="grid gap-4 md:grid-cols-3">
        {shown.map((i) => (
          <li key={i.skillId} className="flex h-full flex-col gap-3 rounded-xl border border-status-rising/25 bg-status-rising/10 p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-status-rising" aria-hidden />
              <span className="text-lg font-semibold">{skillName(i.skillId)}</span>
            </div>
            <p className="text-sm text-foreground">
              <span className="font-semibold tabular-nums">{growthText(i.growthPerYear)}</span> in job posts · in {pctAds(i.share)} of {roleLabel} ads
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {i.week !== undefined ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-sm font-medium"><Route className="size-4 text-primary" aria-hidden />Roadmap · week {i.week}</span>
              ) : (
                <span className="text-sm text-foreground">{hasRoadmap ? "Not in your roadmap yet" : "Not planned yet"}</span>
              )}
              {i.status && <StatusTag status={i.status} />}
            </div>
            <Link
              href="/roadmap"
              aria-label={`${i.week !== undefined ? `See week ${i.week}` : "Open your roadmap"} for ${skillName(i.skillId)}`}
              className={cn(buttonVariants({ variant: "outline" }), "mt-auto h-10 w-fit rounded-xl px-3 text-base")}
            >
              {i.week !== undefined ? `See week ${i.week}` : "Open your roadmap"}
              <ArrowRight aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
