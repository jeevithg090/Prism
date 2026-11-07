import "server-only";
import sampleEvents from "@/data/fixtures/agent-events.sample.json";
import fixtureProgramme from "@/data/fixtures/programme.uom-bsc-cs.json";
import fixtureTrends from "@/data/fixtures/trends.json";
import { getRoleDemand } from "@/lib/agents/market";
import { syncEvidence } from "@/lib/agents/evidence";
import { generateRoadmap } from "@/lib/agents/roadmap";
import { extractProgramme } from "@/lib/agents/syllabus";
import { getTrends } from "@/lib/agents/trends";
import { buildBridgeMap } from "@/lib/graph/build";
import { getStore } from "@/lib/store";
import { emit, newRunId } from "@/lib/agents/events";
import type { AgentEvent, EvidenceItem, Profile, Programme, RoleDemand, TrendSeries } from "@/lib/types";

const DELAYS = [200, 350, 250, 300, 220, 400, 260, 330];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (value: number) => `${Math.round(value * 100)}%`;

export function replayDemoRun(): { runId: string } {
  const runId = newRunId();
  void (async () => {
    for (let i = 0; i < (sampleEvents as AgentEvent[]).length; i++) {
      await sleep(DELAYS[i % DELAYS.length]);
      const { ts: _ts, runId: _old, ...event } = (sampleEvents as AgentEvent[])[i];
      emit({ ...event, runId });
    }
  })();
  return { runId };
}

async function safe<T>(runId: string, agent: AgentEvent["agent"], fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); }
  catch {
    emit({ runId, agent, status: "error", message: "failed: using cached data" });
    return fallback;
  }
}

export async function runOnboarding(userId: string): Promise<{ runId: string }> {
  if (process.env.DEMO_MODE === "true" || (userId === "aisha" && process.env.DEMO_REPLAY === "true")) return replayDemoRun();
  const runId = newRunId();
  void (async () => {
    try {
      const store = getStore();
      const profile = await store.get<Profile>("profiles", userId);
      if (!profile) throw new Error("profile_missing");
      emit({ runId, agent: "orchestrator", status: "started", message: `Building ${profile.name}'s bridge` });
      const roleId = profile.dna.targetRoles[0];
      const [programme, roleDemand, evidence, trends] = await Promise.all([
        safe(runId, "syllabus", () => extractProgramme({ programmeId: profile.programmeId, runId }), fixtureProgramme as Programme),
        safe(runId, "market", () => getRoleDemand(roleId, { runId }), await import(`@/data/fixtures/market.${roleId}.json`).then((m) => m.default as RoleDemand)),
        safe(runId, "evidence", () => syncEvidence({ userId, githubLogin: profile.githubLogin, leetcodeUser: profile.leetcodeUser, runId }), await store.list<EvidenceItem>("evidence", { userId })),
        safe(runId, "trends", () => getTrends(), fixtureTrends as TrendSeries[]),
      ]);
      const map = buildBridgeMap({ profile, programme, roleDemand, evidence, trends });
      await store.upsert("maps", `${userId}:${roleId}`, map as typeof map & { id?: string }, userId);
      await generateRoadmap({ profile, map, programme, roleDemand, trends, runId });
      emit({ runId, agent: "orchestrator", status: "done", message: `Bridge ready: ${pct(map.readinessNow)} → ${pct(map.readinessProjected)}`, data: { readinessNow: map.readinessNow, readinessProjected: map.readinessProjected } });
    } catch {
      emit({ runId, agent: "orchestrator", status: "error", message: "Something went wrong. Showing demo data." });
    }
  })();
  return { runId };
}
