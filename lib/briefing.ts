import "server-only";
// P4 · Weekly audio briefing: the roadmap week, momentum, pod progress and market moves, as a ~140-word
// script for ElevenLabs TTS (n8n W2 posts it to Discord on Monday mornings). Deterministic script first;
// llmText can rewrite it in a radio-host voice when a key exists (never in DEMO_MODE).
import fs from "node:fs";
import path from "node:path";
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import type { Briefing } from "@/lib/types";
import {
  currentRoadmapWeek, DEFAULT_ROLE, firstName, latestPodWork, loadProfile, marketMoves, momentumChange, readJSON, roleName,
} from "@/lib/voice/data";
import { BriefingZ } from "@/lib/voice/schemas";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The Monday a briefing is for: this week's Monday, or next Monday at the weekend. ISO date (UTC). */
export function briefingWeekOf(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const shift = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
}
export function humanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface BriefingFacts {
  name: string; role: string; weekOf: string; weekNumber: number; focus: string; tasks: string[];
  momentumPct: number | null; podName?: string; podMerged: number; myIssue: string; myIssueMerged: boolean; reviewer?: string;
  marketMoves: string[];
}

export async function briefingFacts(userId: string, now: Date = new Date()): Promise<BriefingFacts> {
  const profile = await loadProfile(userId);
  const roleId = profile?.dna?.targetRoles?.[0] ?? DEFAULT_ROLE;
  const [week, momentumPct, work, moves] = await Promise.all([
    currentRoadmapWeek(userId, roleId), momentumChange(userId), latestPodWork(userId), marketMoves(roleId, userId, 2),
  ]);
  const tasks = [...week.tasks];
  if (tasks.length < 3 && week.proof) tasks.push(week.proof);
  return {
    name: firstName(profile, userId), role: roleName(roleId), weekOf: briefingWeekOf(now), weekNumber: week.week,
    focus: week.focusName, tasks: tasks.slice(0, 3), momentumPct, podName: work.podName, podMerged: work.mergedCount,
    myIssue: work.issueTitle, myIssueMerged: work.merged, reviewer: work.reviewerName, marketMoves: moves,
  };
}

const ORDINAL = ["One", "Two", "Three"];

/** The deterministic ~140-word script (also the fallback when the LLM is unavailable). */
export function briefingScript(f: BriefingFacts): string {
  const parts: string[] = [];
  parts.push(`Good morning, ${f.name}. Here's your Keystone briefing for the week of ${humanDate(f.weekOf)}.`);
  if (f.marketMoves.length) {
    parts.push(`First, the job market for ${f.role} roles: ${f.marketMoves.join(", and ")}.`);
  }
  if (f.momentumPct !== null) {
    parts.push(f.momentumPct >= 0
      ? `Your momentum is up ${f.momentumPct}% on your usual week, so keep that rhythm going.`
      : `Your momentum is ${Math.abs(f.momentumPct)}% below your usual week. That's fine; one small task gets it moving again.`);
  }
  if (f.podName) {
    const pr = f.podMerged === 1 ? "1 pull request" : `${f.podMerged} pull requests`;
    const reviewer = f.reviewer ? `, and ${f.reviewer} is your reviewer` : "";
    parts.push(f.myIssueMerged
      ? `In ${f.podName}, the pod has merged ${pr} so far, including yours: ${f.myIssue}.`
      : f.podMerged === 0
        ? `In ${f.podName}, nothing is merged yet, so your pull request for ${f.myIssue} could be the first${reviewer}.`
        : `In ${f.podName}, the pod has merged ${pr} so far. Your issue, ${f.myIssue}, is waiting for your pull request${reviewer}.`);
  }
  parts.push(`This is week ${f.weekNumber} of your roadmap, and the focus is ${f.focus}.`);
  if (f.tasks.length) parts.push(`Your tasks: ${f.tasks.map((t, i) => `${ORDINAL[i] ?? i + 1}, ${t.replace(/\.$/, "")}.`).join(" ")}`);
  parts.push(`Small steps every week build the bridge. Have a good week.`);
  return parts.join(" ");
}

const HOST_SYSTEM =
  "You are a warm, upbeat radio host giving a student a 60-second weekly career briefing. ~140 words. Plain UK English, second person. Mention 1-2 market moves with their numbers exactly as given, their pod, and this week's 3 tasks. Use only the facts provided; invent nothing. End with an encouraging line. No emoji, no markdown.";

function audioUrlFor(userId: string): string | undefined {
  const rel = `demo/briefing-${userId}.mp3`;
  try {
    return fs.existsSync(path.join(process.cwd(), "public", rel)) ? `/${rel}` : undefined;
  } catch {
    return undefined;
  }
}

export async function buildBriefing(userId: string, now: Date = new Date()): Promise<Briefing> {
  let facts: BriefingFacts;
  try {
    facts = await briefingFacts(userId, now);
  } catch {
    const fx = BriefingZ.safeParse(readJSON(`data/fixtures/briefing.${userId}.json`));
    if (fx.success) return fx.data;
    throw new Error("briefing data unavailable");
  }
  let script = briefingScript(facts);
  if (process.env.DEMO_MODE !== "true") {
    try {
      const text = (await llmText({ agent: "voice", system: HOST_SYSTEM, user: JSON.stringify(facts), replayAlt: { briefingFor: userId } })).trim();
      const words = text.match(/\S+/g)?.length ?? 0;
      if (words >= 60 && words <= 260) script = text;
    } catch {
      // keep the deterministic script
    }
  }
  const audioUrl = audioUrlFor(userId);
  const briefing: Briefing = {
    userId, weekOf: facts.weekOf, script, ...(audioUrl ? { audioUrl } : {}), topTasks: facts.tasks, marketMoves: facts.marketMoves,
  };
  try {
    await getStore().upsert("briefings", `${userId}:${facts.weekOf}`, { id: `${userId}:${facts.weekOf}`, ...briefing }, userId);
  } catch {
    // caching the briefing is best-effort
  }
  return briefing;
}
