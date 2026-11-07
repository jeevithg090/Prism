import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  BridgeMap,
  Briefing,
  MomentumWeek,
  Pod,
  Profile,
  Roadmap,
  RoadmapWeek,
  Skill,
  TrendLabel,
  TrendSeries,
} from "@/lib/types";
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { BriefingZ } from "@/lib/schemas/voice";
import { isDemo } from "@/lib/voice/http";
import { roleName, skillLabel } from "@/lib/voice/roles";
import demoBriefingJson from "@/data/fixtures/briefing.aisha.json";

// Weekly audio briefing (P4 PR4). Gathers roadmap, momentum, trends and pod data, then asks the LLM for a
// ~140-word radio-host script. Without an LLM key (or on any LLM error) it writes the same script from a template.

export const BRIEFING_SYSTEM =
  "You are a warm, upbeat radio host giving a student a 60-second weekly career briefing. ~140 words. Plain English. Mention 1-2 market moves with numbers, their pod, and this week's 3 tasks. End with an encouraging line.";

export const DEMO_AUDIO_URL = "/demo/briefing-aisha.mp3";
const DEMO_USER = "aisha";
const DAY_MS = 86_400_000;
const MAX_SCRIPT_CHARS = 2400; // TtsReqZ allows 2500
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Thrown when a (non-demo) user has no roadmap yet, so there is nothing to brief them on. */
export class BriefingUnavailable extends Error {
  constructor(userId: string) {
    super(`No briefing data yet for ${userId}`);
  }
}

export interface BriefingData {
  name: string;
  role: string;
  weekOf: string;
  focusSkill?: string;
  focusDemandPct?: number;
  focusTrend?: TrendLabel;
  tasks: string[];
  momentumChangePct?: number;
  risingSkills: { skill: string; growthPerYearPct: number }[];
  pod?: { name: string; project?: string };
  readinessPct?: number;
}

// Built-in default so Aisha's briefing works before teammates' fixtures land (mirrors briefing.aisha.json).
const AISHA_DEFAULT: Omit<BriefingData, "weekOf"> = {
  name: "Aisha",
  role: "ML engineer",
  focusSkill: "Docker",
  focusDemandPct: 41,
  focusTrend: "stable",
  tasks: demoBriefingJson.topTasks,
  momentumChangePct: 18,
  risingSkills: [{ skill: "LLM evaluation", growthPerYearPct: 38 }],
  pod: { name: "VisionAid" },
  readinessPct: 38,
};

// ---------- dates ----------

/** The Monday this briefing is for: today if today is Monday, otherwise next Monday (UTC, ISO date). */
export function weekOfFor(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

// ---------- data access (store first, then fixtures; every read is best-effort) ----------

async function readJson<T>(...segments: string[]): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", ...segments.slice(1)), "utf8")) as T;
  } catch {
    return null;
  }
}

const fixture = <T,>(file: string) => readJson<T>("data", "fixtures", file);

async function storeGet<T>(collection: string, id: string): Promise<T | null> {
  try {
    return await getStore().get<T>(collection, id);
  } catch {
    return null;
  }
}

