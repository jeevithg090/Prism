"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";
import { AskComposer } from "./AskComposer";
import { HelpFeed } from "./HelpFeed";
import { HelpersThisWeek } from "./HelpersThisWeek";
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
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HelpFeed
            requests={feed}
            profiles={profiles}
            viewerId={viewerId}
            isLoading={help.isPending}
            isError={help.isError}
            onRetry={retry}
            onUseDemo={() => setDemo(true)}
          />
        </div>
        <div className="space-y-6">
          <AskComposer viewerId={viewerId} newcomer={isNewcomer(profiles[viewerId])} />
          <HelpersThisWeek requests={all} profiles={profiles} isLoading={help.isPending} isError={help.isError} onRetry={retry} />
        </div>
      </div>
    </div>
  );
}
