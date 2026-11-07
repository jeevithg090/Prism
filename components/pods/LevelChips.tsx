"use client";
// Reply level-3 markers: small outline tags judges can tick off on screen.
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
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-rule-2 bg-card px-2 text-xs font-medium text-foreground transition-[background-color,color,transform] duration-(--dur-short) outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
                  />
                }
              >
                <span className="border-r border-rule-2 pr-1.5 font-semibold">
                  L3
                </span>
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
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
