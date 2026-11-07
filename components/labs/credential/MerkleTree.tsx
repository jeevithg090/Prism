"use client";
// The student's proof tree as a diagram: every leaf is one proof, the root is what Keystone signs.
// Chosen leaves are filled, the sibling hashes a link reveals are outlined, everything else stays grey.
import * as React from "react";
import type { TreeNodeView } from "@/lib/labs/credential/model";
import { shortHash } from "@/lib/labs/credential/model";

type Placed = { id: string; x: number; y: number; leafIndex?: number; kind: "chosen" | "revealed" | "hidden" | "root-path"; children: string[] };

const W = 640;
const ROW = 64;
const PAD_X = 24;
const PAD_TOP = 20;

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

export function MerkleTree({ tree, size, chosen, root }: { tree: TreeNodeView | null; size: number; chosen: number[]; root: string }) {
  const set = React.useMemo(() => new Set(chosen), [chosen]);
  const nodes = React.useMemo(() => (tree ? layout(tree, size, set) : []), [tree, size, set]);
  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  if (!tree) return null;
  const h = PAD_TOP + height(tree) * ROW + 20;
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
          const r = isLeaf ? 9 : n.id === "n" ? 12 : 7;
          const cls =
            n.kind === "chosen" ? "fill-primary stroke-primary"
              : n.kind === "root-path" ? "fill-primary/70 stroke-primary"
                : n.kind === "revealed" ? "fill-card stroke-primary"
                  : "fill-muted stroke-muted-foreground/40";
          return (
            <circle key={n.id} cx={n.x} cy={n.y} r={r} strokeWidth={2}
              strokeDasharray={n.kind === "revealed" ? "4 3" : undefined}
              className={`${cls} transition-colors duration-200 ease-out motion-reduce:transition-none`} />
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
