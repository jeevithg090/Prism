"use client";
// Readiness Explained · the waterfall: every source's exact share of readiness, stacked left to right until the
// bars reach the headline score. "By skill" shows the same split per skill, against what the skill could add.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import type { Contributor, Explanation } from "@/lib/labs/shapley/model";
import { cn } from "@/lib/utils";
import { fmt1, KIND, shortDate, signed } from "./format";

const TOP_SOURCES = 8;
const TOP_SKILLS = 10;

function Bar({ left, width, className, index }: { left: number; width: number; className: string; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={cn("absolute inset-y-0 rounded-full", className)}
      style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%`, transformOrigin: "left center" }}
      initial={reduce ? false : { opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: reduce ? 0 : Math.min(index, 12) * 0.04 }}
    />
  );
}

function SourceDetail({ c }: { c: Contributor }) {
  const external = c.url?.startsWith("https://");
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-muted/60 p-4 text-sm">
      {c.kind === "beyond-map" ? (
        <p>{c.detail}</p>
      ) : (
        <>
          {c.belowBar ? (
            <p>
              This counts 0 points for now. It&apos;s level {c.belowBar.level} at {Math.round(c.belowBar.confidence * 100)}% confidence, and readiness
              counts proof from level 2 at 60% confidence.
            </p>
          ) : (
            <p>
              Its fair share is <span className="font-mono tabular-nums">{fmt1(c.points)}</span> points. If it were the only source you lost,
              readiness would drop <span className="font-mono tabular-nums">{fmt1(c.leaveOneOut)}</span> points
              {c.leaveOneOut < c.points - 0.05 ? ", because another source covers part of the same skill." : "."}
            </p>
          )}
          {c.skills.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Skills it covers">
              {c.skills.map((s) => (
                <li key={s.skillId} className="rounded-full border bg-card px-2.5 py-0.5 text-sm">
                  {s.name} <span className="font-mono tabular-nums text-muted-foreground">{signed(s.points)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground">
            {c.detail}
            {c.createdAt ? ` Added ${shortDate(c.createdAt)}.` : ""}
          </p>
          {external && (
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Open the evidence <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </>
      )}
    </div>
  );
}

function kindLine(c: Contributor): string {
  if (c.kind === "evidence") return c.belowBar ? "Evidence below the proof bar" : `Evidence for ${c.skills.map((s) => s.name).join(", ")}`;
  if (c.kind === "module") return `Module: ${c.skills.length} ${c.skills.length === 1 ? "skill" : "skills"}${c.origin ? `, ${c.origin}` : ""}`;
  if (c.kind === "record") return "Recorded on your Bridge Map";
  return "Reconciles the headline score";
}

function BySource({ x, showAll }: { x: Explanation; showAll: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const total = Math.max(x.readiness.now * 100, 0.01);
  const regular = x.contributors.filter((c) => c.kind !== "beyond-map");
  const beyond = x.contributors.filter((c) => c.kind === "beyond-map");
  const shown = showAll ? regular : regular.slice(0, TOP_SOURCES);
  const rest = showAll ? [] : regular.slice(TOP_SOURCES);
  const restPoints = rest.reduce((a, c) => a + c.points, 0);
  let cursor = 0;
  const rows: { key: string; c?: Contributor; label: string; sub: string; points: number; left: number; width: number; bar: string }[] = [];
  const push = (key: string, label: string, sub: string, points: number, bar: string, c?: Contributor) => {
    const left = points >= 0 ? cursor : cursor + points;
    rows.push({ key, c, label, sub, points, left: (left / total) * 100, width: (Math.abs(points) / total) * 100, bar });
    cursor += points;
  };
  for (const c of shown) push(c.id, c.label, kindLine(c), c.points, KIND[c.kind].bar, c);
  if (rest.length) push("rest", `${rest.length} more sources`, "Smaller shares, each under the ones above", restPoints, "bg-chart-4");
  for (const c of beyond) push(c.id, c.label, kindLine(c), c.points, KIND[c.kind].bar, c);

  return (
    <ol className="divide-y" aria-label="Readiness split by source">
      {rows.map((r, i) => {
        const expandable = !!r.c;
        const isOpen = open === r.key;
        const label = (
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="truncate" title={r.label}>{r.label}</span>
              {expandable && <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden />}
            </span>
            <span className="block truncate text-sm text-muted-foreground">{r.sub}</span>
          </span>
        );
        return (
          <li key={r.key} className="py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_4.5rem] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_4.5rem]">
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  className="-mx-1 min-w-0 rounded-lg px-1 py-0.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {label}
                </button>
              ) : label}
              <span className="relative order-last col-span-2 h-3 rounded-full bg-muted sm:order-none sm:col-span-1">
                <Bar left={r.left} width={r.width} className={r.bar} index={i} />
              </span>
              <span className="text-right font-mono font-semibold tabular-nums">{signed(r.points)}</span>
            </div>
            {isOpen && r.c && <SourceDetail c={r.c} />}
          </li>
        );
      })}
      <li className="py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_4.5rem] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_4.5rem]">
          <span className="font-semibold">Readiness today</span>
          <span className="relative order-last col-span-2 h-3 rounded-full bg-muted sm:order-none sm:col-span-1">
            <Bar left={0} width={100} className="bg-primary" index={rows.length} />
          </span>
          <span className="text-right font-mono font-semibold tabular-nums">{fmt1(total)}</span>
        </div>
      </li>
    </ol>
  );
}

function BySkill({ x, showAll }: { x: Explanation; showAll: boolean }) {
  const skills = [...x.skills].sort((a, b) => b.maxPoints - a.maxPoints);
  const shown = showAll ? skills : skills.slice(0, TOP_SKILLS);
  const scale = Math.max(...skills.map((s) => s.maxPoints), 0.01);
  const kindOf = new Map(x.contributors.map((c) => [c.id, c.kind]));
  return (
    <ol className="divide-y" aria-label="Readiness split by skill">
      {shown.map((s, i) => {
        let cursor = 0;
        const shares = s.shares.filter((h) => h.points > 0);
        return (
          <li key={s.skillId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_6.5rem] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_6.5rem]">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{s.name}</span>
                <StatusBadge status={s.status} size="sm" />
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                {shares.length ? shares.map((h) => `${h.label.split(" (")[0]} ${fmt1(h.points)}`).join(", ") : `${s.demandPct}% of ${x.roleName} ads, nothing covers it yet`}
              </span>
            </span>
            <span className="relative order-last col-span-2 h-3 sm:order-none sm:col-span-1">
              <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-muted" style={{ width: `${(s.maxPoints / scale) * 100}%` }} />
              {shares.map((h) => {
                const left = (cursor / scale) * 100;
                cursor += h.points;
                return <Bar key={h.contributorId} left={left} width={(h.points / scale) * 100} className={KIND[kindOf.get(h.contributorId) ?? h.kind].bar} index={i} />;
              })}
            </span>
            <span className="text-right font-mono tabular-nums">
              <span className="font-semibold">{fmt1(s.points)}</span>
              <span className="text-muted-foreground"> of {fmt1(s.maxPoints)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Waterfall({ x }: { x: Explanation }) {
  const [view, setView] = React.useState<"source" | "skill">("source");
  const [showAll, setShowAll] = React.useState(false);
  const regular = x.contributors.filter((c) => c.kind !== "beyond-map").length;
  const hidden = view === "source" ? Math.max(0, regular - TOP_SOURCES) : Math.max(0, x.skills.length - TOP_SKILLS);
  const kinds = [...new Set(x.contributors.map((c) => c.kind))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Split readiness by">
          {(["source", "skill"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => { setView(v); setShowAll(false); }}
              className={cn(
                "h-10 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                view === v ? "border-primary bg-primary/10 text-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {v === "source" ? `By source (${regular})` : `By skill (${x.skills.length})`}
            </button>
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Legend">
          {kinds.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", KIND[k].dot)} aria-hidden />{KIND[k].label}</li>
          ))}
        </ul>
      </div>
      {view === "source" ? <BySource x={x} showAll={showAll} /> : <BySkill x={x} showAll={showAll} />}
      {hidden > 0 && (
        <Button variant="ghost" className="h-10 rounded-xl px-4" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
          {showAll ? "Show fewer" : `Show all ${view === "source" ? regular : x.skills.length} ${view === "source" ? "sources" : "skills"}`}
        </Button>
      )}
    </div>
  );
}
