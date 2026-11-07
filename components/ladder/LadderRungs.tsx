"use client";
// P5 · Presentational Proof Ladder pieces: the horizontal ●○○ strip and the vertical ladder for one skill.
import * as React from "react";
import { format } from "date-fns";
import { ExternalLink, FlaskConical, GraduationCap, Hammer, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  describeLadder, RUNG_LABEL, RUNG_MEANING, SOURCE_LABEL,
  type LadderEvidence, type LadderRung, type RungNumber, type SkillLadder,
} from "./model";

export const RUNG_ICON: Record<RungNumber, LucideIcon> = { 1: FlaskConical, 2: Hammer, 3: GraduationCap };

export function formatProofDate(iso?: string): string | null {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? format(d, "d MMM yyyy") : null;
}

/** One-line description of a rung for tooltips and screen readers. */
export function rungSummary(r: LadderRung): string {
  if (r.status === "open") return `${r.label}: not yet. ${RUNG_MEANING[r.rung]}`;
  if (r.impliedBy) return `${r.label}: counted, because you proved ${RUNG_LABEL[r.impliedBy]}.`;
  const date = formatProofDate(r.evidence?.createdAt);
  return `${r.label}: ${r.evidence?.quote ?? "proven"}${date ? ` (${date})` : ""}.`;
}

const isExternal = (url: string) => /^https?:\/\//.test(url);

/** A rung's circle. Done = filled emerald; implied = dashed emerald ring; open = muted outline. */
export function RungDot({ rung, size = "md" }: { rung: Pick<LadderRung, "rung" | "status" | "impliedBy">; size?: "sm" | "md" | "lg" }) {
  const Icon = RUNG_ICON[rung.rung];
  const done = rung.status === "done";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-12 [&_svg]:size-5",
        done && !rung.impliedBy && "border-status-proven bg-status-proven text-background",
        done && rung.impliedBy && "border-dashed border-status-proven bg-status-proven/10 text-status-proven",
        !done && "border-border bg-card text-muted-foreground",
      )}
    >
      <Icon />
    </span>
  );
}

/**
 * The horizontal strip: three rung dots joined by a rail, each with a tooltip saying what proved it.
 * `showLabels` prints "Tried it · Built it · Can teach it" under the dots.
 */
export function RungStrip({ ladder, showLabels = false, size = "sm", className }: {
  ladder: Pick<SkillLadder, "skillName" | "rungs">; showLabels?: boolean; size?: "sm" | "md"; className?: string;
}) {
  return (
    <ol aria-label={describeLadder(ladder)} className={cn("flex items-start", className)}>
      {ladder.rungs.map((r, i) => (
        <li key={r.rung} className="flex items-start">
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                "mt-[13px] h-0.5 w-4 sm:w-6",
                size === "md" && "mt-[17px]",
                r.status === "done" ? "bg-status-proven" : "bg-border",
              )}
            />
          )}
          <div className="flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={rungSummary(r)}
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  />
                }
              >
                <RungDot rung={r} size={size} />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-sm">{rungSummary(r)}</TooltipContent>
            </Tooltip>
            {showLabels && (
              <span aria-hidden className={cn("text-xs whitespace-nowrap", r.status === "done" ? "font-medium text-foreground" : "text-muted-foreground")}>
                {r.label}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EvidenceLink({ evidence, skillName }: { evidence: LadderEvidence; skillName: string }) {
  if (!evidence.url) return null;
  const external = isExternal(evidence.url);
  return (
    <a
      href={evidence.url}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      View proof<span className="sr-only">: {skillName}, {SOURCE_LABEL[evidence.source]}</span>
      {external && (
        <>
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </>
      )}
    </a>
  );
}

/** One rung's proof as a compact line: source pill · quote · date · link. */
export function EvidenceLine({ rung, skillName }: { rung: LadderRung; skillName: string }) {
  const ev = rung.evidence;
  if (!ev) {
    return rung.impliedBy ? (
      <p className="text-sm text-muted-foreground">Counted because {RUNG_LABEL[rung.impliedBy]} is proven.</p>
    ) : null;
  }
  const date = formatProofDate(ev.createdAt);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="inline-flex items-center rounded-full border bg-card px-2 py-0.5 text-xs font-medium">{SOURCE_LABEL[ev.source]}</span>
      <span className="min-w-0 break-words text-foreground">{ev.quote}</span>
      {date && <time dateTime={ev.createdAt} className="text-muted-foreground tabular-nums">{date}</time>}
      <EvidenceLink evidence={ev} skillName={skillName} />
    </div>
  );
}

/** The vertical ladder for one skill: rung 3 at the top, rung 1 at the bottom (DOM order 1 → 3 for screen readers). */
export function RungLadder({ ladder }: { ladder: SkillLadder }) {
  return (
    <ol aria-label={`${ladder.skillName} proof ladder`} className="flex flex-col-reverse">
      {ladder.rungs.map((r, i) => {
        const above = ladder.rungs[i + 1];
        return (
        <li key={r.rung} className={cn("relative flex gap-4", above && "pt-6")}>
          {above && (
            <span
              aria-hidden
              className={cn("absolute start-6 top-0 h-6 w-0.5 -translate-x-1/2", above.status === "done" ? "bg-status-proven" : "bg-border")}
            />
          )}
          <RungDot rung={r} size="lg" />
          <div className="min-w-0 flex-1 space-y-1 pt-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-semibold">
                <span className="text-muted-foreground tabular-nums">{r.rung} · </span>{r.label}
              </span>
              <span className={cn("text-sm", r.status === "done" ? "text-foreground" : "text-muted-foreground")}>
                {r.status === "done" ? (r.impliedBy ? "Counted" : "Proven") : "Not yet"}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">{RUNG_MEANING[r.rung]}</p>
            {r.status === "done" && <EvidenceLine rung={r} skillName={ladder.skillName} />}
          </div>
        </li>
        );
      })}
    </ol>
  );
}
