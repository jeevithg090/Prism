// The graph's key: the rising ring, what size means and what a line means. NodeGlyph draws a status
// exactly as the canvas does, for any SVG that needs one.
import type { SkillStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GLYPH, ICON_PATHS } from "./graphDraw";

const TONE = { proven: "text-status-proven", degree: "text-status-degree", gap: "text-status-gap" } as const;

/** One node as an SVG, from the same geometry as the canvas (graphDraw.ts). */
export function NodeGlyph({ status, size = 22, className }: { status: SkillStatus; size?: number; className?: string }) {
  const g = GLYPH[status];
  const s = g.size * 9;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" className={cn("shrink-0", TONE[g.tone], className)}>
      <circle
        cx="12" cy="12" r="9" strokeWidth="2"
        className={g.filled ? "fill-current stroke-none" : "fill-card stroke-current"}
        strokeDasharray={g.dashed ? "3.4 2.6" : undefined}
      />
      <g
        transform={`translate(${12 - s / 2} ${12 - s / 2}) scale(${s / 24})`}
        fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        className={g.filled ? "stroke-card" : "stroke-current"}
      >
        {ICON_PATHS[g.icon].map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}

export function MapLegend({ className }: { className?: string }) {
  // Status is already keyed by the chips and the band heads; the key only names the three encodings they do not.
  return (
    <ul aria-label="How to read the map" className={cn("flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground", className)}>
      <li className="inline-flex items-center gap-2">
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden focusable="false" className="shrink-0">
          <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.25" className="stroke-status-rising" />
          <circle cx="12" cy="12" r="6" className="fill-paper-3" />
        </svg>
        Rising demand
      </li>
      <li className="inline-flex items-center gap-2">
        <svg viewBox="0 0 30 24" width={28} height={22} aria-hidden focusable="false" className="shrink-0 stroke-field">
          <circle cx="6" cy="16" r="4" fill="none" strokeWidth="1.5" />
          <circle cx="20" cy="12" r="8" fill="none" strokeWidth="1.5" />
        </svg>
        Bigger circle: more job ads ask for it
      </li>
      <li className="inline-flex items-center gap-2">
        <svg viewBox="0 0 30 24" width={28} height={22} aria-hidden focusable="false" className="shrink-0 fill-field stroke-field">
          <path d="M2 18C12 18 14 6 24 6" fill="none" strokeWidth="1.5" />
          <path d="M28 6l-5-3v6z" stroke="none" />
        </svg>
        Line: what it builds on
      </li>
    </ul>
  );
}
