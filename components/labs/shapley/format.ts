// Readiness Explained · display helpers shared by the page's components.
import type { MoverKind } from "@/lib/labs/shapley/model";

/** 6.504 → "6.5" */
export const fmt1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
/** 6.5 → "+6.5", −1.6 → "−1.6" */
export const signed = (x: number) => `${x < 0 ? "−" : "+"}${fmt1(Math.abs(x))}`;
/** "2026-10-31" → "31 Oct" */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const hoursLabel = (h: number) => (h < 1 ? `${Math.round(h * 60)} minutes` : `${fmt1(h).replace(/\.0$/, "")} ${h === 1 ? "hour" : "hours"}`);

/** Bar colour, legend label and the kind's plain name per kind (colour is never the only cue). */
export const KIND: Record<MoverKind, { bar: string; dot: string; label: string }> = {
  evidence: { bar: "bg-status-proven", dot: "bg-status-proven", label: "Your evidence" },
  module: { bar: "bg-status-degree", dot: "bg-status-degree", label: "Degree modules" },
  record: { bar: "bg-chart-5", dot: "bg-chart-5", label: "Recorded on your map" },
  adjustment: { bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/40", label: "Stored score adjustment" },
};
