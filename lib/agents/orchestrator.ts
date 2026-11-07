import "server-only";
import fs from "node:fs";
import path from "node:path";
import { emit, newRunId } from "@/lib/agents/events";
import { loadGraph } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import { pct } from "@/lib/utils";
import type { AgentEvent, AgentName, BridgeMap, EvidenceItem, Profile, Programme, RoleDemand, Roadmap, TrendSeries } from "@/lib/types";

// Orchestrator (P2 Task 7): runs the onboarding pipeline for one student and narrates it on the agent
// event bus, so the Activity panel can show every agent working.
//   demo: replays data/fixtures/agent-events.sample.json with realistic delays under a fresh runId.
//   live: syllabus + market + evidence + trends in parallel → Bridge Map → Roadmap. Each agent module is
//         loaded only if it exists (teammates build them in parallel), has its own timeout, and falls
//         back to a fixture with a "used cached data" event. One agent failing never stops the run.

declare global {
  interface ImportMeta {
    glob(patterns: string | string[]): Record<string, () => Promise<unknown>>;
  }
}

/** Optional agent modules, resolved at build time (Turbopack and Vite both support import.meta.glob). */
const AGENT_MODULES = import.meta.glob([
  "./syllabus.ts", "./market.ts", "./trends.ts", "./evidence.ts", "./roadmap.ts",
  "./syllabus/index.ts", "./market/index.ts", "./trends/index.ts", "./evidence/index.ts", "./roadmap/index.ts",
]);

type Mod = Record<string, unknown>;
export type AgentLoader = () => Promise<Mod | null>;
export type LiveAgent = "syllabus" | "market" | "trends" | "evidence" | "roadmap";

function moduleLoader(name: LiveAgent): AgentLoader {
  return async () => {
    const load = AGENT_MODULES[`./${name}.ts`] ?? AGENT_MODULES[`./${name}/index.ts`];
    return load ? ((await load()) as Mod) : null;
  };
}

const DEFAULT_TIMEOUTS: Record<LiveAgent | "skillmap", number> = {
  syllabus: 60_000, market: 30_000, evidence: 30_000, trends: 15_000, skillmap: 20_000, roadmap: 45_000,
};

/** Deterministic gaps between replayed events (150–600ms), indexed by event position. */
export const REPLAY_DELAYS_MS = [150, 250, 300, 200, 450, 400, 450, 550, 350, 300, 400, 500, 300, 450, 600, 300, 450, 550, 300, 500, 300, 350];

export class ProfileNotFoundError extends Error {
  constructor(public userId: string) { super(`No profile for ${userId}`); }
}

export interface OnboardOptions {
  /** Force the demo replay (the Activity panel's "Replay demo run"). */
  demo?: boolean;
  /** The programme page the student pasted in the wizard (Profile has no URL field). */
  programmeUrl?: string;
  /** Test seams. */
  loaders?: Partial<Record<LiveAgent, AgentLoader>>;
  timeouts?: Partial<Record<LiveAgent | "skillmap", number>>;
  sleep?: (ms: number) => Promise<void>;
  fixtures?: (file: string) => unknown;
  /** How the background work is started; the route passes Next's `after`. */
  schedule?: (work: () => Promise<void>) => void;
}

export function isDemoRun(userId: string, opts: Pick<OnboardOptions, "demo"> = {}): boolean {
  return !!opts.demo || process.env.DEMO_MODE === "true" || (userId === "aisha" && process.env.DEMO_REPLAY === "true");
}

/** Starts the run in the background and returns its id straight away. */
// Serverless-safe runs: the run id carries what any instance needs to execute the run ("ob-<d|l>-<rand>-<userId>"),
// so GET /api/agents/stream can start it in its own process when the POST ran elsewhere (Vercel instances
// don't share memory). A per-process set stops the same run starting twice in one instance.
const g = globalThis as unknown as { __ksStartedRuns?: Set<string> };
const startedRuns: Set<string> = (g.__ksStartedRuns ??= new Set());
const ONBOARD_RUN = /^ob-([dl])-([a-z0-9]{2,12})-([A-Za-z0-9_-]{1,40})$/;

