"use client";
// The canvas itself. Imported only through next/dynamic({ ssr: false }) from BridgeGraph (it touches window).
import * as React from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import type { SkillStatus, TrendLabel } from "@/lib/types";
import { STATUS_META, pctOf } from "./mapUtils";

export interface GraphNode { id: string; name: string; status: SkillStatus; demand: number; trend?: TrendLabel }
export interface GraphLink { source: string; target: string }
type N = NodeObject<GraphNode>;

export interface ForceGraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  width: number;
  height: number;
  selectedId?: string | null;
  focusId?: string | null;
  fitSignal?: number;
  reduceMotion?: boolean;
  onSelect: (id: string) => void;
}

type Palette = Record<"proven" | "degree" | "gap" | "rising" | "fg" | "card" | "edge" | "ring" | "font", string>;
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    proven: v("--status-proven", "#059669"), degree: v("--status-degree", "#2563EB"), gap: v("--status-gap", "#E11D48"),
    rising: v("--status-rising", "#D97706"), fg: v("--foreground", "#0F172A"), card: v("--card", "#FFFFFF"),
    edge: v("--muted-foreground", "#64748B"), ring: v("--primary", "#4F46E5"),
    font: getComputedStyle(document.body).fontFamily || "ui-sans-serif, system-ui, sans-serif",
  };
}

// Each status drifts toward its own region, so the picture reads at a glance: proof left, degree top and right, gaps below.
const ANCHOR: Record<SkillStatus, [number, number]> = {
  proven: [-115, 0], "degree-done": [-20, -85], "degree-upcoming": [115, -15], gap: [5, 85],
};
const radius = (n: Pick<GraphNode, "demand">) => 5 + n.demand * 13;

