"use client";
// The student's proof tree as a diagram: every leaf is one proof, the root is what Keystone signs.
// Chosen leaves are filled and larger, the sibling hashes a link reveals are outlined, everything else stays grey.
// Each leaf is labelled with its skill (and has a hover title), so a room can see which proof is which.
import * as React from "react";
import type { TreeNodeView } from "@/lib/labs/credential/model";
import { shortHash } from "@/lib/labs/credential/model";

type Placed = { id: string; x: number; y: number; leafIndex?: number; kind: "chosen" | "revealed" | "hidden" | "root-path"; children: string[] };

const W = 640;
const ROW = 64;
const PAD_X = 40;
const PAD_TOP = 20;
/** Room under the leaves for their slanted skill labels. */
const LABEL_H = 64;
const LABEL_CHARS = 9;

export type MerkleLeafLabel = { index: number; skillName: string; rungLabel?: string };

const shortLabel = (s: string) => (s.length > LABEL_CHARS ? `${s.slice(0, LABEL_CHARS - 1).trimEnd()}…` : s);
const STATE: Record<Placed["kind"], string> = { chosen: "in the link", revealed: "hash only", hidden: "hidden", "root-path": "on the path" };

function height(n: TreeNodeView): number {
  return n.children ? 1 + Math.max(height(n.children[0]), height(n.children[1])) : 0;
}

function hasChosen(n: TreeNodeView, chosen: Set<number>): boolean {
  if (n.leafIndex !== undefined) return chosen.has(n.leafIndex);
  return !!n.children && (hasChosen(n.children[0], chosen) || hasChosen(n.children[1], chosen));
}

function layout(root: TreeNodeView, leafCount: number, chosen: Set<number>): Placed[] {
  const top = height(root);
  const out: Placed[] = [];
  const step = (W - PAD_X * 2) / Math.max(1, leafCount);
  const walk = (n: TreeNodeView, id: string, revealedSibling: boolean): Placed => {
    const y = PAD_TOP + (top - height(n)) * ROW;
    const onPath = hasChosen(n, chosen);
    if (n.leafIndex !== undefined) {
      const p: Placed = { id, x: PAD_X + step * (n.leafIndex + 0.5), y, leafIndex: n.leafIndex, kind: onPath ? "chosen" : revealedSibling ? "revealed" : "hidden", children: [] };
      out.push(p);
      return p;
    }
    const [l, r] = n.children as [TreeNodeView, TreeNodeView];
    const lOn = hasChosen(l, chosen);
    const rOn = hasChosen(r, chosen);
    const left = walk(l, `${id}0`, rOn && !lOn);
    const right = walk(r, `${id}1`, lOn && !rOn);
    const p: Placed = { id, x: (left.x + right.x) / 2, y, kind: onPath ? "root-path" : revealedSibling ? "revealed" : "hidden", children: [left.id, right.id] };
    out.push(p);
    return p;
  };
  walk(root, "n", false);
  return out;
}

export function MerkleTree({ tree, size, chosen, root, leaves = [] }: {
  tree: TreeNodeView | null; size: number; chosen: number[]; root: string; leaves?: MerkleLeafLabel[];
}) {
  const set = React.useMemo(() => new Set(chosen), [chosen]);
  const nodes = React.useMemo(() => (tree ? layout(tree, size, set) : []), [tree, size, set]);
  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labels = React.useMemo(() => new Map(leaves.map((l) => [l.index, l])), [leaves]);
  if (!tree) return null;
  const h = PAD_TOP + height(tree) * ROW + 20 + (labels.size ? LABEL_H : 0);
  const revealed = nodes.filter((n) => n.kind === "revealed").length;
  const summary = `${size} proofs hashed into one tree. ${chosen.length} chosen for the link; ${revealed} other branch${revealed === 1 ? "" : "es"} shown only as hashes; the signed root is ${shortHash(root, 12)}.`;

  return (
    <figure className="space-y-3">
      <p className="text-center text-sm text-muted-foreground">
        Signed root <span className="font-mono text-foreground">{shortHash(root, 12)}</span>
      </p>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={summary} className="h-auto w-full">
        {nodes.flatMap((n) => n.children.map((cid) => {
          const c = byId.get(cid) as Placed;
          const lit = c.kind === "chosen" || c.kind === "root-path";
          return (
            <line key={`${n.id}-${cid}`} x1={n.x} y1={n.y} x2={c.x} y2={c.y}
              className={lit ? "stroke-primary" : "stroke-border"} strokeWidth={lit ? 3 : 2} />
          );
        }))}
        {nodes.map((n) => {
          const isLeaf = n.leafIndex !== undefined;
          const r = isLeaf ? (n.kind === "chosen" ? 12 : 8) : n.id === "n" ? 12 : 7;
          const cls =
            n.kind === "chosen" ? "fill-primary stroke-primary"
              : n.kind === "root-path" ? "fill-primary/70 stroke-primary"
                : n.kind === "revealed" ? "fill-card stroke-primary"
                  : "fill-muted stroke-muted-foreground/40";
          const label = isLeaf ? labels.get(n.leafIndex as number) : undefined;
          const title = isLeaf
            ? `Proof ${(n.leafIndex as number) + 1}${label ? `: ${label.skillName}${label.rungLabel ? `, ${label.rungLabel}` : ""}` : ""} (${STATE[n.kind]})`
            : n.id === "n" ? `Signed root ${shortHash(root, 12)}` : `Inner hash (${STATE[n.kind]})`;
          const ly = n.y + r + 10;
          return (
            <g key={n.id}>
              <title>{title}</title>
              <circle cx={n.x} cy={n.y} r={r} strokeWidth={2}
                strokeDasharray={n.kind === "revealed" ? "4 3" : undefined}
                className={`${cls} transition-[fill,stroke,r] duration-200 ease-out motion-reduce:transition-none`} />
              {label && (
                <text x={n.x} y={ly} transform={`rotate(-35 ${n.x} ${ly})`} textAnchor="end" dominantBaseline="hanging" fontSize={14}
                  className={n.kind === "chosen" ? "fill-foreground font-semibold" : "fill-muted-foreground"}>
                  {shortLabel(label.skillName)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="space-y-2 text-sm text-muted-foreground">
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full bg-primary" />In the link</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full border-2 border-dashed border-primary bg-card" />Hash only</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full border-2 border-border bg-muted" />Hidden</span>
        </span>
        <span className="block">{summary}</span>
      </figcaption>
    </figure>
  );
}
