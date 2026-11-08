"use client";
// The pod's knowledge graph of who teaches whom (Reply level 3: knowledge graph made visible).
// Pure SVG: members sit on a circle; a curved arrow runs teacher → learner for every skill in teacher.teaches ∩ learner.learns.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { MatchExplanation, Pod } from "@/lib/types";
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
  nameSize: 15,
  labelSize: 14,
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

type Curve = { s: Pt; c: Pt; tip: Pt; base: Pt; d: string; arrow: string };
type Laid = Curve & { label: Pt };
const LABEL_T = 0.38; // labels sit a little before the middle, so two labels never meet at the centre
const LABEL_PUSH = 12; // and beside their own line, not on it
const bez = (s: Pt, c: Pt, e: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * c.x + t ** 2 * e.x,
  y: (1 - t) ** 2 * s.y + 2 * (1 - t) * t * c.y + t ** 2 * e.y,
});
const tangentAt = (s: Pt, c: Pt, e: Pt, t: number): Pt => ({
  x: 2 * (1 - t) * (c.x - s.x) + 2 * t * (e.x - c.x),
  y: 2 * (1 - t) * (c.y - s.y) + 2 * t * (e.y - c.y),
});
/** A chord that runs through the middle of the circle (Aisha to Tom, Priya to Mei in a pod of four). */
const throughMiddle = (a: Pt, b: Pt, g: Geo) =>
  Math.hypot((a.x + b.x) / 2 - g.cx, (a.y + b.y) / 2 - g.cy) < g.r * 0.35;

/** A curved arrow a → b. `side` (±1) picks the bow; A→B and B→A always bow to opposite sides. */
function edgeCurve(a: Pt, b: Pt, g: Geo, side: number): Curve {
  const d = sub(b, a);
  const dist = len(d);
  const n = { x: (-d.y / dist) * side, y: (d.x / dist) * side };
  const bend = dist * (throughMiddle(a, b, g) ? 0.3 : 0.2);
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
  return {
    s,
    c,
    tip,
    base,
    d: `M ${r1(s.x)} ${r1(s.y)} Q ${r1(c.x)} ${r1(c.y)} ${r1(base.x)} ${r1(base.y)}`,
    arrow,
  };
}

/** Two label spots beside the curve at `at`: away from the centre first, then towards it. */
function labelSpots(k: Curve, g: Geo, at = LABEL_T): [Pt, Pt] {
  const p = bez(k.s, k.c, k.tip, at);
  const t = unit(tangentAt(k.s, k.c, k.tip, at));
  let n = { x: -t.y, y: t.x };
  if (n.x * (p.x - g.cx) + n.y * (p.y - g.cy) < 0) n = { x: -n.x, y: -n.y };
  return [
    { x: p.x + n.x * LABEL_PUSH, y: p.y + n.y * LABEL_PUSH },
    { x: p.x - n.x * LABEL_PUSH, y: p.y - n.y * LABEL_PUSH },
  ];
}

function labelText(group: ExchangeGroup) {
  const n = group.skillIds.map(skillName);
  return n.length > 2 ? `${n.slice(0, 2).join(", ")} +${n.length - 2}` : n.join(", ");
}

const boxGap = (p: Pt, c: Pt, w: number, h: number) =>
  Math.hypot(
    Math.max(Math.abs(p.x - c.x) - w / 2, 0),
    Math.max(Math.abs(p.y - c.y) - h / 2, 0),
  );

/**
 * Lays out every arrow and its label. Chords through the middle can bow either way, so each
 * combination is tried and the one whose labels sit furthest from other lines, nodes and labels wins.
 */