export function parseOnboardRunId(runId: string): { mode: "demo" | "live"; userId: string } | null {
  const m = ONBOARD_RUN.exec(runId);
  return m ? { mode: m[1] === "d" ? "demo" : "live", userId: m[3] } : null;
}

export function hasStartedRun(runId: string): boolean {
  return startedRuns.has(runId);
}

/** Executes an onboarding run in this process (idempotent per process). */
export async function executeOnboardingRun(runId: string, opts: OnboardOptions = {}): Promise<void> {
  const parsed = parseOnboardRunId(runId);
  if (!parsed || startedRuns.has(runId)) return;
  startedRuns.add(runId);
  const profile = await getStore().get<Profile>("profiles", parsed.userId);
  if (!profile) {
    emit({ runId, agent: "orchestrator", status: "error", message: `We couldn't find a profile for ${parsed.userId}.` });
    return;
  }
  try {
    if (parsed.mode === "demo") await replayDemo(runId, profile, opts);
    else await runLive(runId, profile, opts);
  } catch {
    emit({ runId, agent: "orchestrator", status: "error", message: "Something went wrong on our side. Showing demo data." });
  }
}

export async function runOnboarding(userId: string, opts: OnboardOptions = {}): Promise<{ runId: string; mode: "demo" | "live" }> {
  const profile = await getStore().get<Profile>("profiles", userId);
  if (!profile) throw new ProfileNotFoundError(userId);
  const mode = isDemoRun(userId, opts) ? "demo" : "live";
  const safeUser = /^[A-Za-z0-9_-]{1,40}$/.test(userId) ? userId : "aisha";
  const runId = `ob-${mode === "demo" ? "d" : "l"}-${newRunId().replace(/^run_/, "").replace(/[^a-z0-9]/g, "").slice(0, 8) || "x0"}-${safeUser}`;
  // On Vercel the stream request (GET /api/agents/stream) executes the run in the instance that streams it.
  if (process.env.VERCEL) return { runId, mode };
  const schedule = opts.schedule ?? ((w) => { void w(); });
  startedRuns.add(runId);
  schedule(async () => {
    startedRuns.delete(runId);
    await executeOnboardingRun(runId, opts);
  });
  return { runId, mode };
}

// ---------------------------------------------------------------- demo replay

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const firstName = (p: Profile) => p.name.trim().split(/\s+/)[0] || "your";

export async function replayDemo(runId: string, profile: Profile, opts: Pick<OnboardOptions, "sleep" | "fixtures"> = {}): Promise<void> {
  const sleep = opts.sleep ?? sleepMs;
  const read = (opts.fixtures ?? readFixture) as <T>(file: string) => T | null;
  const sample = read<AgentEvent[]>("agent-events.sample.json") ?? FALLBACK_SAMPLE;
  const name = firstName(profile);
  for (let i = 0; i < sample.length; i++) {
    await sleep(REPLAY_DELAYS_MS[i % REPLAY_DELAYS_MS.length]);
    const e = sample[i];
    const last = i === sample.length - 1;
    if (last) await seedDemoResults(profile);
    emit({
      runId,
      agent: e.agent,
      status: e.status,
      message: profile.id === "aisha" ? e.message : e.message.replace(/\bAisha\b/g, name),
      // The first event tells the panel this run is a replay, so it can label it "Demo data".
      ...(i === 0 ? { data: { ...e.data, demo: true } } : e.data ? { data: e.data } : {}),
    });
  }
}

/** A replay for someone other than Aisha leaves her demo map + roadmap under their id, so /map has data. */
async function seedDemoResults(profile: Profile): Promise<void> {
  if (profile.id === "aisha") return;
  try {
    const store = getStore();
    const roleId = profile.dna.targetRoles[0] ?? "ml-engineer";
    const mapKey = `${profile.id}:${roleId}`;
    if (!(await store.get("maps", mapKey))) {
      const map = (await loadGraph("aisha", roleId)) ?? (await loadGraph("aisha", "ml-engineer"));
      if (map) await store.upsert("maps", mapKey, asDoc({ ...map, userId: profile.id, roleId }), profile.id);
    }
    if (!(await store.get("roadmaps", profile.id))) {
      const roadmap = readFixture<Roadmap>(`roadmap.aisha.${roleId}.json`) ?? readFixture<Roadmap>("roadmap.aisha.ml-engineer.json");
      if (roadmap) await store.upsert("roadmaps", profile.id, asDoc({ ...roadmap, userId: profile.id, roleId }), profile.id);
    }
  } catch { /* demo seeding is best effort */ }
}

