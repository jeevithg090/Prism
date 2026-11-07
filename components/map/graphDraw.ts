// The Bridge Map's drawing kit: the band layout (proof on the left, gaps on the right), the node glyphs
// shared by the canvas and the SVG key, and the palette, read from the tokens so the canvas follows the theme.
import type { SkillStatus, TrendLabel } from "@/lib/types";

/** Left to right: what you have proven, what your degree covers, what it covers later, what nothing covers yet. */
export const BANDS: SkillStatus[] = ["proven", "degree-done", "degree-upcoming", "gap"];

/** Lucide's own paths (ISC), so a node on the canvas carries the same icon as its StatusBadge. */
export const ICON_PATHS = {
  check: ["m16 9-5.5 5.5L8 12"],
  cap: [
    "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",
    "M22 10v6",
    "M6 12.5V16a6 3 0 0 0 12 0v-3.5",
  ],
  target: ["M18 12a6 6 0 1 1-12 0a6 6 0 1 1 12 0", "M14 12a2 2 0 1 1-4 0a2 2 0 1 1 4 0"],
} as const;
export type IconKey = keyof typeof ICON_PATHS;
export type Tone = "proven" | "degree" | "gap";

/** Filled = yours already (proof or a finished module); hollow = not yet; dashed = your degree gets there later. */
export const GLYPH: Record<SkillStatus, { filled: boolean; dashed: boolean; icon: IconKey; tone: Tone; size: number }> = {
  proven: { filled: true, dashed: false, icon: "check", tone: "proven", size: 1.55 },
  "degree-done": { filled: true, dashed: false, icon: "cap", tone: "degree", size: 1.4 },
  "degree-upcoming": { filled: false, dashed: true, icon: "cap", tone: "degree", size: 1.4 },
  gap: { filled: false, dashed: false, icon: "target", tone: "gap", size: 1.55 },
};

export interface Palette {
  proven: string; degree: string; gap: string; rising: string;
  ink: string; ink2: string; ink3: string; field: string; card: string; rule: string; hover: string;
  signal: string; signalSoft: string; sans: string; mono: string;
}

/** Every colour and face comes from the tokens (tokens.css), so dark mode and the theme reach the canvas. */
export function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, system = "CanvasText") => root.getPropertyValue(name).trim() || system;
  const probe = document.createElement("span");
  probe.className = "font-mono";
  probe.hidden = true;
  document.body.appendChild(probe);
  const mono = getComputedStyle(probe).fontFamily;
  probe.remove();
  return {
    proven: v("--status-proven"), degree: v("--status-degree"), gap: v("--status-gap"), rising: v("--status-rising"),
    ink: v("--color-ink"), ink2: v("--color-ink-2"), ink3: v("--color-ink-3"),
    // A link at rest: the 3:1 field edge, so lines still read from the back of a room.
    field: v("--color-field"), card: v("--color-cotton", "Canvas"),
    rule: v("--color-rule"), hover: v("--color-paper-3", "Canvas"), signal: v("--color-signal"), signalSoft: v("--color-signal-soft", "Canvas"),
    sans: getComputedStyle(document.body).fontFamily, mono,
  };
}

// ---------- Layout ----------

export interface LayoutNode { id: string; name: string; status: SkillStatus; demand: number; trend?: TrendLabel }
export interface BandBox { status: SkillStatus; x0: number; x1: number; y0: number; y1: number; count: number; shown: number }
export interface Layout { mode: "columns" | "rows"; label: number; pos: Map<string, { x: number; y: number }>; bands: BandBox[]; width: number; height: number }

export const PAD = 12;
export const HEAD_H = 56;
export const SPINE = 22;
export const LABEL_GAP = 7;
const ROW_GAP = 9;
const MIN_BAND = 120;

export const nodeRadius = (demand: number) => 6 + demand * 16;
/** The ochre ring a rising skill wears sits this far outside its disc. */
export const RISE = 4;
export const outer = (n: Pick<LayoutNode, "demand" | "trend">) => nodeRadius(n.demand) + (n.trend === "rising" ? RISE : 0);
const extent = (n: LayoutNode) => Math.max(2 * outer(n), 20);
const byDemand = (a: LayoutNode, b: LayoutNode) => b.demand - a.demand || a.name.localeCompare(b.name);

export interface LayoutOptions {
  /** Width of a label at a size in px; without it, labels are guessed at 0.56em a character. */
  measure?: (text: string, px: number) => number;
  /** The full, unfiltered set: it fixes the mode, the label size and each band's width, so filters never reflow. */
  sizing?: LayoutNode[];
}

/**
 * Graph units are CSS pixels at zoom 1, so labels draw at their true size when the map is fitted.
 * Wide: four bands side by side, each a ranked column (most-asked-for on top), each as wide as its longest
 * name needs. When even 13px names cannot fit across, the bands stack instead, two skills to a row.
 * `counts` keeps a band's header and place when a filter empties it.
 */
