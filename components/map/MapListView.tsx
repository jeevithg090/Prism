"use client";
// The accessible alternative to the graph (contract §9.7): one row per skill, sortable, default demand ↓.
import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { BridgeNode } from "@/lib/types";
import { StatusTag } from "./StatusTag";
import { cn } from "@/lib/utils";
import { degreeText, pctOf } from "./mapUtils";

type SortKey = "demand" | "name";

export function MapListView({
  nodes, roleLabel, selectedId, onSelect,
}: { nodes: BridgeNode[]; roleLabel: string; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "demand", dir: "desc" });
  const rows = React.useMemo(() => {
    const r = [...nodes].sort((a, b) => (sort.key === "demand" ? a.demand - b.demand || b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
    return sort.dir === "desc" ? r.reverse() : r;
  }, [nodes, sort]);
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "demand" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "desc" ? "descending" : "ascending") : "none");
  const arrow = (k: SortKey) => (sort.key !== k ? null : sort.dir === "desc" ? <ArrowDown className="size-4" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />);
  const th = "px-3 py-3 text-left text-sm font-semibold text-foreground";
  const sortBtn = "inline-flex items-center gap-1 rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div role="region" aria-label="Bridge Map as a table" tabIndex={0} className="overflow-x-auto rounded-xl border outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <caption className="sr-only">Every skill on your Bridge Map, with its status, share of {roleLabel} ads and what covers it.</caption>
        <thead className="bg-muted/60">
          <tr>
            <th scope="col" aria-sort={ariaSort("name")} className={th}>
              <button type="button" className={sortBtn} onClick={() => toggle("name")}>Skill {arrow("name")}</button>
            </th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" aria-sort={ariaSort("demand")} className={th}>
              <button type="button" className={sortBtn} onClick={() => toggle("demand")}>Demand {arrow("demand")}</button>
            </th>
            <th scope="col" className={th}>Trend</th>
            <th scope="col" className={th}>Covered by</th>
            <th scope="col" className={th}>Proof</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((n) => (
            <tr key={n.skillId} data-skill={n.skillId} className={cn(n.skillId === selectedId && "bg-primary/5")}>
              <th scope="row" className="px-3 py-2.5 text-left font-medium">
                {onSelect ? (
                  <button type="button" onClick={() => onSelect(n.skillId)} className="rounded-md text-left outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                    {n.name}
                  </button>
                ) : n.name}
              </th>
              <td className="px-3 py-2.5"><StatusTag status={n.status} /></td>
              <td className="px-3 py-2.5 font-mono tabular-nums">{n.demand > 0 ? `${pctOf(n.demand)}% of ads` : "Not in ads"}</td>
              <td className="px-3 py-2.5">{n.trend ? <StatusTag status={n.trend} /> : <span className="text-muted-foreground">No data</span>}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{degreeText(n)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {n.evidenceIds.length ? `${n.evidenceIds.length} ${n.evidenceIds.length === 1 ? "item" : "items"}` : "None yet"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