function layoutEdges(
  groups: ExchangeGroup[],
  pos: Record<string, Pt>,
  g: Geo,
  nameBoxes: { p: Pt; w: number; h: number }[] = [],
): Record<string, Laid> {
  const live = groups.filter((k) => pos[k.from] && pos[k.to]);
  const pairOf = (k: ExchangeGroup) => [k.from, k.to].sort().join("|");
  const flexible = [
    ...new Set(
      live.filter((k) => throughMiddle(pos[k.from], pos[k.to], g)).map(pairOf),
    ),
  ].slice(0, 6);
  const texts = live.map(labelText);
  const nodes = Object.values(pos);
  let best: { worst: number; total: number; out: Record<string, Laid> } | null = null;

  for (let mask = 0; mask < 1 << flexible.length; mask++) {
    const side = (k: ExchangeGroup) => {
      const i = flexible.indexOf(pairOf(k));
      return i >= 0 && mask & (1 << i) ? -1 : 1;
    };
    const curves = live.map((k) => edgeCurve(pos[k.from], pos[k.to], g, side(k)));
    const samples = curves.map((c) =>
      Array.from({ length: 25 }, (_, i) => ({ t: i / 24, p: bez(c.s, c.c, c.base, i / 24) })),
    );
    const placed: { p: Pt; w: number; h: number }[] = [...nameBoxes];
    const out: Record<string, Laid> = {};
    let worst = Infinity,
      total = 0;

    curves.forEach((c, i) => {
      const w = texts[i].length * g.labelSize * 0.56 + 6;
      const h = g.labelSize + 4;
      const clear = (spot: Pt) => {
        let m = Infinity;
        samples.forEach((pts, j) => {
          for (const { t, p } of pts) {
            if (j === i && Math.abs(t - LABEL_T) < 0.3) continue;
            m = Math.min(m, boxGap(p, spot, w, h));
          }
        });
        for (const n of nodes) m = Math.min(m, boxGap(n, spot, w, h) - g.nodeR - 2);
        for (const o of placed) {
          m = Math.min(
            m,
            Math.hypot(
              Math.max(Math.abs(o.p.x - spot.x) - (w + o.w) / 2, 0),
              Math.max(Math.abs(o.p.y - spot.y) - (h + o.h) / 2, 0),
            ),
          );
        }
        if (spot.x - w / 2 < 0 || spot.x + w / 2 > g.w || spot.y - h / 2 < 0 || spot.y + h / 2 > g.h) m = Math.min(m, 0);
        return m;
      };
      // Prefer t = 0.38 on the outer side; slide along the line or cross it only when that clears more.
      let spot = labelSpots(c, g)[0];
      let m = clear(spot);
      for (const at of [LABEL_T, 0.3, 0.48]) {
        for (const cand of labelSpots(c, g, at)) {
          const cm = clear(cand);
          if (cm > m + 2) {
            spot = cand;
            m = cm;
          }
        }
      }
      placed.push({ p: spot, w, h });
      worst = Math.min(worst, m);
      total += Math.min(m, 16);
      out[live[i].key] = { ...c, label: spot };
    });

    if (
      !best ||
      worst > best.worst + 0.5 ||
      (Math.abs(worst - best.worst) <= 0.5 && total > best.total)
    )
      best = { worst, total, out };
  }
  return best?.out ?? {};
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
  explanations,
}: {
  pod: Pod;
  names: Record<string, string>;
  viewerId?: string;
  /** The matchmaker's plain-English reasons. Each one sits under the viewer's swap with that podmate. */
  explanations?: MatchExplanation[];
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
  const layout = React.useMemo(() => {
    // Podmates' names are obstacles too, so a skill label never lands on "Priya" or "Mei".
    const nameBoxes = ids.map((id) => {
      const nl = nameLabel(pos[id], geo);
      const w = firstName(names, id).length * geo.nameSize * 0.56 + 4;
      const x = nl.anchor === "middle" ? nl.x : nl.anchor === "start" ? nl.x + w / 2 : nl.x - w / 2;
      return { p: { x, y: nl.y - geo.nameSize * 0.35 }, w, h: geo.nameSize + 2 };
    });
    return layoutEdges(groups, pos, geo, nameBoxes);
  }, [groups, pos, geo, ids, names]);
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
  // Each reason goes under the first swap between those two people; any left over is listed after.
  const notes = React.useMemo(() => {
    const byKey: Record<string, string[]> = {};
    const loose: string[] = [];
    for (const e of explanations ?? []) {
      const hit = ordered.find(
        (g) =>
          (g.from === e.fromUserId && g.to === e.toUserId) ||
          (g.from === e.toUserId && g.to === e.fromUserId),
      );
      if (hit) (byKey[hit.key] ??= []).push(e.text);
      else loose.push(e.text);
    }
    return { byKey, loose };
  }, [explanations, ordered]);
  const everyReason = (explanations ?? []).map((e) => e.text);
  const teachers = new Set(edges.map((e) => e.from)).size;
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `seg-title-${uid}`;
  const summaryId = `seg-summary-${uid}`;
  const toggle = (id: string) => setPinned((p) => (p === id ? null : id));

  const ariaLabel = `${pod.name} skill exchange graph: ${ids.length} podmates and ${edges.length} skills taught between them. Each one is listed below.`;

  return (
    <figure className="@container" aria-labelledby={titleId}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="text-xl font-semibold">
            Who teaches whom
          </h3>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            Every arrow is a skill one podmate teaches another. You learn by
            building and teach by reviewing.
          </p>
        </div>
        <LevelChips items={["knowledge-graph"]} />
      </div>

      {edges.length === 0 ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-muted p-6 text-center text-muted-foreground">
            No skill swaps yet. Once podmates share what they can teach, arrows
            appear here.
          </p>
          {everyReason.length > 0 && (
            <ul aria-label="Why this pod works" className="space-y-2">
              {everyReason.map((t, i) => (
                <li key={i} className="max-w-[70ch] text-pretty">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-8 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] @4xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div ref={wrapRef} className="min-w-0">
            <svg
              role="img"
              aria-label={ariaLabel}
              aria-describedby={summaryId}
              viewBox={`0 0 ${geo.w} ${geo.h}`}
              className="mx-auto block h-auto max-h-[26rem] w-full max-w-[34rem] select-none"
            >
              {/* edges */}
              {groups.map((g, i) => {
                const laid = layout[g.key];
                if (!laid) return null;
                const { d, arrow } = laid;
                const on = touches(g, spotlight);
                const dim = !!focusId && !on;
                const delay = 0.2 + i * 0.12;
                return (
                  <g
                    key={g.key}
                    data-edge={g.key}
                    data-active={on || undefined}
                    className={cn(
                      "transition-opacity duration-(--dur-short)",
                      dim && "opacity-15",
                    )}
                  >
                    <motion.path
                      d={d}
                      fill="none"
                      strokeLinecap="round"
                      strokeWidth={on ? 2.5 : 1.75}
                      className={cn(
                        "transition-[stroke] duration-(--dur-short)",
                        on ? "stroke-primary" : "stroke-muted-foreground/50",
                      )}
                      initial={reduce ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.7, delay, ease: "easeInOut" }}
                    />
                    <motion.polygon
                      points={arrow}
                      className={cn(
                        "transition-[fill] duration-(--dur-short)",
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
                const laid = layout[g.key];
                if (!laid) return null;
                const { label } = laid;
                const on = touches(g, spotlight);
                const dim = !!focusId && !on;
                const text = labelText(g);
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
                      strokeWidth={8}
                      strokeLinejoin="round"
                      style={{ paintOrder: "stroke" }}
                      className={cn(
                        "stroke-card font-medium transition-[fill,opacity] duration-(--dur-short)",
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
                      "cursor-pointer transition-opacity duration-(--dur-short)",
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
                          "transition-[fill,stroke] duration-(--dur-short)",
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
                          "font-semibold",
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
                    onMouseEnter={() => setHover(id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    onClick={() => toggle(id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-lg border bg-card pr-3 pl-1 text-sm font-medium transition-[background-color,border-color,transform] duration-(--dur-short) outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
                      (pressed || focusId === id) &&
                        "border-primary bg-accent",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                        you
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {initials(names, id)}
                    </span>
                    {/* The name is built from the visible text (WCAG 2.5.3 label in name): "Trace Mei's skill swaps". */}
                    <span className="sr-only">Trace</span>{" "}
                    {firstName(names, id)}
                    <span className="sr-only">&apos;s skill swaps</span>
                    {you && (
                      <>
                        {" "}
                        <span className="text-xs font-normal text-primary">you</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                {edges.length} skill {edges.length === 1 ? "swap" : "swaps"}.{" "}
                {teachers === ids.length
                  ? "Everyone teaches something."
                  : `${teachers} of ${ids.length} podmates teach.`}
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
                        "flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug transition-[background-color,color] duration-(--dur-short)",
                        on
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <ArrowRight
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          on ? "text-primary" : "text-muted-foreground/70",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block",
                            notes.byKey[g.key] && "font-medium",
                          )}
                        >
                          {describeExchange(g, names, viewerId)}
                        </span>
                        {notes.byKey[g.key]?.map((t, i) => (
                          <span
                            key={i}
                            className="mt-1 block text-pretty text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {notes.loose.length > 0 && (
                <ul
                  aria-label="Why this pod works"
                  className="mt-3 space-y-1.5 border-t pt-3 text-sm"
                >
                  {notes.loose.map((t, i) => (
                    <li key={i} className="px-2 text-pretty">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

export default SkillExchangeGraph;