export function computeLayout(nodes: LayoutNode[], width: number, counts: Record<SkillStatus, number>, opts: LayoutOptions = {}): Layout {
  const measure = opts.measure ?? ((t: string, px: number) => t.length * px * 0.56);
  const sizing = opts.sizing ?? nodes;
  const pos = new Map<string, { x: number; y: number }>();
  const bands: BandBox[] = [];
  const inBand = (list: LayoutNode[], s: SkillStatus) => list.filter((n) => n.status === s).sort(byDemand);
  const avail = width - 2 * PAD;
  const needs = (px: number) =>
    BANDS.map((s) => Math.max(MIN_BAND, ...inBand(sizing, s).map((n) => SPINE + outer(n) + LABEL_GAP + measure(n.name, px) + 12)));
  let label = 14;
  let need = needs(14);
  if (need.reduce((a, b) => a + b, 0) > avail) { label = 13; need = needs(13); }
  const total = need.reduce((a, b) => a + b, 0);

  if (total <= avail) {
    const extra = (avail - total) / BANDS.length;
    let x0 = PAD;
    BANDS.forEach((s, i) => {
      const bw = need[i] + extra;
      const list = inBand(nodes, s);
      let y = PAD + HEAD_H + 6;
      for (const n of list) {
        const h = extent(n);
        pos.set(n.id, { x: x0 + SPINE, y: y + h / 2 });
        y += h + ROW_GAP;
      }
      bands.push({ status: s, x0, x1: x0 + bw, y0: PAD, y1: list.length ? y : y + 28, count: counts[s] ?? 0, shown: list.length });
      x0 += bw;
    });
    const tall = BANDS.map((s) => inBand(sizing, s).reduce((h, n) => h + extent(n) + ROW_GAP, PAD + HEAD_H + 6));
    const height = Math.max(...tall, ...bands.map((b) => b.y1)) + PAD;
    return { mode: "columns", label, pos, bands, width, height };
  }

  const k = width >= 320 ? 2 : 1;
  const cw = avail / k;
  label = 13;
  let y = PAD;
  for (const s of BANDS) {
    const y0 = y;
    const list = inBand(nodes, s);
    y += HEAD_H - 14;
    for (let i = 0; i < list.length; i += k) {
      const row = list.slice(i, i + k);
      const h = Math.max(...row.map(extent));
      row.forEach((n, j) => pos.set(n.id, { x: PAD + j * cw + SPINE, y: y + h / 2 }));
      y += h + ROW_GAP;
    }
    if (!list.length) y += 28;
    bands.push({ status: s, x0: PAD, x1: width - PAD, y0, y1: y, count: counts[s] ?? 0, shown: list.length });
    y += 10;
  }
  return { mode: "rows", label, pos, bands, width, height: y + PAD };
}

// ---------- Canvas drawing ----------

let PATHS: Record<IconKey, Path2D[]> | null = null;
function paths(): Record<IconKey, Path2D[]> {
  if (!PATHS) {
    PATHS = {
      check: ICON_PATHS.check.map((d) => new Path2D(d)),
      cap: ICON_PATHS.cap.map((d) => new Path2D(d)),
      target: ICON_PATHS.target.map((d) => new Path2D(d)),
    };
  }
  return PATHS;
}

export function drawIcon(ctx: CanvasRenderingContext2D, icon: IconKey, x: number, y: number, box: number, color: string, width = 2.5) {
  const s = box / 24;
  ctx.save();
  ctx.translate(x - 12 * s, y - 12 * s);
  ctx.scale(s, s);
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of paths()[icon]) ctx.stroke(p);
  ctx.restore();
}

/** A node's disc and icon; `px` is one screen pixel in graph units, so strokes stay crisp at any zoom. */
export function drawGlyph(ctx: CanvasRenderingContext2D, status: SkillStatus, x: number, y: number, r: number, pal: Palette, px: number) {
  const g = GLYPH[status];
  const tone = pal[g.tone];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = g.filled ? tone : pal.card;
  ctx.fill();
  if (!g.filled) {
    ctx.setLineDash(g.dashed ? [3.2 * px, 2.4 * px] : []);
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (r / px >= 6.5) drawIcon(ctx, g.icon, x, y, r * g.size, g.filled ? pal.card : tone, 2.6);
}

const widths = new Map<string, number>();
/** Forget measured widths (call once the web fonts have loaded, since the fallback face measures differently). */
export function resetTextWidths() { widths.clear(); }

/** A measure for computeLayout, in the label face at the label weight. */
export function labelMeasure(sans: string): (text: string, px: number) => number {
  const ctx = document.createElement("canvas").getContext("2d");
  return (text, px) => (ctx ? textWidth(ctx, `600 ${px}px ${sans}`, text) : text.length * px * 0.56);
}
export function textWidth(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  const key = `${font}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    ctx.save();
    ctx.font = font;
    w = ctx.measureText(text).width;
    ctx.restore();
    widths.set(key, w);
  }
  return w;
}

export const labelX = (n: Pick<LayoutNode, "demand" | "trend">) => outer(n) + LABEL_GAP;