async function storeList<T>(collection: string, userId?: string): Promise<T[]> {
  try {
    const rows = await getStore().list<T>(collection, userId ? { userId } : undefined);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  return (await storeGet<Profile>("profiles", userId)) ?? (await fixture<Profile>(`profile.${userId}.json`));
}

async function loadRoadmap(userId: string, roleId: string): Promise<Roadmap | null> {
  let rows = await storeList<Roadmap>("roadmaps", userId);
  if (!rows.length) rows = (await storeList<Roadmap>("roadmaps")).filter((r) => r?.userId === userId);
  rows = rows.filter((r) => Array.isArray(r?.weeks) && r.weeks.length > 0);
  const forRole = rows.filter((r) => r.roleId === roleId);
  const pool = forRole.length ? forRole : rows;
  if (pool.length) return [...pool].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const f = await fixture<Roadmap>(`roadmap.${userId}.${roleId}.json`);
  return Array.isArray(f?.weeks) && f.weeks.length ? f : null;
}

async function loadBridgeMapSkills(userId: string, roleId: string): Promise<string[]> {
  const maps = (await storeList<BridgeMap>("maps", userId)).filter((m) => Array.isArray(m?.nodes));
  const map = maps.find((m) => m.roleId === roleId) ?? maps[0] ?? (await fixture<BridgeMap>(`bridgemap.${userId}.${roleId}.json`));
  return Array.isArray(map?.nodes) ? map.nodes.map((n) => n.skillId) : [];
}

async function loadMomentumPct(userId: string): Promise<number | undefined> {
  const weeks = await fixture<MomentumWeek[]>(`momentum.${userId}.json`);
  const last = Array.isArray(weeks) ? weeks[weeks.length - 1] : undefined;
  return typeof last?.changePct === "number" && Number.isFinite(last.changePct) ? Math.round(last.changePct) : undefined;
}

async function loadTrends(): Promise<TrendSeries[]> {
  for (const segs of [["data", "cache", "trends.json"], ["data", "fixtures", "trends.json"]]) {
    const series = await readJson<TrendSeries[]>(...segs);
    if (Array.isArray(series) && series.length) return series;
  }
  return [];
}

async function loadPod(userId: string): Promise<Pod | null> {
  const mine = (await storeList<Pod>("pods"))
    .filter((p) => p?.name && p.members?.some((m) => m.userId === userId))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (mine[0]) return mine[0];
  const f = await fixture<Pod>(`pod.${userId}.json`);
  return f?.name ? f : null;
}

async function loadSkillNames(): Promise<Map<string, string>> {
  const skills = await readJson<Skill[]>("data", "skills.json");
  return new Map(Array.isArray(skills) ? skills.filter((s) => s?.id && s.name).map((s) => [s.id, s.name]) : []);
}

/** The roadmap week that contains `weekOf`, else the first week with unfinished tasks, else week 1. */
export function pickWeek(weeks: RoadmapWeek[], weekOf: string): RoadmapWeek | undefined {
  const t = Date.parse(weekOf);
  const byDate = weeks.find((w) => {
    const s = Date.parse(w.startDate);
    return !Number.isNaN(s) && s <= t && t < s + 7 * DAY_MS;
  });
  return byDate ?? weeks.find((w) => w.tasks?.some((x) => !x.done)) ?? weeks[0];
}

/** Collects everything the script talks about. Exported for tests and for n8n debugging. */
export async function gatherBriefingData(userId: string, weekOf: string): Promise<BriefingData> {
  const safe = SAFE_ID.test(userId);
  const isAisha = userId === DEMO_USER;
  const profile = safe ? await loadProfile(userId) : null;
  const roleId = profile?.dna?.targetRoles?.[0] ?? "ml-engineer";
  const names = await loadSkillNames();
  const nameOf = (id: string) => names.get(id) ?? skillLabel(id);

  const roadmap = safe ? await loadRoadmap(userId, roleId) : null;
  const week = roadmap ? pickWeek(roadmap.weeks, weekOf) : undefined;
  if (!week && !isAisha) throw new BriefingUnavailable(userId);

  const open = week?.tasks?.filter((t) => !t.done) ?? [];
  const tasks = (open.length ? open : (week?.tasks ?? [])).slice(0, 3).map((t) => t.title).filter(Boolean);

  const roleSkills = new Set<string>([
    ...(roadmap?.weeks.map((w) => w.focusSkillId) ?? []),
    ...(safe ? await loadBridgeMapSkills(userId, roleId) : []),
  ]);
  const rising = (await loadTrends()).filter(
    (s) => s?.label === "rising" && typeof s.growthPerYear === "number" && s.growthPerYear > 0,
  );
  const relevant = rising.filter((s) => roleSkills.has(s.skillId));
  const risingSkills = (relevant.length ? relevant : rising)
    .sort((a, b) => b.growthPerYear - a.growthPerYear)
    .slice(0, 2)
    .map((s) => ({ skill: nameOf(s.skillId), growthPerYearPct: Math.round(s.growthPerYear * 100) }));

  const pod = safe ? await loadPod(userId) : null;
  const momentumChangePct = safe ? await loadMomentumPct(userId) : undefined;
  const readiness = roadmap?.readinessNow;

  const gathered: BriefingData = {
    name: profile?.name?.split(" ")[0] || (isAisha ? AISHA_DEFAULT.name : skillLabel(userId)),
    role: roleName(roleId),
    weekOf,
    focusSkill: week ? nameOf(week.focusSkillId) : undefined,
    focusDemandPct: typeof week?.receipt?.demandPct === "number" ? Math.round(week.receipt.demandPct) : undefined,
    focusTrend: week?.receipt?.trend,
    tasks,
    momentumChangePct,
    risingSkills,
    pod: pod ? { name: pod.name, project: pod.project?.title } : undefined,
    readinessPct: typeof readiness === "number" ? Math.round(readiness * 100) : undefined,
  };
  if (!isAisha) return gathered;

  // Aisha always gets a full briefing: fill any gap from the built-in default.
  const hasWeek = !!week;
  return {
    ...gathered,
    focusSkill: gathered.focusSkill ?? AISHA_DEFAULT.focusSkill,
    focusDemandPct: hasWeek ? gathered.focusDemandPct : AISHA_DEFAULT.focusDemandPct,
    focusTrend: hasWeek ? gathered.focusTrend : AISHA_DEFAULT.focusTrend,
    tasks: gathered.tasks.length ? gathered.tasks : AISHA_DEFAULT.tasks,
    momentumChangePct: gathered.momentumChangePct ?? AISHA_DEFAULT.momentumChangePct,
    risingSkills: gathered.risingSkills.length ? gathered.risingSkills : AISHA_DEFAULT.risingSkills,
    pod: gathered.pod ?? AISHA_DEFAULT.pod,
    readinessPct: gathered.readinessPct ?? AISHA_DEFAULT.readinessPct,
  };
}

// ---------- script ----------

function focusMove(d: BriefingData): string | undefined {
  if (!d.focusSkill || d.focusDemandPct == null) return undefined;
  const p = d.focusDemandPct;
  switch (d.focusTrend) {
    case "stable":
      return `${d.focusSkill} steady at ${p}% of ads`;
    case "rising":
      return `${d.focusSkill} rising, now in ${p}% of ads`;
    case "declining":
      return `${d.focusSkill} cooling, still in ${p}% of ads`;
    default:
      return `${d.focusSkill} in ${p}% of ads`;
  }
}

/** Short, card-sized market lines, e.g. "LLM evaluation up 38% a year". At most 2. */
export function marketMovesFor(d: BriefingData): string[] {
  const rising = d.risingSkills.map((r) => `${r.skill} up ${r.growthPerYearPct}% a year`);
  const focus = d.risingSkills.some((r) => r.skill === d.focusSkill) ? undefined : focusMove(d);
  return [rising[0], focus, rising[1]].filter((m): m is string => !!m).slice(0, 2);
}

const SPOKEN_VERBS = new Set([
  "add", "answer", "build", "complete", "deploy", "do", "finish", "fix", "join", "learn", "make", "open", "pair",
  "practise", "practice", "push", "read", "review", "set", "ship", "solve", "start", "take", "try", "watch", "work", "write",
]);

function spokenTask(title: string): string {
  let t = title.trim().replace(/[.!]+$/, "").replace(/:\s+/g, ", ");
  const first = t.split(/\s+/)[0] ?? "";
  if (SPOKEN_VERBS.has(first.toLowerCase()) && /^[A-Z][a-z]+$/.test(first)) t = first.toLowerCase() + t.slice(first.length);
  return t;
}

function focusSentence(d: BriefingData): string | undefined {
  if (!d.focusSkill || d.focusDemandPct == null) return undefined;
  const ads = `${d.focusDemandPct}% of ${d.role} ads`;
  switch (d.focusTrend) {
    case "stable":
      return `${d.focusSkill} demand held steady at ${ads}.`;
    case "rising":
      return `${d.focusSkill} demand is climbing, and it's now in ${ads}.`;
    case "declining":
      return `${d.focusSkill} demand eased a little, but it's still in ${ads}.`;
    default:
      return `${d.focusSkill} shows up in ${ads}.`;
  }
}

/** Deterministic ~140-word script used when the LLM is unavailable. Same tone as briefing.aisha.json. */
export function templateScript(d: BriefingData): string {
  const s: string[] = [`Morning ${d.name}! Here's your Keystone briefing for the week of ${longDate(d.weekOf)}.`];

  const market: string[] = [];
  const focus = focusSentence(d);
  if (focus) market.push(focus);
  const [r1, r2] = d.risingSkills;
  if (r1) {
    const lead = `${r1.skill} is the fastest riser on your map, up ${r1.growthPerYearPct}% a year`;
    market.push(r2 ? `${lead}, with ${r2.skill} close behind at ${r2.growthPerYearPct}%.` : `${lead}.`);
  }
  if (market.length) s.push("First, the market.", ...market);
  if (d.focusSkill) s.push(`That's why ${d.focusSkill} is your focus this week.`);

  if (d.pod) {
    s.push(
      d.pod.project
        ? `Now your pod. ${d.pod.name} is building ${d.pod.project}, and a quick check-in with your teammates keeps everyone moving.`
        : `Now your pod. A quick check-in with ${d.pod.name} keeps everyone moving.`,
    );
  }

  const m = d.momentumChangePct;
  if (m != null) {
    if (m > 0) s.push(`Your momentum is up ${m}% on your usual week. Nice.`);
    else if (m < 0) s.push(`Your momentum dipped ${Math.abs(m)}% last week, and that's okay. One small win this week gets you rolling again.`);
    else s.push("Your momentum held steady last week. Steady is good.");
  }

  const t = d.tasks.map(spokenTask);
  if (t.length === 1) s.push(`This week, one thing: ${t[0]}.`);
  else if (t.length === 2) s.push(`This week, two things. First, ${t[0]}. And then, ${t[1]}.`);
  else if (t.length >= 3) s.push(`This week, three things. First, ${t[0]}. Next, ${t[1]}. And finally, ${t[2]}.`);

  s.push(
    d.readinessPct != null
      ? `You're ${d.readinessPct}% of the way to ${d.role}, and this week moves you closer. Have a great week!`
      : `Every step this week moves you closer to ${d.role}. Have a great week!`,
  );
  return s.join(" ");
}

async function writeScript(data: BriefingData): Promise<string> {
  try {
    const out = (await llmText({ agent: "voice", system: BRIEFING_SYSTEM, user: JSON.stringify(data) })).trim();
    if (out && out.length <= MAX_SCRIPT_CHARS) return out;
  } catch {
    // No key, quota or provider error: fall through to the deterministic template.
  }
  return templateScript(data);
}

// ---------- demo audio ----------

export function demoAudioPath(): string {
  return path.join(process.cwd(), "public", "demo", "briefing-aisha.mp3");
}

export async function demoAudioExists(): Promise<boolean> {
  try {
    return (await fs.stat(demoAudioPath())).isFile();
  } catch {
    return false;
  }
}

/** The committed demo MP3, or null when it has not been generated yet. */
export async function readDemoAudio(): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await fs.readFile(demoAudioPath()));
  } catch {
    return null;
  }
}

