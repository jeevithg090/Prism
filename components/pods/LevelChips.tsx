"use client";
// Reply level-3 markers: small outline pills judges can tick off on screen.
import * as React from "react";
import { Megaphone, Network, Workflow, type LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type LevelItem = "multi-agent" | "knowledge-graph" | "launch-campaign";

export const LEVEL_ITEMS: Record<
  LevelItem,
  { icon: LucideIcon; label: string; tip: string }
> = {
  "multi-agent": {
    icon: Workflow,
    label: "Multi-agent",
    tip: "Multi-agent: Matchmaker, Architect, Tech Lead and Evidence agents hand off to each other.",
  },
  "knowledge-graph": {
    icon: Network,
    label: "Knowledge graph",
    tip: "Knowledge graph: your skills, modules, job ads and who teaches whom, connected in one graph.",
  },
  "launch-campaign": {
    icon: Megaphone,
    label: "Launch campaign",
    tip: "Launch campaign: Bridge Week brings Keystone to the 10 campuses on Reply's university tour.",
  },
};

export function LevelChips({
  items,
  className,
}: {
  items: LevelItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="Reply level 3 features"
    >
      {items.map((id) => {
        const item = LEVEL_ITEMS[id];
        const Icon = item.icon;
        return (
          <li key={id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    data-level={id}
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/25 bg-background px-2 text-xs font-medium text-foreground transition-colors outline-none hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                }
              >
                <span className="rounded-full bg-primary/10 px-1 text-[10px] font-semibold leading-4 text-primary">
                  L3
                </span>
                <Icon className="size-3.5 text-primary" aria-hidden />
                {item.label}
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-pretty">
                {item.tip}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

export default LevelChips;
