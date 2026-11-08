"use client";
// The canvas itself. Imported only through next/dynamic({ ssr: false }) from BridgeGraph (it touches window).
// Four bands, read left to right: proven, in your degree, later in your degree, gap. Forces hold each skill
// in its band, ranked by demand, so the map is legible from the back of a room and settles without drifting.
import * as React from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import type { SkillStatus, TrendLabel } from "@/lib/types";
import { STATUS_META, pctOf } from "./mapUtils";
import {
  HEAD_H, PAD, RISE, SPINE, computeLayout, drawGlyph, labelMeasure, labelX, nodeRadius, outer, readPalette, resetTextWidths, textWidth,
  type Layout, type Palette,
} from "./graphDraw";

export interface GraphNode { id: string; name: string; status: SkillStatus; demand: number; trend?: TrendLabel }
export interface GraphLink { source: string; target: string }
type N = NodeObject<GraphNode>;
type L = LinkObject<GraphNode, GraphLink>;

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
  /** Skills per status before filtering, so a band keeps its header when a filter empties it. */
  counts?: Record<SkillStatus, number>;
  /** Every skill before filtering: fixes band widths, label size and the height the map needs. */
  layoutNodes?: GraphNode[];
  /** The height the full map needs at this width, so the box can take it and the map fits at zoom 1. */
  onLayoutHeight?: (height: number) => void;
}

const EMPTY_COUNTS: Record<SkillStatus, number> = { proven: 0, "degree-done": 0, "degree-upcoming": 0, gap: 0 };
const idOf = (end: unknown) => (typeof end === "object" && end ? String((end as N).id) : String(end));