// ---------- build ----------

const briefingKey = (userId: string, weekOf: string) => `${userId}_${weekOf}`;

export async function buildBriefing(userId: string, now: Date = new Date()): Promise<Briefing> {
  const hasDemoAudio = userId === DEMO_USER && (await demoAudioExists());
  let briefing: Briefing;
  if (isDemo() && userId === DEMO_USER) {
    briefing = { ...BriefingZ.parse(demoBriefingJson), audioUrl: hasDemoAudio ? DEMO_AUDIO_URL : undefined };
  } else {
    const weekOf = weekOfFor(now);
    const data = await gatherBriefingData(userId, weekOf);
    briefing = {
      userId,
      weekOf,
      script: await writeScript(data),
      audioUrl: hasDemoAudio ? DEMO_AUDIO_URL : undefined,
      topTasks: data.tasks,
      marketMoves: marketMovesFor(data),
    };
  }
  const id = briefingKey(userId, briefing.weekOf);
  try {
    await getStore().upsert("briefings", id, { id, ...briefing }, userId);
  } catch {
    // Storing is a nice-to-have; the caller still gets its briefing.
  }
  return briefing;
}

/** This week's stored briefing if there is one, else a freshly built one (always rebuilt in DEMO_MODE or on refresh). */
export async function getBriefing(userId: string, opts: { refresh?: boolean; now?: Date } = {}): Promise<Briefing> {
  if (!opts.refresh && !isDemo()) {
    const cached = BriefingZ.safeParse(await storeGet<Briefing>("briefings", briefingKey(userId, weekOfFor(opts.now))));
    if (cached.success) return cached.data;
  }
  return buildBriefing(userId, opts.now);
}

