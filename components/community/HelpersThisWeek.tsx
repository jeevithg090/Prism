"use client";
import * as React from "react";
import { HeartHandshake } from "lucide-react";
import { BadgePill, EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import type { HelpRequest } from "@/lib/types";
import { displayName, helpersThisWeek, type ProfilesById } from "./help";
import { PersonAvatar } from "./PersonAvatar";

/** Opt-in: hidden until the viewer chooses to see it, so nobody gets a leaderboard pushed at them. */
export function HelpersThisWeek({
  requests, profiles, isLoading, isError, onRetry,
}: {
  requests: HelpRequest[];
  profiles: ProfilesById;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [show, setShow] = React.useState(false);
  // Only computed once the viewer opts in (client-side), so the server prerender never reads the clock.
  const top = show ? helpersThisWeek(requests) : [];

  return (
    <SectionCard
      title="Helpers this week"
      description="Celebrating helpers, not ranking students."
      actions={
        <Button variant="outline" size="sm" aria-expanded={show} aria-controls="helpers-this-week" onClick={() => setShow((s) => !s)}>
          {show ? "Hide" : "Show helpers"}
        </Button>
      }
    >
      <div id="helpers-this-week">
        {!show ? (
          <p className="text-sm text-muted-foreground">This list is opt-in. Show it to thank the people who helped this week.</p>
        ) : isLoading ? (
          <LoadingSkeleton variant="list" />
        ) : isError ? (
          <ErrorState title="We couldn't load this week's helpers" onRetry={onRetry} />
        ) : top.length === 0 ? (
          <EmptyState icon={HeartHandshake} title="Nobody has helped yet this week" body="Be the first: pick a request from the feed and say you can help." />
        ) : (
          <ol aria-label="Helpers this week" className="space-y-3">
            {top.map((h) => {
              const p = profiles[h.userId];
              return (
                <li key={h.userId} className="flex items-center gap-3">
                  <PersonAvatar userId={h.userId} profile={p} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{displayName(h.userId, p)}</p>
                    <BadgePill badge="helper" />
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums">{h.count} {h.count === 1 ? "help" : "helps"}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </SectionCard>
  );
}
