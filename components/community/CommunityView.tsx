"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";
import { AskComposer } from "./AskComposer";
import { GuidesSection } from "./GuidesSection";
import { HelpFeed } from "./HelpFeed";
import { HelpersThisWeek } from "./HelpersThisWeek";
import { ModuleHelpAsk } from "./module-help/ModuleHelpAsk";
import { isNewcomer, sortHelpFeed } from "./help";
import { useProfiles } from "./useProfiles";
import { useViewerId } from "./useViewerId";

export function CommunityView() {
  const viewerId = useViewerId();
  const [demo, setDemo] = React.useState(false);
  const help = useQuery({
    queryKey: ["help", demo ? "demo" : "live"],
    queryFn: () => apiGet<HelpRequest[]>(demo ? "/api/help?demo=1" : "/api/help"),
  });

  const all = React.useMemo(() => help.data ?? [], [help.data]);
  const profiles = useProfiles([viewerId, ...all.map((r) => r.fromUserId), ...all.flatMap((r) => (r.toUserId ? [r.toUserId] : []))]);
  const feed = sortHelpFeed(all.filter((r) => r.status === "open"), profiles);
  const retry = () => void help.refetch();

  return (
    <div className="grid gap-x-6 gap-y-8 pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <HelpFeed
          requests={feed}
          profiles={profiles}
          viewerId={viewerId}
          isLoading={help.isPending}
          isError={help.isError}
          onRetry={retry}
          onUseDemo={() => setDemo(true)}
          isDemo={demo || profiles[viewerId]?.isDemo === true}
        />
      </div>
      {/* The composer and this week's helpers travel beside the feed while you read it; they stop below the shell's top bar. */}
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <div className="space-y-8 lg:sticky lg:top-[calc(var(--topbar-height)+1.5rem)] lg:z-(--z-sticky)">
          <AskComposer viewerId={viewerId} newcomer={isNewcomer(profiles[viewerId])} />
          <ModuleHelpAsk viewerId={viewerId} newcomer={isNewcomer(profiles[viewerId])} />
          <HelpersThisWeek requests={all} profiles={profiles} isLoading={help.isPending} isError={help.isError} onRetry={retry} />
        </div>
      </div>
      <div className="min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-2">
        <GuidesSection viewerId={viewerId} />
      </div>
    </div>
  );
}
