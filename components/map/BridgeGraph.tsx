"use client";
// The interactive force graph: sized to its card, loaded without SSR, with a text alternative alongside.
import * as React from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { Maximize2 } from "lucide-react";
import type { BridgeEdge, BridgeNode } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import type { GraphLink, GraphNode } from "./ForceGraphCanvas";

const ForceGraphCanvas = dynamic(() => import("./ForceGraphCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-xl" aria-hidden />,
});

export function BridgeGraph({
  nodes, edges, selectedId, focusId, onSelect, summary,
}: {
  nodes: BridgeNode[]; edges: BridgeEdge[]; selectedId?: string | null; focusId?: string | null;
  onSelect: (id: string) => void; summary: string;
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

  const gNodes = React.useMemo<GraphNode[]>(
    () => nodes.slice(0, 120).map((n) => ({ id: n.skillId, name: n.name, status: n.status, demand: n.demand, trend: n.trend })),
    [nodes],
  );
  const gLinks = React.useMemo<GraphLink[]>(() => {
    const ids = new Set(gNodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to }));
  }, [edges, gNodes]);

  return (
    <figure className="relative" aria-label="Bridge Map graph">
      <div ref={box} className="h-[400px] w-full overflow-hidden rounded-xl bg-muted/40 md:h-[520px]" aria-hidden>
        {size.w > 0 && size.h > 0 && (
          <ForceGraphCanvas
            nodes={gNodes} links={gLinks} width={size.w} height={size.h}
            selectedId={selectedId} focusId={focusId} fitSignal={fit} reduceMotion={reduce} onSelect={onSelect}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setFit((f) => f + 1)}
        aria-label="Zoom to fit the whole map"
        className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-xl border bg-card text-foreground shadow-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Maximize2 className="size-4" aria-hidden />
      </button>
      <figcaption className="mt-4 max-w-3xl text-sm text-muted-foreground" aria-live="polite">{summary}</figcaption>
    </figure>
  );
}