// ---------- access control for GET /api/briefing/[userId] ----------

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    const v = part.slice(i + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return undefined;
}

/** True unless the browser tells us the request came from another site. Requests without Origin (same-origin GETs, curl) pass. */
export function isSameOrigin(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  // Behind a proxy req.url may carry the internal host, so the forwarded/Host headers count too.
  const hosts = [new URL(req.url).host, req.headers.get("x-forwarded-host"), req.headers.get("host")];
  return hosts.some((h) => !!h && h.split(",")[0].trim() === host);
}

/** A same-origin request whose `ks_uid` cookie is this user, or (before P3's session cookie is set) the demo persona from our own pages. */
export function isOwnUserRequest(req: Request, userId: string): boolean {
  const uid = readCookie(req, "ks_uid");
  if (uid) return uid === userId && isSameOrigin(req);
  return userId === "aisha" && req.headers.get("sec-fetch-site") === "same-origin";
}

// ---------- ElevenLabs spend guard for POST /api/tts ----------
// Per server process: identical requests reuse audio already generated, and new generations are capped per window.
// Over the cap /api/tts falls back to the demo MP3 (or 501), just as when ElevenLabs is down.

const TTS_CACHE_MAX = 8;
const TTS_WINDOW_MS = 10 * 60_000;
export const TTS_MAX_CALLS_PER_WINDOW = 30;
const ttsCache = new Map<string, ArrayBuffer>();
let ttsWindow = { start: 0, calls: 0 };

