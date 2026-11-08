"use client";
// Industry Radar: rising skills your roadmap already covers (and the rising ones it doesn't yet), each linking to /roadmap.
// Rows split by hairlines inside one card: the growth figure leads, the roadmap week is the link.
import Link from "next/link";
import { Route, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { skillName } from "@/lib/schemas/community";
import { cn } from "@/lib/utils";
import { StatusTag } from "./StatusTag";
import { growthParts, growthText, pctAds, type RisingItem } from "./summaries";

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
      <p className="text-base text-pretty text-foreground" data-testid="rising-summary">{risingCoveredSummary(items, roleLabel)}</p>
      <ul className="border-t">
        {shown.map((i) => (
          <li key={i.skillId} className="flex flex-col gap-2 border-b py-4 last:border-b-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
                <TrendingUp className="size-5 shrink-0 self-center text-status-rising" aria-hidden />
                <span className="truncate">{skillName(i.skillId)}</span>
              </span>
              <span className="shrink-0 text-sm text-muted-foreground"><span className="font-mono text-lg font-semibold text-foreground tabular-nums">{growthParts(i.growthPerYear)[0]}</span> {growthParts(i.growthPerYear)[1]}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Rising in job posts, and in <span className="font-mono tabular-nums">{pctAds(i.share)}</span> of {roleLabel} ads
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {i.week !== undefined ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"><Route className="size-4 text-muted-foreground" aria-hidden />Week {i.week} of your roadmap</span>
              ) : (
                <span className="text-sm text-foreground">{hasRoadmap ? "Not in your roadmap yet" : "Not planned yet"}</span>
              )}
              {i.status && <StatusTag status={i.status} />}
              <Link
                href="/roadmap"
                aria-label={`${i.week !== undefined ? `See week ${i.week}` : "Open your roadmap"} for ${skillName(i.skillId)}`}
                className={cn(buttonVariants({ variant: "link" }), "ml-auto min-h-10 text-base")}
              >
                {i.week !== undefined ? `See week ${i.week}` : "Open your roadmap"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
