"use client";
// The pod's knowledge graph of who teaches whom (Reply level 3: knowledge graph made visible).
// Pure SVG: members sit on a circle; a curved arrow runs teacher → learner for every skill in teacher.teaches ∩ learner.learns.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Network } from "lucide-react";
import type { Pod } from "@/lib/types";
import { skillName } from "@/lib/schemas/community";
import { cn } from "@/lib/utils";
import { LevelChips } from "@/components/pods/LevelChips";

export type ExchangeEdge = { from: string; to: string; skillId: string };
export type ExchangeGroup = {
  key: string;
  from: string;
  to: string;
  skillIds: string[];
};

/** Every (teacher → learner, skill) pair where the teacher teaches a skill the learner wants to learn. */
export function buildExchangeEdges(pod: Pick<Pod, "members">): ExchangeEdge[] {
  const edges: ExchangeEdge[] = [];
  const seen = new Set<string>();
  for (const teacher of pod.members) {
    for (const learner of pod.members) {
      if (teacher.userId === learner.userId) continue;
      const learns = new Set(learner.learns);
      for (const skillId of teacher.teaches) {
        const key = `${teacher.userId}>${learner.userId}:${skillId}`;
        if (!learns.has(skillId) || seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: teacher.userId, to: learner.userId, skillId });
      }
    }
  }
  return edges;
}

/** One arrow per teacher → learner pair, carrying all the skills taught along it. */
export function groupExchangeEdges(edges: ExchangeEdge[]): ExchangeGroup[] {
  const map = new Map<string, ExchangeGroup>();
  for (const e of edges) {
    const key = `${e.from}>${e.to}`;
    const g = map.get(key) ?? { key, from: e.from, to: e.to, skillIds: [] };
    g.skillIds.push(e.skillId);
    map.set(key, g);
  }
  return [...map.values()];
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fullName = (names: Record<string, string>, id: string) =>
  names[id]?.trim() || cap(id);
const firstName = (names: Record<string, string>, id: string) =>
  fullName(names, id).split(/\s+/)[0];
const initials = (names: Record<string, string>, id: string) => {
  const parts = fullName(names, id).split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? parts[parts.length - 1][0] : "")
    ).toUpperCase() || id.slice(0, 2).toUpperCase()
  );
};
function joinAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Plain-English sentence for one arrow, second person for the viewer: "Priya teaches Docker and PyTorch to you". */
export function describeExchange(
  group: ExchangeGroup,
  names: Record<string, string>,
  viewerId?: string,
) {
  const teacherIsYou = group.from === viewerId;
  const teacher = teacherIsYou ? "You" : firstName(names, group.from);
  const learner = group.to === viewerId ? "you" : firstName(names, group.to);
  return `${teacher} ${teacherIsYou ? "teach" : "teaches"} ${joinAnd(group.skillIds.map(skillName))} to ${learner}`;
}

// ---------- geometry ----------
type Geo = {
  w: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
  nodeR: number;
  nameSize: number;
  labelSize: number;
  sideLabel: "outside" | "below";
};
const WIDE: Geo = {
  w: 440,
  h: 340,
  cx: 220,
  cy: 168,
  r: 112,
  nodeR: 24,
  nameSize: 14,
  labelSize: 13,
  sideLabel: "outside",
};
const COMPACT: Geo = {
  w: 320,
  h: 300,
  cx: 160,
  cy: 150,
  r: 92,
  nodeR: 22,
  nameSize: 14,
  labelSize: 13,
  sideLabel: "below",
};
type Pt = { x: number; y: number };
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (p: Pt) => Math.hypot(p.x, p.y) || 1;
const unit = (p: Pt): Pt => ({ x: p.x / len(p), y: p.y / len(p) });
const r1 = (n: number) => Math.round(n * 10) / 10;

function nodePositions(ids: string[], g: Geo) {
  const pos: Record<string, Pt & { angle: number }> = {};
  ids.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(ids.length, 1);
    pos[id] = {
      x: g.cx + g.r * Math.cos(angle),
      y: g.cy + g.r * Math.sin(angle),
      angle,
    };
  });
  return pos;
}

