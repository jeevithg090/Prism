// Bundled demo data for Aisha (client-safe): powers "Use demo data" and the server-side fallbacks.
import type { MomentumEvent } from "@/lib/schemas/community";
import type { MomentumWeek } from "@/lib/types";
import { computeMomentum, newestFirst } from "@/lib/momentum";
import eventsJson from "@/data/fixtures/momentum-events.aisha.json";

export const DEMO_USER_ID = "aisha";

/** Aisha's verified events, newest first. */
export const DEMO_EVENTS: MomentumEvent[] = newestFirst(eventsJson as MomentumEvent[]);

/** The fixture is anchored to its latest event so the demo looks the same on any day. */
export const DEMO_NOW = new Date(Math.max(...DEMO_EVENTS.map((e) => Date.parse(e.ts))));

/** 6 weeks computed from the demo events (2026-W40 … 2026-W45, last week +18%). */
export function demoWeeks(): MomentumWeek[] {
  return computeMomentum(DEMO_EVENTS, DEMO_USER_ID, DEMO_NOW);
}
