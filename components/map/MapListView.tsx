"use client";
// The accessible alternative to the graph (contract §9.7): one row per skill, sortable, default demand ↓.
import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { BridgeNode } from "@/lib/types";
import { StatusTag } from "./StatusTag";
import { cn } from "@/lib/utils";
import { degreeText, FOCUS, pctOf } from "./mapUtils";

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
  const th = "h-11 px-3 text-left align-middle text-sm font-medium whitespace-nowrap text-muted-foreground first:pl-4 md:first:pl-6";
  const td = "px-3 py-3 align-middle";
  const sortBtn = cn("-mx-1 inline-flex h-8 items-center gap-1 rounded-md px-1 transition-[color] duration-(--dur-short) hover:text-foreground", FOCUS);

  return (
    <div role="region" aria-label="Bridge Map as a table" tabIndex={0} className={cn("overflow-x-auto", FOCUS, "focus-visible:-outline-offset-2")}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">Every skill on your Bridge Map, with its status, share of {roleLabel} ads and what covers it.</caption>
        <thead className="border-y">
          <tr>
            <th scope="col" aria-sort={ariaSort("name")} className={cn(th, "sticky left-0 z-(--z-base) bg-card")}>
              <button type="button" className={sortBtn} onClick={() => toggle("name")}>Skill {arrow("name")}</button>
            </th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" aria-sort={ariaSort("demand")} className={th}>
              <button type="button" className={sortBtn} onClick={() => toggle("demand")}>Demand {arrow("demand")}</button>
            </th>
            <th scope="col" className={th}>Trend</th>
            <th scope="col" className={th}>Covered by</th>
            <th scope="col" className={cn(th, "pr-4 md:pr-6")}>Proof</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((n) => {
            const on = n.skillId === selectedId;
            return (
              <tr key={n.skillId} data-skill={n.skillId} className={cn(on && "bg-signal-soft")}>
                <th scope="row" className={cn(td, "sticky left-0 z-(--z-base) pl-4 text-left text-base font-medium text-foreground md:pl-6", on ? "bg-signal-soft" : "bg-card")}>
                  {onSelect ? (
                    <button
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => onSelect(n.skillId)}
                      className={cn("rounded-md text-left underline-offset-4 hover:underline", FOCUS)}
                    >
                      {n.name}
                    </button>
                  ) : n.name}
                </th>
                <td className={td}><StatusTag status={n.status} /></td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {n.demand > 0 ? (
                    <><span className="font-mono font-semibold text-foreground tabular-nums">{pctOf(n.demand)}%</span> <span className="text-muted-foreground">of ads</span></>
                  ) : <span className="text-muted-foreground">Not in ads</span>}
                </td>
                <td className={td}>{n.trend ? <StatusTag status={n.trend} /> : <span className="text-muted-foreground">No data</span>}</td>
                <td className={cn(td, "min-w-48 text-muted-foreground")}>{degreeText(n)}</td>
                <td className={cn(td, "pr-4 text-muted-foreground md:pr-6")}>
                  {n.evidenceIds.length ? `${n.evidenceIds.length} ${n.evidenceIds.length === 1 ? "item" : "items"}` : "None yet"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
