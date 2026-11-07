"use client";
// The interactive force graph: sized to its data, loaded without SSR, with a spoken text alternative.
import * as React from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { Maximize2 } from "lucide-react";
import type { BridgeEdge, BridgeNode, SkillStatus } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GraphLink, GraphNode } from "./ForceGraphCanvas";
import { statusCounts } from "./mapUtils";

const ForceGraphCanvas = dynamic(() => import("./ForceGraphCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-lg" aria-hidden />,
});

const toGraph = (n: BridgeNode): GraphNode => ({ id: n.skillId, name: n.name, status: n.status, demand: n.demand, trend: n.trend });

export function BridgeGraph({
  nodes, edges, selectedId, focusId, onSelect, summary, allNodes,
}: {
  nodes: BridgeNode[]; edges: BridgeEdge[]; selectedId?: string | null; focusId?: string | null;
  onSelect: (id: string) => void; summary: string;
  /** Every skill before filtering: sizes the map once, so a filter never makes the page jump. */
  allNodes?: BridgeNode[];
}) {
  const reduce = useReducedMotion() ?? false;
  const box = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [fit, setFit] = React.useState(0);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gNodes = React.useMemo<GraphNode[]>(() => nodes.slice(0, 120).map(toGraph), [nodes]);
  const gLinks = React.useMemo<GraphLink[]>(() => {
    const ids = new Set(gNodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to }));
  }, [edges, gNodes]);
  const everyone = allNodes ?? nodes;
  const counts = React.useMemo<Record<SkillStatus, number>>(() => statusCounts(everyone), [everyone]);
  const layoutNodes = React.useMemo<GraphNode[]>(() => everyone.slice(0, 120).map(toGraph), [everyone]);
  // The box takes the height the full map needs at this width, so it is fitted at zoom 1 and labels keep their size.
  const [needed, setNeeded] = React.useState<number | null>(null);
  const onLayoutHeight = React.useCallback((h: number) => setNeeded(Math.round(Math.min(Math.max(h, 320), 960))), []);
  const height = needed;

  return (
    <figure className="relative" aria-label="Bridge Map graph">
      <div
        ref={box}
        style={height ? { height } : undefined}
        className={cn(
          "w-full overflow-hidden",
          !height && "h-[30rem]",
          // The library's hover tooltip, set in the system's popover.
          "[&_.float-tooltip-kap]:rounded-lg! [&_.float-tooltip-kap]:border! [&_.float-tooltip-kap]:border-border! [&_.float-tooltip-kap]:bg-popover! [&_.float-tooltip-kap]:px-2.5! [&_.float-tooltip-kap]:py-1.5! [&_.float-tooltip-kap]:font-sans! [&_.float-tooltip-kap]:text-sm! [&_.float-tooltip-kap]:font-medium! [&_.float-tooltip-kap]:text-popover-foreground! [&_.float-tooltip-kap]:shadow-md!",
        )}
        aria-hidden
      >
        {size.w > 0 && size.h > 0 && (
          <ForceGraphCanvas
            nodes={gNodes} links={gLinks} width={size.w} height={size.h} counts={counts}
            layoutNodes={layoutNodes} onLayoutHeight={onLayoutHeight}
            selectedId={selectedId} focusId={focusId} fitSignal={fit} reduceMotion={reduce} onSelect={onSelect}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setFit((f) => f + 1)}
        aria-label="Zoom to fit the whole map"
        title="Zoom to fit the whole map"
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "absolute top-2 right-2 after:absolute after:-inset-1 active:translate-y-px")}
      >
        <Maximize2 aria-hidden />
      </button>
      {/* The graph's text alternative: read out, and re-announced on every filter change, but not printed,
          since the readiness lead, the chips and the band heads already show these numbers. */}
      <figcaption className="sr-only" aria-live="polite">{summary}</figcaption>
    </figure>
  );
}