const ttsCacheKey = (text: string, voiceId?: string) => `${voiceId ?? ""}\u0000${text}`;

/** A copy of audio already generated for this text and voice, if any. */
export function cachedTtsAudio(text: string, voiceId?: string): ArrayBuffer | undefined {
  const key = ttsCacheKey(text, voiceId);
  const hit = ttsCache.get(key);
  if (!hit) return undefined;
  ttsCache.delete(key); // keep most recently used last
  ttsCache.set(key, hit);
  return hit.slice(0);
}

export function rememberTtsAudio(text: string, voiceId: string | undefined, audio: ArrayBuffer): void {
  ttsCache.set(ttsCacheKey(text, voiceId), audio.slice(0));
  while (ttsCache.size > TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value as string);
}

/** Counts one ElevenLabs generation; false once this window's budget is spent. */
export function takeTtsBudget(now: number = Date.now()): boolean {
  if (now - ttsWindow.start >= TTS_WINDOW_MS) ttsWindow = { start: now, calls: 0 };
  if (ttsWindow.calls >= TTS_MAX_CALLS_PER_WINDOW) return false;
  ttsWindow.calls += 1;
  return true;
}

/** Test helper: forget cached audio and the call count. */
export function resetTtsGuard(): void {
  ttsCache.clear();
  ttsWindow = { start: 0, calls: 0 };
}