export default function ForceGraphCanvas({ nodes, links, width, height, selectedId, focusId, fitSignal, reduceMotion, onSelect }: ForceGraphCanvasProps) {
  const fg = React.useRef<ForceGraphMethods<N> | undefined>(undefined);
  // Client-only module (next/dynamic ssr:false), so the document is there on first render.
  const [palette, setPalette] = React.useState<Palette | null>(() => (typeof document === "undefined" ? null : readPalette()));
  const [hover, setHover] = React.useState<string | null>(null);
  const fitted = React.useRef(false);

  // Node objects keep their positions across filter changes.
  const [cache] = React.useState(() => new Map<string, N>());
  const data = React.useMemo(() => {
    const ns = nodes.map((n) => {
      const prev = cache.get(n.id);
      const obj = prev ? Object.assign(prev, n) : ({ ...n } as N);
      cache.set(n.id, obj);
      return obj;
    });
    return { nodes: ns, links: links.map((l) => ({ ...l })) };
  }, [nodes, links, cache]);

  React.useEffect(() => {
    const mo = new MutationObserver(() => setPalette(readPalette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => mo.disconnect();
  }, []);

  React.useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-65);
    g.d3Force("link")?.distance(42);
    let ns: N[] = [];
    const pull = Object.assign(
      (alpha: number) => {
        for (const n of ns) {
          const [ax, ay] = ANCHOR[n.status as SkillStatus] ?? [0, 0];
          n.vx = (n.vx ?? 0) + (ax - (n.x ?? 0)) * 0.14 * alpha;
          n.vy = (n.vy ?? 0) + (ay - (n.y ?? 0)) * 0.14 * alpha;
        }
      },
      { initialize: (x: N[]) => { ns = x; } },
    );
    g.d3Force("status", pull);
    g.d3ReheatSimulation();
    // Warm-up ticks lay the graph out before the first paint; fit it straight away, then again when it settles.
    const t = setTimeout(() => { if (!fitted.current) g.zoomToFit(0, 40); }, 60);
    return () => clearTimeout(t);
  }, [data]);

  React.useEffect(() => {
    const onVis = () => (document.hidden ? fg.current?.pauseAnimation() : fg.current?.resumeAnimation());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  React.useEffect(() => {
    if (!focusId) return;
    const n = cache.get(focusId);
    if (n?.x === undefined || n.y === undefined) return;
    fg.current?.centerAt(n.x, n.y, reduceMotion ? 0 : 400);
    fg.current?.zoom(2.2, reduceMotion ? 0 : 400);
  }, [focusId, reduceMotion, cache]);

  React.useEffect(() => {
    if (fitSignal) fg.current?.zoomToFit(reduceMotion ? 0 : 400, 40);
  }, [fitSignal, reduceMotion]);

  const draw = React.useCallback(
    (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
      if (!palette || node.x === undefined || node.y === undefined) return;
      const { x, y } = node;
      const r = radius(node as GraphNode);
      const status = node.status as SkillStatus;
      const color = status === "proven" ? palette.proven : status === "gap" ? palette.gap : palette.degree;
      const lw = 1 / scale;
      if (node.trend === "rising") {
        ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, 2 * Math.PI);
        ctx.strokeStyle = palette.rising; ctx.lineWidth = 2.2 * lw * Math.max(1, scale * 0.6); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      if (status === "proven" || status === "degree-done") {
        ctx.fillStyle = color; ctx.fill();
      } else {
        ctx.fillStyle = palette.card; ctx.fill();
        ctx.setLineDash(status === "degree-upcoming" ? [3, 2] : []);
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      }
      // Glyphs: ✓ proven · cap bar degree-done · dot gap (a target).
      ctx.strokeStyle = palette.card; ctx.lineWidth = Math.max(1.4, r * 0.22); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (status === "proven") {
        ctx.beginPath(); ctx.moveTo(x - r * 0.42, y + r * 0.02); ctx.lineTo(x - r * 0.1, y + r * 0.34); ctx.lineTo(x + r * 0.45, y - r * 0.32); ctx.stroke();
      } else if (status === "degree-done") {
        ctx.beginPath(); ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x, y - r * 0.32); ctx.lineTo(x + r * 0.45, y); ctx.lineTo(x, y + r * 0.32); ctx.closePath();
        ctx.fillStyle = palette.card; ctx.fill();
      } else if (status === "gap") {
        ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
      }
      if (node.id === selectedId) {
        ctx.beginPath(); ctx.arc(x, y, r + 6.5, 0, 2 * Math.PI);
        ctx.strokeStyle = palette.ring; ctx.lineWidth = 2.5 / Math.max(scale, 0.8); ctx.stroke();
      }
      const showLabel = scale > 1.6 || status === "proven" || status === "degree-done" || (node.demand as number) >= 0.25 || node.id === selectedId || node.id === hover;
      if (showLabel) {
        const size = 13 / scale;
        ctx.font = `600 ${size}px ${palette.font}`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        const ty = y + r + 3 / scale + (node.trend === "rising" ? 3.5 : 0);
        ctx.lineWidth = 3.5 / scale; ctx.strokeStyle = palette.card; ctx.strokeText(String(node.name), x, ty);
        ctx.fillStyle = palette.fg; ctx.fillText(String(node.name), x, ty);
      }
    },
    [palette, selectedId, hover],
  );

  const area = React.useCallback((node: N, color: string, ctx: CanvasRenderingContext2D) => {
    if (node.x === undefined || node.y === undefined) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x, node.y, radius(node as GraphNode) + 3, 0, 2 * Math.PI); ctx.fill();
  }, []);

  return (
    <ForceGraph2D<GraphNode>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeId="id"
      nodeCanvasObject={draw}
      nodePointerAreaPaint={area}
      nodeLabel={(n) => `<div style="font: 500 14px/20px var(--font-geist-sans), system-ui, sans-serif; padding: 2px 4px">${String(n.name)} · ${STATUS_META[n.status as SkillStatus].label} · ${pctOf(n.demand as number)}% of ads</div>`}
      linkColor={() => (palette ? `${palette.edge}66` : "rgba(100,116,139,0.4)")}
      linkWidth={1.2}
      enableNodeDrag={!reduceMotion}
      warmupTicks={reduceMotion ? 200 : 90}
      cooldownTicks={reduceMotion ? 0 : 80}
      onEngineStop={() => {
        if (fitted.current) return;
        fitted.current = true;
        fg.current?.zoomToFit(reduceMotion ? 0 : 400, 40);
      }}
      onNodeHover={(n) => setHover(n ? String(n.id) : null)}
      onNodeClick={(n) => onSelect(String(n.id))}
    />
  );
}