const FALLBACK_SAMPLE: AgentEvent[] = [
  { runId: "run_demo", agent: "orchestrator", status: "started", message: "Building Aisha's bridge", ts: "2026-11-07T14:02:00.000Z" },
  { runId: "run_demo", agent: "orchestrator", status: "done", message: "Bridge ready · 38% → 84%", ts: "2026-11-07T14:02:01.000Z", data: { readinessNow: 0.38, readinessProjected: 0.84 } },
];

// ---------------------------------------------------------------- live pipeline

class TimeoutError extends Error {}
const MISSING = Symbol("missing");

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new TimeoutError(`timed out after ${ms}ms`)), ms); })])
    .finally(() => clearTimeout(t));
}

/**
 * Runs one agent with a timeout. A missing module or a failure falls back to `fallback()` and says so
 * on the bus with the fallback's numbers, so the panel never goes quiet.
 */
async function step<T>(o: {
  runId: string; agent: AgentName; timeoutMs: number;
  run: () => Promise<T | typeof MISSING>;
  fallback: () => T | null;
  summary: (v: T) => string;
}): Promise<T | null> {
  const { runId, agent } = o;
  const fallBack = (status: "done" | "error", why?: string) => {
    const v = o.fallback();
    const lead = why ? `${why}, so used` : "Used";
    emit({ runId, agent, status, message: v ? `${lead} cached data · ${o.summary(v)}` : `${why ?? "Not available yet"}; no cached data, skipped`, data: { cached: true } });
    return v;
  };
  try {
    const v = await withTimeout(o.run(), o.timeoutMs);
    if (v === MISSING) {
      emit({ runId, agent, status: "started", message: "Loading cached results" });
      return fallBack("done");
    }
    return v;
  } catch (err) {
    return fallBack("error", err instanceof TimeoutError ? `No answer within ${Math.round(o.timeoutMs / 1000)}s` : "Couldn't finish");
  }
}

function fn<A extends unknown[], R>(mod: Mod | null, name: string): ((...a: A) => Promise<R>) | null {
  const f = mod?.[name];
  return typeof f === "function" ? (f as (...a: A) => Promise<R>) : null;
}