function edgeGeometry(a: Pt, b: Pt, g: Geo) {
  const d = sub(b, a);
  const dist = len(d);
  const n = { x: -d.y / dist, y: d.x / dist }; // A→B and B→A bend to opposite sides
  const bend = dist * 0.2;
  const c = {
    x: (a.x + b.x) / 2 + n.x * bend,
    y: (a.y + b.y) / 2 + n.y * bend,
  };
  const u0 = unit(sub(c, a));
  const s = { x: a.x + u0.x * (g.nodeR + 4), y: a.y + u0.y * (g.nodeR + 4) };
  const u1 = unit(sub(c, b));
  const tip = { x: b.x + u1.x * (g.nodeR + 5), y: b.y + u1.y * (g.nodeR + 5) };
  const dir = unit(sub(tip, c));
  const head = 9,
    half = 5;
  const base = { x: tip.x - dir.x * head, y: tip.y - dir.y * head };
  const arrow = [
    tip,
    { x: base.x - dir.y * half, y: base.y + dir.x * half },
    { x: base.x + dir.y * half, y: base.y - dir.x * half },
  ]
    .map((p) => `${r1(p.x)},${r1(p.y)}`)
    .join(" ");
  const label = {
    x: 0.25 * s.x + 0.5 * c.x + 0.25 * tip.x,
    y: 0.25 * s.y + 0.5 * c.y + 0.25 * tip.y,
  };
  return {
    d: `M ${r1(s.x)} ${r1(s.y)} Q ${r1(c.x)} ${r1(c.y)} ${r1(base.x)} ${r1(base.y)}`,
    arrow,
    label,
  };
}

function nameLabel(p: Pt & { angle: number }, g: Geo) {
  const sin = Math.sin(p.angle),
    cos = Math.cos(p.angle);
  if (sin < -0.6)
    return { x: p.x, y: p.y - g.nodeR - 10, anchor: "middle" as const };
  if (sin > 0.6 || g.sideLabel === "below")
    return {
      x: p.x,
      y: p.y + g.nodeR + g.nameSize + 5,
      anchor: "middle" as const,
    };
  return cos > 0
    ? {
        x: p.x + g.nodeR + 8,
        y: p.y + g.nameSize / 3,
        anchor: "start" as const,
      }
    : { x: p.x - g.nodeR - 8, y: p.y + g.nameSize / 3, anchor: "end" as const };
}

function useIsCompact(ref: React.RefObject<HTMLElement | null>) {
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setCompact(w < 400);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return compact;
}

