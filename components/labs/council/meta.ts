// Agent Council UI metadata: stance colours (colour + icon + label, never colour alone) and small formatters.
import { AlertTriangle, CheckCircle2, CircleX, type LucideIcon } from "lucide-react";
import { AGENT_LABEL } from "@/components/shell/ActivityPanel";
import { SEAT_AGENT, type Seat, type Stance } from "@/lib/labs/council/types";

export const STANCE_META: Record<Stance, { label: string; icon: LucideIcon; tint: string; icon_: string; bar: string }> = {
  support: { label: "Supports", icon: CheckCircle2, tint: "bg-status-proven/10 border-status-proven/30", icon_: "text-status-proven", bar: "bg-status-proven" },
  caution: { label: "Cautions", icon: AlertTriangle, tint: "bg-status-rising/10 border-status-rising/30", icon_: "text-status-rising", bar: "bg-status-rising" },
  oppose: { label: "Opposes", icon: CircleX, tint: "bg-status-gap/10 border-status-gap/30", icon_: "text-status-gap", bar: "bg-status-gap" },
};

export const stanceFor = (score: number): Stance => (score >= 0.25 ? "support" : score <= -0.25 ? "oppose" : "caution");

/** "Market agent" etc.: the existing Keystone agent that runs the seat (shown so the Activity panel matches). */
export const seatAgentLabel = (seat: Seat) => AGENT_LABEL[SEAT_AGENT[seat]];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function fmtWhen(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((now - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const newClientRunId = () => `run_${Math.random().toString(36).slice(2, 12).padEnd(8, "0")}`;
