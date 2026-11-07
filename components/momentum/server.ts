import "server-only";
// Server-side loaders shared by GET /api/momentum/[userId] and the Build Log server action.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { computeMomentum, dedupeEvents, DEFAULT_EVENT_LABEL, newestFirst } from "@/lib/momentum";
import { MomentumEventZ, MomentumWeekZ, type MomentumEvent } from "@/lib/schemas/community";
import type { MomentumWeek } from "@/lib/types";
import { DEMO_EVENTS, DEMO_USER_ID, demoWeeks } from "./demo";

const isDemoMode = () => process.env.DEMO_MODE === "true";

/** data/fixtures/momentum.aisha.json (written by the seed script), read at runtime; null if missing or invalid. */
function readWeeksFixture(): MomentumWeek[] | null {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/momentum.aisha.json"), "utf8"));
    const parsed = z.array(MomentumWeekZ).min(1).safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The user's stored events that pass validation. */
async function storedEvents(userId: string): Promise<MomentumEvent[]> {
  const rows = await getStore().list<unknown>("momentum_events", { userId });
  return rows.flatMap((r) => {
    const p = MomentumEventZ.safeParse(r);
    return p.success && p.data.userId === userId ? [p.data] : [];
  });
}

/** Aisha (the demo persona) keeps her fixture history; live events are added on top. */
async function eventsFor(userId: string): Promise<{ events: MomentumEvent[]; stored: number }> {
  if (userId !== DEMO_USER_ID) {
    const events = await storedEvents(userId);
    return { events, stored: events.length };
  }
  const stored = isDemoMode() ? [] : await storedEvents(userId);
  return { events: dedupeEvents([...stored, ...DEMO_EVENTS]), stored: stored.length };
}

/** MomentumWeek[] (6 weeks, latest last). */
export async function loadMomentumWeeks(userId: string, now: Date = new Date()): Promise<MomentumWeek[]> {
  const { events, stored } = await eventsFor(userId);
  if (userId === DEMO_USER_ID && stored === 0) return readWeeksFixture() ?? demoWeeks();
  return computeMomentum(events, userId, now);
}

/** Verified events for the Build Log, newest first, each with a label. */
export async function loadBuildLog(userId: string): Promise<MomentumEvent[]> {
  const { events } = await eventsFor(userId);
  return newestFirst(dedupeEvents(events)).map((e) => ({ ...e, label: e.label?.trim() || DEFAULT_EVENT_LABEL[e.kind] }));
}