// ---------- component ----------
export function SkillExchangeGraph({
  pod,
  names,
  viewerId,
}: {
  pod: Pod;
  names: Record<string, string>;
  viewerId?: string;
}) {
  const reduce = useReducedMotion();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const compact = useIsCompact(wrapRef);
  const geo = compact ? COMPACT : WIDE;
  const [hover, setHover] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);

  const ids = React.useMemo(
    () => pod.members.map((m) => m.userId),
    [pod.members],
  );
  const edges = React.useMemo(() => buildExchangeEdges(pod), [pod]);
  const groups = React.useMemo(() => groupExchangeEdges(edges), [edges]);
  const pos = React.useMemo(() => nodePositions(ids, geo), [ids, geo]);
  const isViewer = (id: string) => !!viewerId && id === viewerId;
  const focusId = hover ?? pinned;
  const spotlight =
    focusId ?? (viewerId && ids.includes(viewerId) ? viewerId : null);
  const touches = (g: ExchangeGroup, id: string | null) =>
    !!id && (g.from === id || g.to === id);

  const ordered = React.useMemo(() => {
    const rank = (g: ExchangeGroup) =>
      g.to === viewerId ? 0 : g.from === viewerId ? 1 : 2;
    return [...groups].sort((a, b) => rank(a) - rank(b));
  }, [groups, viewerId]);
  const teachers = new Set(edges.map((e) => e.from)).size;
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `seg-title-${uid}`;
  const summaryId = `seg-summary-${uid}`;
  const toggle = (id: string) => setPinned((p) => (p === id ? null : id));

  const ariaLabel = `${pod.name} skill exchange graph: ${ids.length} podmates and ${edges.length} skills taught between them. Each one is listed below.`;

  return (
    <figure
      className="@container rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby={titleId}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Network className="size-4" aria-hidden />
            </span>
            <h3 id={titleId} className="text-base font-semibold tracking-tight">
              Who teaches whom
            </h3>
          </div>
          <p className="text-sm text-muted-foreground text-pretty">
            Every arrow is a skill one podmate teaches another. You learn by
            building and teach by reviewing.
          </p>
        </div>
        <LevelChips items={["knowledge-graph"]} />
      </div>

      {edges.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No skill swaps yet. Once podmates share what they can teach, arrows
          appear here.
        </p>
      ) : (
        <div className="grid items-start gap-5 @2xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div ref={wrapRef} className="min-w-0">
            <svg
              role="img"
              aria-label={ariaLabel}
              aria-describedby={summaryId}
              viewBox={`0 0 ${geo.w} ${geo.h}`}
              className="mx-auto block h-auto max-h-[360px] w-full max-w-[440px] select-none"
            >
              {/* edges */}
              {groups.map((g, i) => {
                const a = pos[g.from],
                  b = pos[g.to];
                if (!a || !b) return null;
                const { d, arrow } = edgeGeometry(a, b, geo);
                const on = touches(g, spotlight);
                const dim = !!focusId && !on;
                const delay = 0.2 + i * 0.12;
                return (
                  <g
                    key={g.key}
                    data-edge={g.key}
                    data-active={on || undefined}
                    className={cn(
                      "transition-opacity duration-200",
                      dim && "opacity-15",
                    )}
                  >
                    <motion.path
                      d={d}
                      fill="none"
                      strokeLinecap="round"
                      strokeWidth={on ? 2.5 : 1.75}
                      className={cn(
                        "transition-colors duration-200",
                        on ? "stroke-primary" : "stroke-muted-foreground/50",
                      )}
                      initial={reduce ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.7, delay, ease: "easeInOut" }}
                    />
                    <motion.polygon
                      points={arrow}
                      className={cn(
                        "transition-colors duration-200",
                        on ? "fill-primary" : "fill-muted-foreground/60",
                      )}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: delay + 0.6 }}
                    />
                  </g>
                );
              })}
              {/* edge labels */}
              {groups.map((g, i) => {
                const a = pos[g.from],
                  b = pos[g.to];
                if (!a || !b) return null;
                const { label } = edgeGeometry(a, b, geo);
                const on = touches(g, spotlight);
                const dim = !!focusId && !on;
                const names2 = g.skillIds.map(skillName);
                const text =
                  names2.length > 2
                    ? `${names2.slice(0, 2).join(" · ")} +${names2.length - 2}`
                    : names2.join(" · ");
                return (
                  <motion.g
                    key={g.key}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.12 + 0.55 }}
                  >
                    <text
                      x={r1(label.x)}
                      y={r1(label.y)}
                      dy="0.35em"
                      textAnchor="middle"
                      fontSize={geo.labelSize}
                      strokeWidth={5}
                      strokeLinejoin="round"
                      style={{ paintOrder: "stroke" }}
                      className={cn(
                        "stroke-card font-medium transition-[fill,opacity] duration-200",
                        on
                          ? "fill-foreground font-semibold"
                          : "fill-muted-foreground",
                        dim && "opacity-15",
                      )}
                    >
                      {text}
                    </text>
                  </motion.g>
                );
              })}
              {/* nodes */}
              {ids.map((id, i) => {
                const p = pos[id];
                const you = isViewer(id);
                const lit = id === spotlight;
                const dim =
                  !!focusId &&
                  id !== focusId &&
                  !groups.some((g) => touches(g, focusId) && touches(g, id));
                const nl = nameLabel(p, geo);
                return (
                  <g
                    key={id}
                    data-node={id}
                    data-viewer={you || undefined}
                    className={cn(
                      "cursor-pointer transition-opacity duration-200",
                      dim && "opacity-40",
                    )}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => toggle(id)}
                  >
                    <motion.g
                      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.35,
                        delay: i * 0.06,
                        ease: "backOut",
                      }}
                    >
                      {you && (
                        <circle
                          cx={r1(p.x)}
                          cy={r1(p.y)}
                          r={geo.nodeR + 5}
                          fill="none"
                          strokeWidth={3}
                          className="stroke-primary/25"
                        />
                      )}
                      <circle
                        cx={r1(p.x)}
                        cy={r1(p.y)}
                        r={geo.nodeR}
                        strokeWidth={lit && !you ? 2.5 : 1.5}
                        className={cn(
                          "transition-colors duration-200",
                          you
                            ? "fill-primary stroke-primary"
                            : lit
                              ? "fill-card stroke-primary"
                              : "fill-card stroke-border",
                        )}
                      />
                      <text
                        x={r1(p.x)}
                        y={r1(p.y)}
                        dy="0.35em"
                        textAnchor="middle"
                        fontSize={geo.nameSize - 0.5}
                        className={cn(
                          "font-semibold tracking-wide",
                          you ? "fill-primary-foreground" : "fill-foreground",
                        )}
                      >
                        {initials(names, id)}
                      </text>
                      <text
                        x={r1(nl.x)}
                        y={r1(nl.y)}
                        textAnchor={nl.anchor}
                        fontSize={geo.nameSize}
                        strokeWidth={4}
                        strokeLinejoin="round"
                        style={{ paintOrder: "stroke" }}
                        className={cn(
                          "stroke-card",
                          you
                            ? "fill-primary font-semibold"
                            : "fill-foreground font-medium",
                        )}
                      >
                        {firstName(names, id)}
                      </text>
                    </motion.g>
                  </g>
                );
              })}
            </svg>

            <div
              className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
              aria-hidden
            >
              <span className="inline-flex items-center gap-1.5">
                <svg
                  width="26"
                  height="10"
                  viewBox="0 0 26 10"
                  className="overflow-visible"
                >
                  <line
                    x1="1"
                    y1="5"
                    x2="18"
                    y2="5"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="stroke-muted-foreground"
                  />
                  <polygon
                    points="25,5 17,1 17,9"
                    className="fill-muted-foreground"
                  />
                </svg>
                teaches
              </span>
              {viewerId && ids.includes(viewerId) && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-primary ring-2 ring-primary/25" />
                  you
                </span>
              )}
              <span className="hidden sm:inline">
                Hover or pick a podmate to trace their swaps
              </span>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Trace one podmate's skill swaps"
            >
              {ids.map((id) => {
                const you = isViewer(id);
                const pressed = pinned === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={pressed}
                    aria-label={`Trace ${you ? "your" : `${firstName(names, id)}'s`} skill swaps`}
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    onClick={() => toggle(id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border bg-background pr-3 pl-1 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      (pressed || focusId === id) &&
                        "border-primary/50 bg-primary/5",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                        you
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {initials(names, id)}
                    </span>
                    {firstName(names, id)}
                    {you && (
                      <span className="text-xs font-normal text-primary">
                        you
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {edges.length} skill {edges.length === 1 ? "swap" : "swaps"} ·{" "}
                {teachers} of {ids.length} teach
              </p>
              <ul
                id={summaryId}
                aria-label="Skill swaps"
                className="space-y-1.5"
              >
                {ordered.map((g) => {
                  const on = touches(g, spotlight);
                  return (
                    <li
                      key={g.key}
                      onMouseEnter={() => setHover(g.from)}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug transition-colors",
                        on
                          ? "bg-primary/5 text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <ArrowRight
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          on ? "text-primary" : "text-muted-foreground/70",
                        )}
                        aria-hidden
                      />
                      <span>{describeExchange(g, names, viewerId)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

export default SkillExchangeGraph;