export default function ForceGraphCanvas({
  nodes, links, width, height, selectedId, focusId, fitSignal, reduceMotion, onSelect, counts, layoutNodes, onLayoutHeight,
}: ForceGraphCanvasProps) {
  const fg = React.useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  // Client-only module (next/dynamic ssr:false), so the document is there on first render.
  const [palette, setPalette] = React.useState<Palette | null>(() => (typeof document === "undefined" ? null : readPalette()));
  const [hover, setHover] = React.useState<string | null>(null);

  const totals = React.useMemo(() => {
    if (counts) return counts;
    const c = { ...EMPTY_COUNTS };
    for (const n of nodes) c[n.status] += 1;
    return c;
  }, [counts, nodes]);
  // Names are measured in the web font, so read the faces and measure again once it has loaded.
  React.useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => { if (!live) return; resetTextWidths(); setPalette(readPalette()); });
    return () => { live = false; };
  }, []);
  const measure = React.useMemo(() => (palette ? labelMeasure(palette.sans) : undefined), [palette]);
  const layout = React.useMemo<Layout>(
    () => computeLayout(nodes, width, totals, { measure, sizing: layoutNodes }),
    [nodes, width, totals, measure, layoutNodes],
  );
  const fullHeight = React.useMemo(
    () => (layoutNodes ? computeLayout(layoutNodes, width, totals, { measure }).height : layout.height),
    [layoutNodes, width, totals, measure, layout.height],
  );
  const layoutRef = React.useRef({ layout, fullHeight });
  React.useEffect(() => { layoutRef.current = { layout, fullHeight }; }, [layout, fullHeight]);
  React.useEffect(() => { onLayoutHeight?.(fullHeight); }, [fullHeight, onLayoutHeight]);
  const narrow = layout.mode === "rows";

  // Node objects keep their positions across filter changes; a new node starts on its place in its band.
  const [cache] = React.useState(() => new Map<string, N>());
  const data = React.useMemo(() => {
    const ns = nodes.map((n) => {
      const prev = cache.get(n.id);
      const obj = prev ? Object.assign(prev, n) : ({ ...n } as N);
      const p = layout.pos.get(n.id);
      if (p && (obj.x === undefined || obj.y === undefined)) { obj.x = p.x; obj.y = p.y; }
      cache.set(n.id, obj);
      return obj;
    });
    return { nodes: ns, links: links.map((l) => ({ ...l })) };
  }, [nodes, links, cache, layout]);

  const lit = selectedId ?? null;

  React.useEffect(() => {
    const mo = new MutationObserver(() => setPalette(readPalette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => mo.disconnect();
  }, []);

  // The forces: each skill is held on its place in its band; nothing else pushes or pulls.
  React.useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(0);
    g.d3Force("link")?.strength(0);
    g.d3Force("center", null);
    let ns: N[] = [];
    const hold = Object.assign(
      (alpha: number) => {
        const pos = layoutRef.current.layout.pos;
        for (const n of ns) {
          const p = pos.get(String(n.id));
          if (!p) continue;
          n.vx = (n.vx ?? 0) + (p.x - (n.x ?? 0)) * 0.3 * alpha;
          n.vy = (n.vy ?? 0) + (p.y - (n.y ?? 0)) * 0.3 * alpha;
        }
      },
      { initialize: (x: N[]) => { ns = x; } },
    );
    g.d3Force("band", hold);
    g.d3ReheatSimulation();
  }, [data]);

  /** Fit the whole map, headers included, top-aligned: graph units are CSS pixels, so this lands close to zoom 1. */
  const fit = React.useCallback((ms: number) => {
    const g = fg.current;
    if (!g) return;
    const { layout: l, fullHeight: h } = layoutRef.current;
    const k = Math.min(width / l.width, height / h, 1.25);
    g.centerAt(l.width / 2, height / (2 * k), ms);
    g.zoom(k, ms);
  }, [width, height]);

  // Fit once the canvas has its size, and again after the first settle (the library sizes its zoom lazily).
  const fitted = React.useRef(false);
  React.useEffect(() => {
    fitted.current = false;
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => fit(0)); });
    return () => cancelAnimationFrame(raf);
  }, [fit, fullHeight]);

  React.useEffect(() => {
    const onVis = () => (document.hidden ? fg.current?.pauseAnimation() : fg.current?.resumeAnimation());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  React.useEffect(() => {
    if (!focusId) return;
    const n = cache.get(focusId);
    if (n?.x === undefined || n.y === undefined) return;
    fg.current?.centerAt(n.x + 60, n.y, reduceMotion ? 0 : 400);
    fg.current?.zoom(1.8, reduceMotion ? 0 : 400);
  }, [focusId, reduceMotion, cache]);

  React.useEffect(() => {
    if (fitSignal) fit(reduceMotion ? 0 : 400);
  }, [fitSignal, reduceMotion, fit]);

  const labelFont = palette ? `600 ${layout.label}px ${palette.sans}` : "";

  // Band headers and the hairlines between bands, drawn under the links and nodes.
  const drawBands = React.useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      if (!palette) return;
      const px = 1 / scale;
      const head = `600 ${layout.label}px ${palette.sans}`;
      const note = `500 13px ${palette.sans}`;
      const hair = (x0: number, y0: number, x1: number, y1: number) => {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.setLineDash([]); ctx.lineWidth = px; ctx.strokeStyle = palette.rule; ctx.stroke();
      };
      ctx.save();
      if (layout.mode === "columns") hair(PAD, PAD + HEAD_H - 4, layout.width - PAD, PAD + HEAD_H - 4);
      for (const [i, b] of layout.bands.entries()) {
        const top = b.y0;
        const gx = b.x0 + SPINE;
        const gy = top + 16;
        if (i > 0) {
          if (layout.mode === "columns") hair(b.x0, b.y0, b.x0, layout.height - PAD);
          else hair(b.x0, b.y0 - 5, b.x1, b.y0 - 5);
        }
        drawGlyph(ctx, b.status, gx, gy, 9, palette, px);
        const label = STATUS_META[b.status].label;
        const tx = gx + 9 + 8;
        const room = b.x1 - tx - 6;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = b.shown ? palette.ink : palette.ink3;
        ctx.font = head;
        // The status label alone: the filter chips just above already carry each count.
        if (textWidth(ctx, head, label) <= room) {
          ctx.fillText(label, tx, gy);
        } else {
          // Too wide for its band: break before the last word.
          const cut = label.lastIndexOf(" ");
          ctx.fillText(cut > 0 ? label.slice(0, cut) : label, tx, gy);
          if (cut > 0) ctx.fillText(label.slice(cut + 1), tx, gy + 19);
        }
        if (!b.shown) {
          ctx.font = note; ctx.fillStyle = palette.ink3;
          ctx.fillText(b.count ? "Filtered out" : "None yet", tx, top + HEAD_H + (layout.mode === "columns" ? 14 : -14));
        }
      }
      ctx.restore();
    },
    [palette, layout],
  );

  const draw = React.useCallback(
    (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
      if (!palette || node.x === undefined || node.y === undefined) return;
      const { x, y } = node;
      const n = node as GraphNode;
      const px = 1 / scale;
      const r = nodeRadius(n.demand);
      const id = String(node.id);
      if (n.trend === "rising") {
        ctx.beginPath(); ctx.arc(x, y, r + RISE, 0, 2 * Math.PI);
        ctx.strokeStyle = palette.rising; ctx.lineWidth = 2.25 * px; ctx.setLineDash([]); ctx.stroke();
      }
      drawGlyph(ctx, n.status, x, y, r, palette, px);
      const selected = id === selectedId;
      if (selected) {
        ctx.beginPath(); ctx.arc(x, y, r + (n.trend === "rising" ? RISE : 0) + 4.5, 0, 2 * Math.PI);
        ctx.strokeStyle = palette.signal; ctx.lineWidth = 2.5 * px; ctx.stroke();
      }
      const tx = x + labelX(n) + (selected ? 4.5 : 0);
      const w = textWidth(ctx, labelFont, n.name);
      ctx.font = labelFont;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // Every label sits on its own backing, so a link passes under a name, never through it.
      ctx.beginPath();
      ctx.roundRect(tx - 5, y - layout.label * 0.82, w + 10, layout.label * 1.64, 6);
      ctx.fillStyle = selected ? palette.signalSoft : id === hover ? palette.hover : palette.card;
      ctx.fill();
      ctx.fillStyle = palette.ink;
      ctx.fillText(n.name, tx, y);
    },
    [palette, selectedId, hover, labelFont, layout.label],
  );

  // Links are curves with an arrowhead at the skill that builds on the other: across bands they leave and
  // arrive level, like a cable between two piers; inside a band they leave and meet each ring on its left
  // edge and bow wide enough to clear the widest ring in the column. At rest every line is the 3:1 field
  // grey at full strength; the picked (and hovered) skill's lines are ink. Only while a skill is hovered do
  // the others dim. On a phone (rows) only the picked skill's lines are drawn, so none cross the names.
  const drawLink = React.useCallback(
    (link: L, ctx: CanvasRenderingContext2D, scale: number) => {
      if (!palette) return;
      const s = link.source as unknown as N;
      const t = link.target as unknown as N;
      if (typeof s !== "object" || typeof t !== "object" || s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) return;
      const px = 1 / scale;
      const ends = [idOf(link.source), idOf(link.target)];
      const picked = !!lit && ends.includes(lit);
      const hovered = !!hover && ends.includes(hover);
      const on = picked || hovered;
      if (narrow && !picked) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      // Where the line leaves the source: a ring's left edge when it bows, the end of the name when it heads right.
      let from: [number, number] = [s.x, s.y];
      let c1: [number, number];
      let c2: [number, number];
      if (Math.abs(dx) < 2 || (narrow && Math.abs(dy) >= 2)) {
        // Inside a band (and on a phone, between rows) it leaves and meets each ring on its left edge. The bow's
        // widest point is (os + ot + 6k) / 8 left of the spine, enough to clear the widest ring in the column;
        // the leftmost column has only its pad and spine beside it, so there it bows as far as the canvas allows.
        const os = outer(s as GraphNode);
        const ot = outer(t as GraphNode);
        const room = (8 * (Math.min(s.x, t.x) - 2) - os - ot) / 6;
        const k = Math.min(room, narrow ? 40 : 64, Math.max(narrow ? 30 : 56, 16 + Math.abs(dy) * 0.3));
        from = [s.x - os - 2 * px, s.y];
        c1 = [s.x - k, s.y]; c2 = [t.x - k, t.y];
      } else if (!narrow) {
        // Heading right, a line leaves from the end of its name, so no stub shows between a ring and its label.
        if (dx > 0) from = [s.x + labelX(s as GraphNode) + (String(s.id) === selectedId ? 4.5 : 0) + textWidth(ctx, labelFont, String(s.name)) + 5, s.y];
        const run = t.x - from[0];
        c1 = [from[0] + run * 0.5, s.y]; c2 = [t.x - run * 0.5, t.y];
      } else {
        // Two skills on one phone row: an arc over the top.
        c1 = [s.x, s.y - 28]; c2 = [t.x, t.y - 28];
      }
      // Arrowhead on the target's edge, along the curve's last tangent; the line stops at its tip.
      const ax = t.x - c2[0];
      const ay = t.y - c2[1];
      const len = Math.hypot(ax, ay) || 1;
      const ux = ax / len;
      const uy = ay / len;
      // Clear of the coral selection ring too, so a picked skill's arrowheads stay whole.
      const back = outer(t as GraphNode) + (String(t.id) === selectedId ? 5.75 : 0) + 2 * px;
      const tipX = t.x - ux * back;
      const tipY = t.y - uy * back;
      ctx.save();
      ctx.globalAlpha = on || !hover ? 1 : 0.35;
      ctx.strokeStyle = on ? palette.ink : palette.field;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = (on ? 2.5 : 1.25) * px;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], tipX, tipY);
      ctx.stroke();
      const size = (on ? 8 : 6) * px;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - ux * size - uy * size * 0.6, tipY - uy * size + ux * size * 0.6);
      ctx.lineTo(tipX - ux * size + uy * size * 0.6, tipY - uy * size - ux * size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    [palette, lit, hover, narrow, selectedId, labelFont],
  );

  // Clicks land on the disc or its label, so a name is as good a target as a dot.
  const area = React.useCallback(
    (node: N, color: string, ctx: CanvasRenderingContext2D) => {
      if (node.x === undefined || node.y === undefined) return;
      const n = node as GraphNode;
      const r = nodeRadius(n.demand) + 3;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI); ctx.fill();
      if (labelFont) {
        const w = textWidth(ctx, labelFont, n.name);
        ctx.fillRect(node.x, node.y - layout.label * 0.8, labelX(n) + w + 6, layout.label * 1.6);
      }
    },
    [labelFont, layout.label],
  );

  // Desktop: drag to pan, Ctrl or Cmd with the wheel (or a pinch) to zoom, so a plain scroll still moves the page.
  // Phone: the page scrolls straight through the map; a tap still picks a skill.
  const zoomGate = React.useCallback((e: MouseEvent) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !narrow), [narrow]);

  return (
    <ForceGraph2D<GraphNode, GraphLink>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="transparent"
      nodeId="id"
      nodeCanvasObject={draw}
      nodePointerAreaPaint={area}
      nodeLabel={(n) => `${String(n.name)}: ${STATUS_META[n.status as SkillStatus].label}, ${pctOf(n.demand as number)}% of ads`}
      linkCanvasObject={drawLink}
      linkCanvasObjectMode={() => "replace"}
      onRenderFramePre={drawBands}
      enableNodeDrag={!reduceMotion && !narrow}
      enableZoomInteraction={zoomGate}
      enablePanInteraction={!narrow}
      minZoom={0.5}
      maxZoom={4}
      warmupTicks={reduceMotion ? 120 : 30}
      cooldownTicks={reduceMotion ? 0 : 60}
      onEngineStop={() => {
        if (fitted.current) return;
        fitted.current = true;
        fit(0);
      }}
      onNodeHover={(n) => setHover(n ? String(n.id) : null)}
      onNodeClick={(n) => onSelect(String(n.id))}
    />
  );
}