export async function runLive(runId: string, profile: Profile, opts: OnboardOptions = {}): Promise<void> {
  const loaders: Record<LiveAgent, AgentLoader> = {
    syllabus: moduleLoader("syllabus"), market: moduleLoader("market"), trends: moduleLoader("trends"),
    evidence: moduleLoader("evidence"), roadmap: moduleLoader("roadmap"), ...opts.loaders,
  };
  const timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
  const read = (opts.fixtures ?? readFixture) as <T>(file: string) => T | null;
  const userId = profile.id;
  const roleId = profile.dna.targetRoles[0] ?? "ml-engineer";
  const store = getStore();

  emit({ runId, agent: "orchestrator", status: "started", message: `Building ${firstName(profile)}'s bridge: syllabus, job ads, GitHub and trends in parallel`, data: { userId, roleId } });

  const [programme, roleDemand, evidence, trends] = await Promise.all([
    step<Programme>({
      runId, agent: "syllabus", timeoutMs: timeouts.syllabus,
      run: async () => {
        const extract = fn<[{ programmeId: string; url?: string; runId?: string }], Programme>(await loaders.syllabus(), "extractProgramme");
        return extract ? extract({ programmeId: profile.programmeId, url: opts.programmeUrl, runId }) : MISSING;
      },
      fallback: () => read<Programme>(`programme.${profile.programmeId}.json`),
      summary: (p) => `${p.modules.length} course units`,
    }),
    step<RoleDemand>({
      runId, agent: "market", timeoutMs: timeouts.market,
      run: async () => {
        const get = fn<[string, { runId?: string }], RoleDemand>(await loaders.market(), "getRoleDemand");
        return get ? get(roleId, { runId }) : MISSING;
      },
      fallback: () => read<RoleDemand>(`market.${roleId}.json`),
      summary: (d) => `${d.adsAnalysed} ${d.roleName} ads analysed`,
    }),
    step<EvidenceItem[]>({
      runId, agent: "evidence", timeoutMs: timeouts.evidence,
      run: async () => {
        const sync = fn<[{ userId: string; githubLogin?: string; leetcodeUser?: string; runId?: string }], EvidenceItem[]>(await loaders.evidence(), "syncEvidence");
        return sync ? sync({ userId, githubLogin: profile.githubLogin, leetcodeUser: profile.leetcodeUser, runId }) : MISSING;
      },
      fallback: () => read<EvidenceItem[]>(`evidence.${userId}.json`),
      summary: (items) => `${new Set(items.map((i) => i.skillId)).size} skills proven from ${items.length} pieces of evidence`,
    }),
    step<TrendSeries[]>({
      runId, agent: "trends", timeoutMs: timeouts.trends,
      run: async () => {
        const get = fn<[], TrendSeries[]>(await loaders.trends(), "getTrends");
        return get ? get() : MISSING;
      },
      fallback: () => read<TrendSeries[]>("trends.json"),
      summary: (t) => `${t.length} skills forecast, ${t.filter((s) => s.label === "rising").length} rising`,
    }),
  ]);

  emit({ runId, agent: "skillmap", status: "started", message: `Mapping ${programme ? `${programme.modules.length} course units` : "your degree"} and your code onto ${roleDemand ? roleDemand.roleName : roleId} skills` });
  let map: BridgeMap | null = null;
  try {
    map = await withTimeout(loadGraph(userId, roleId), timeouts.skillmap);
  } catch { /* reported below */ }
  if (!map) {
    emit({ runId, agent: "skillmap", status: "error", message: "Couldn't build your Bridge Map yet" });
    emit({ runId, agent: "orchestrator", status: "error", message: "Your Bridge Map isn't ready. Showing demo data." });
    return;
  }
  const count = (s: string) => map!.nodes.filter((n) => n.status === s).length;
  emit({
    runId, agent: "skillmap", status: "done",
    message: `${map.nodes.length} skills mapped: ${count("proven")} proven, ${count("degree-done") + count("degree-upcoming")} covered by your degree, ${count("gap")} gaps`,
    data: { nodes: map.nodes.length, readinessNow: map.readinessNow },
  });
  try { await store.upsert("maps", `${userId}:${roleId}`, asDoc(map), userId); } catch { /* the map still renders from loadGraph */ }

  const roadmap = await step<Roadmap>({
    runId, agent: "roadmap", timeoutMs: timeouts.roadmap,
    run: async () => {
      const generate = fn<[{ profile: Profile; map: BridgeMap; programme: Programme; roleDemand: RoleDemand; trends: TrendSeries[]; runId?: string }], Roadmap>(await loaders.roadmap(), "generateRoadmap");
      if (!generate || !programme || !roleDemand) return MISSING;
      return generate({ profile, map: map!, programme, roleDemand, trends: trends ?? [], runId });
    },
    fallback: () => read<Roadmap>(`roadmap.${userId}.${roleId}.json`),
    summary: (r) => `${r.weeks.length} weeks planned, ${r.skipped.length} skills skipped because your degree covers them`,
  });
  if (roadmap) {
    try { await store.upsert("roadmaps", userId, asDoc(roadmap), userId); } catch { /* best effort */ }
  }

  const now = map.readinessNow;
  const projected = roadmap?.readinessProjected ?? map.readinessProjected;
  emit({
    runId, agent: "orchestrator", status: "done",
    message: `Bridge ready · ${pct(now)} → ${pct(projected)}`,
    data: { readinessNow: now, readinessProjected: projected, roleId, evidence: evidence?.length ?? 0 },
  });
}

// ---------------------------------------------------------------- fixtures

/** The store wants `{ id? }` docs; maps and roadmaps are keyed by the caller instead. */
const asDoc = <T extends object>(d: T) => d as T & { id?: string };

function readFixture<T>(file: string): T | null {
  if (!/^[a-z0-9._-]+\.json$/i.test(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "fixtures", file), "utf8")) as T;
  } catch {
    return null;
  }
}
