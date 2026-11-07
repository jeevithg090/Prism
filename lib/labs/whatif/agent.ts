// What-if Simulator agent: loads the student's real Keystone state (Bridge Map, roadmap, trend forecasts, profile),
// simulates futures inside the agent harness, and proposes a roadmap the student must approve before it replaces
// theirs. Runs as the Roadmap Agent (it plans; it never decides). Every run lands in the agent_runs ledger.
import "server-only";
import { randomBytes } from "node:crypto";
import { noOutboundMessaging } from "@/lib/agents/guardrails";
import { runAgent, type Guardrail } from "@/lib/agents/harness";
import { buildRoadmap, loadRoadmap } from "@/lib/agents/roadmap";
import { loadBridgeMap } from "@/lib/agents/tools/loaders";
import { loadGraph } from "@/lib/graph/build";
import { getProfile, podFor, programmeFixture, trendsFixture } from "@/lib/graph/data";
import { roleName } from "@/lib/graph/roles";
import { getStore } from "@/lib/store";
import type { BridgeMap, Profile, Roadmap, SkillId } from "@/lib/types";
import {
  ASSUMPTIONS, buildProposedRoadmap, dateLabel, diffRoadmaps, effortFor, movableWeeks, planQueue, simulate, weeklyHours,
  type PlanResult, type PlanSpec, type RoadmapDiff, type SimContext, type SimulationResult,
} from "./engine";
import { SimulationResultZ } from "./schemas";

export const PROPOSALS = "whatif_proposals";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const isDemo = () => process.env.DEMO_MODE === "true";

export class WhatIfNotFound extends Error {}
export class WhatIfConflict extends Error {}

export interface WhatIfWorld {
  ctx: SimContext;
  profile: Profile;
  map: BridgeMap;
  roadmap: Roadmap | null;
}

/** The clock the simulator uses: pinned in DEMO_MODE so the demo shows the same numbers every time. */
export const simNow = () => (isDemo() ? new Date(ASSUMPTIONS.demoNow) : new Date());

/**
 * Reads the student's map (loadGraph, else the tool layer's store → fixture chain in loadBridgeMap), roadmap
 * (store "roadmaps"), trends and programme. Null without a map.
 */
export async function loadWhatIfWorld(userId: string): Promise<WhatIfWorld | null> {
  const profile = await getProfile(userId);
  if (!profile?.dna) return null;
  const roleId = profile.dna.targetRoles?.[0] ?? "ml-engineer";
  const built = await loadGraph(userId, roleId).catch(() => null);
  const map = built?.nodes?.length ? built : await loadBridgeMap(userId, roleId).catch(() => null);
  if (!map?.nodes?.length) return null;
  const roadmap = await loadRoadmap(userId, roleId).catch(() => null);
  const trends = trendsFixture() ?? [];
  const programme = programmeFixture(profile.programmeId);
  const now = simNow();
  const queue = planQueue({ nodes: map.nodes, edges: map.edges, startedAt: profile.startedAt, targetDate: profile.dna.targetDate, now, programme, trends, roadmap });
  return {
    profile, map, roadmap,
    ctx: {
      userId, roleId, now, startedAt: profile.startedAt, targetDate: profile.dna.targetDate,
      readinessNow: map.readinessNow, nodes: map.nodes, edges: map.edges, queue, trends, programme,
    },
  };
}

const nameOf = (w: WhatIfWorld, id: SkillId | null | undefined) => (id ? w.map.nodes.find((n) => n.skillId === id)?.name ?? id : "");

/** Study hours the default "part-time job" plan gives up: 4 a week, never more than half of your hours. */
export const defaultJobHours = (hours: number) => Math.max(1, Math.min(4, Math.floor(hours / 2)));

/**
 * Plan A = the Roadmap Agent's order at your hours. Plan B = the same roadmap with a part-time job taking some of
 * those hours: the most common trade-off students weigh, and one that visibly branches the futures from the first
 * screen (switching the first skill is one select away on either card).
 */
export function defaultPlans(w: WhatIfWorld): [PlanSpec, PlanSpec] {
  const hours = Math.max(1, Math.min(40, Math.round(w.profile.dna.hoursPerWeek || 8)));
  const [first] = w.ctx.queue;
  const a: PlanSpec = { id: "a", label: first ? `${nameOf(w, first)} first` : "Your roadmap", hoursPerWeek: hours, firstSkillId: first ?? null, jobHoursLost: 0, placement: false };
  return [a, { ...a, id: "b", label: "With a part-time job", jobHoursLost: defaultJobHours(hours) }];
}

export interface WhatIfContextView {
  userId: string;
  name: string;
  roleId: string;
  role: string;
  targetDate: string;
  targetLabel: string;
  timelineLabel: string;
  readinessNow: number;
  readinessProjected: number;
  hoursPerWeek: number;
  roadmapVersion: number | null;
  /** Your roadmap as it stands: the focus of each week still ahead, and the study hours of a normal week. */
  roadmapNow: { order: SkillId[]; weeklyHours: number } | null;
  queue: { skillId: SkillId; name: string; demandPct: number; trend?: string; growthPerYear?: number; effortHours: number; prereqs: { skillId: SkillId; name: string; covered: boolean }[] }[];
  defaults: [PlanSpec, PlanSpec];
  assumptions: { id: string; label: string; text: string; source: string }[];
  runs: number;
  demo: boolean;
}

export function contextView(w: WhatIfWorld): WhatIfContextView {
  const byId = new Map(w.map.nodes.map((n) => [n.skillId, n]));
  const growth = new Map(w.ctx.trends.map((t) => [t.skillId, t.growthPerYear]));
  return {
    userId: w.ctx.userId,
    name: w.profile.name,
    roleId: w.ctx.roleId,
    role: roleName(w.ctx.roleId) || w.ctx.roleId,
    targetDate: w.ctx.targetDate,
    targetLabel: dateLabel(w.ctx.targetDate),
    timelineLabel: w.profile.dna.timelineLabel,
    readinessNow: w.map.readinessNow,
    readinessProjected: w.map.readinessProjected,
    hoursPerWeek: w.profile.dna.hoursPerWeek,
    roadmapVersion: w.roadmap?.version ?? null,
    roadmapNow: w.roadmap?.weeks?.length ? { order: movableWeeks(w.roadmap, w.ctx.now).map((x) => x.focusSkillId), weeklyHours: weeklyHours(w.roadmap) } : null,
    queue: w.ctx.queue.map((id) => {
      const n = byId.get(id);
      const pre = w.map.edges.filter((e) => e.kind === "prereq" && e.to === id).map((e) => e.from);
      return {
        skillId: id, name: n?.name ?? id, demandPct: Math.round((n?.demand ?? 0) * 100),
        ...(n?.trend ? { trend: n.trend } : {}),
        ...(growth.has(id) ? { growthPerYear: growth.get(id) } : {}),
        effortHours: effortFor(id),
        prereqs: pre.map((p) => ({ skillId: p, name: byId.get(p)?.name ?? p, covered: ["proven", "degree-done"].includes(byId.get(p)?.status ?? "") })),
      };
    }),
    defaults: defaultPlans(w),
    assumptions: ASSUMPTIONS.notes,
    runs: ASSUMPTIONS.runs,
    demo: isDemo(),
  };
}

// ---------- guardrail: honest bands ----------

/** Fails closed (→ the deterministic fallback) if any band is out of order, out of 0..1, or dated past the target. */
export function honestBands(): Guardrail<SimulationResult> {
  return {
    name: "honestBands",
    apply(out) {
      const target = out.targetDate;
      for (const p of out.plans) {
        const bad = p.series.find((s) => !(s.p10 <= s.p50 && s.p50 <= s.p90 && s.p10 >= 0 && s.p90 <= 1));
        if (bad) return { output: out, action: "blocked", detail: `${p.label}: band out of order in week ${bad.week}` };
        const late = p.milestones.find((m) => m.date && m.date.slice(0, 10) > addWeek(target));
        if (late) return { output: out, action: "blocked", detail: `${p.label}: ${late.name} dated after the target` };
      }
      return { output: out, action: "pass", detail: `${out.plans.length} plans × ${out.runs} futures, every band ordered` };
    },
  };
}
const addWeek = (iso: string) => new Date(new Date(iso).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

// ---------- simulate ----------

function planLine(p: PlanResult, target: string): string {
  const finish = p.allDoneDate ? `all ${p.milestones.length} proofs by ${dateLabel(p.allDoneDate)}` : `${p.milestones.filter((m) => m.date).length} of ${p.milestones.length} proofs`;
  return `${p.label}: ${pct(p.final.p50)} by ${target} (80% band ${pct(p.final.p10)} to ${pct(p.final.p90)}), ${finish}`;
}

export async function simulateWhatIf(i: { world: WhatIfWorld; plans: PlanSpec[]; runId?: string; quiet?: boolean }): Promise<SimulationResult & { runId?: string }> {
  const { world, plans } = i;
  const target = dateLabel(world.ctx.targetDate);
  const { output } = await runAgent<SimulationResult>({
    agent: "roadmap",
    runId: i.runId,
    quiet: i.quiet,
    purpose: `What-if Simulator: trying ${plans.length === 2 ? "two futures" : "a future"} to ${target} before you spend the hours`,
    input: { userId: world.ctx.userId, plans },
    startData: { plans: plans.length, runs: ASSUMPTIONS.runs, skills: world.ctx.queue.length },
    outputSchema: SimulationResultZ as unknown as import("zod").ZodType<SimulationResult>,
    guardrails: [honestBands()],
    timeoutMs: 10_000,
    run: async (ctx) => {
      await ctx.step("read", () => world, (w) => ({
        message: `read your Bridge Map (${w.map.nodes.length} skills, ${w.map.edges.length} prerequisite links, readiness ${pct(w.map.readinessNow)}), your roadmap (${w.ctx.queue.length} focus skills) and ${w.ctx.trends.length} demand forecasts`,
        data: { skills: w.map.nodes.length, edges: w.map.edges.length, queue: w.ctx.queue.length, trends: w.ctx.trends.length },
      }));
      const result = await ctx.step("simulate", () => simulate(world.ctx, plans), (r) => ({
        message: `simulated ${r.plans.length} ${r.plans.length === 1 ? "plan" : "plans"} across ${r.runs} futures, ${r.weeks} weeks each, to ${target}`,
        data: { runs: r.runs, weeks: r.weeks },
      }));
      for (const p of result.plans) ctx.emit("progress", planLine(p, target), { plan: p.id, p10: p.final.p10, p50: p.final.p50, p90: p.final.p90, hoursNeeded: p.hoursNeeded });
      ctx.done(result.comparison?.verdict ?? planLine(result.plans[0], target), { runs: result.runs });
      return result;
    },
    fallback: (_err, ctx) => {
      ctx.emit("progress", "kept to one central future (mean pace, mean effort, mid demand forecast)");
      const r = simulate(world.ctx, plans, { central: true });
      ctx.done(r.comparison?.verdict ?? planLine(r.plans[0], target));
      return r;
    },
  });
  return { ...output, ...(i.runId ? { runId: i.runId } : {}) };
}

// ---------- adopt: propose → the student decides ----------

/** "unchanged" = the plan is already your roadmap, so nothing was drafted, stored or versioned. */
export type ProposalStatus = "proposed" | "adopted" | "declined" | "undone" | "unchanged";
export interface WhatIfProposal {
  id: string;
  userId: string;
  status: ProposalStatus;
  plan: PlanSpec;
  baseVersion: number;
  previous: Roadmap;
  proposed: Roadmap;
  diff: RoadmapDiff;
  outlook: { targetDate: string; p10: number; p50: number; p90: number; allDoneShare: number; allDoneDate: string | null; hoursNeeded: number | null };
  hoursBefore: number;
  createdAt: string;
  decidedAt?: string;
}

/** The view the client gets: never the whole previous roadmap. */
export type ProposalView = Omit<WhatIfProposal, "previous" | "proposed"> & { weeks: { week: number; startDate: string; focusSkillId: SkillId; name: string; hours: number; isExamWeek: boolean }[]; roadmapVersion: number };

export function proposalView(p: WhatIfProposal, names: (id: SkillId) => string): ProposalView {
  const { previous: _p, proposed, ...rest } = p;
  void _p;
  return {
    ...rest,
    roadmapVersion: proposed.version,
    weeks: proposed.weeks.map((w) => ({ week: w.week, startDate: w.startDate, focusSkillId: w.focusSkillId, name: names(w.focusSkillId), hours: w.tasks.reduce((s, t) => s + t.hours, 0), isExamWeek: w.isExamWeek })),
  };
}

async function currentRoadmap(world: WhatIfWorld): Promise<Roadmap> {
  if (world.roadmap?.weeks?.length) return world.roadmap;
  const pod = await podFor(world.ctx.userId).catch(() => null);
  return buildRoadmap({ profile: world.profile, map: world.map, programme: world.ctx.programme, trends: world.ctx.trends, pod, now: simNow(), polish: false }).roadmap;
}

const checkpoint = (userId: string, note: string) => ({ kind: "student-approval" as const, who: userId, note });

export async function proposeAdoption(i: { world: WhatIfWorld; plan: PlanSpec; runId?: string }): Promise<ProposalView> {
  const { world, plan } = i;
  const names = (id: SkillId) => nameOf(world, id) || id;
  const { output } = await runAgent<ProposalView>({
    agent: "roadmap",
    runId: i.runId,
    purpose: `What-if Simulator: proposing "${plan.label}" as your roadmap (you decide)`,
    input: { userId: world.ctx.userId, plan },
    checkpoint: checkpoint(world.ctx.userId, "Nothing changes until the student approves the proposed roadmap"),
    guardrails: [noOutboundMessaging<ProposalView>()],
    run: async (ctx) => {
      const current = await ctx.step("current", () => currentRoadmap(world), (r) => `read roadmap v${r.version} (${r.weeks.length} weeks)`);
      const sim = simulate(world.ctx, [plan], { runs: ASSUMPTIONS.runs });
      const p = sim.plans[0];
      const proposed = buildProposedRoadmap(current, plan, simNow());
      const diff = diffRoadmaps(current, proposed);
      const unchanged = !diff.weekChanges.length && diff.hoursBefore === diff.hoursAfter && plan.hoursPerWeek === world.profile.dna.hoursPerWeek;
      const proposal: WhatIfProposal = {
        id: `wi_${world.ctx.userId}_${randomBytes(4).toString("hex")}`.toLowerCase(),
        userId: world.ctx.userId, status: unchanged ? "unchanged" : "proposed", plan,
        baseVersion: current.version, previous: current, proposed, diff,
        outlook: { targetDate: sim.targetDate, ...p.final, allDoneShare: p.allDoneShare, allDoneDate: p.allDoneDate, hoursNeeded: p.hoursNeeded },
        hoursBefore: world.profile.dna.hoursPerWeek,
        createdAt: new Date().toISOString(),
      };
      if (unchanged) {
        // Approving would only bump the version and turn other open proposals stale, so there is nothing to decide.
        ctx.done(`"${plan.label}" is already your roadmap (v${current.version}): same weeks, same ${diff.hoursAfter} hours a week. Nothing to change.`, { weekChanges: 0 });
        return proposalView({ ...proposal, proposed: current }, names);
      }
      await getStore().upsert(PROPOSALS, proposal.id, proposal, world.ctx.userId);
      ctx.done(`proposed roadmap v${proposed.version}: ${diff.weekChanges.length} weeks change, ${diff.hoursBefore} → ${diff.hoursAfter} hours a week. Waiting for you to decide.`, { weekChanges: diff.weekChanges.length, hoursAfter: diff.hoursAfter });
      return proposalView(proposal, names);
    },
  });
  return output;
}

export async function decideAdoption(i: { userId: string; proposalId: string; action: "approve" | "decline" | "undo"; runId?: string }): Promise<ProposalView> {
  const store = getStore();
  const rec = await store.get<WhatIfProposal>(PROPOSALS, i.proposalId);
  if (!rec || rec.userId !== i.userId) throw new WhatIfNotFound("We couldn't find that proposal. Simulate again and adopt from there.");
  const world = await loadWhatIfWorld(i.userId);
  const label = (id: SkillId) => (world ? nameOf(world, id) : id) || id;

  const { output } = await runAgent<ProposalView>({
    agent: "roadmap",
    runId: i.runId,
    purpose: i.action === "approve" ? `Adopting "${rec.plan.label}" as your roadmap (you approved it)` : i.action === "undo" ? `Restoring your roadmap from before "${rec.plan.label}"` : `Leaving your roadmap as it is ("${rec.plan.label}" declined)`,
    input: { userId: i.userId, proposalId: i.proposalId, action: i.action },
    checkpoint: checkpoint(i.userId, i.action === "approve" ? "The student approved this roadmap in the What-if Simulator" : `The student chose to ${i.action}`),
    guardrails: [noOutboundMessaging<ProposalView>()],
    run: async (ctx) => {
      const now = new Date().toISOString();
      const live = await loadRoadmap(i.userId, rec.proposed.roleId).catch(() => null);
      if (i.action === "decline") {
        if (rec.status !== "proposed") throw new WhatIfConflict(`This proposal is already ${rec.status}.`);
        const next = { ...rec, status: "declined" as const, decidedAt: now };
        await store.upsert(PROPOSALS, rec.id, next, i.userId);
        ctx.done("you kept your current roadmap; nothing changed");
        return proposalView(next, label);
      }
      if (i.action === "approve") {
        if (rec.status !== "proposed") throw new WhatIfConflict(`This proposal is already ${rec.status}.`);
        if ((live?.version ?? rec.baseVersion) !== rec.baseVersion) throw new WhatIfConflict("Your roadmap changed since this proposal. Simulate again so you approve what's current.");
        await ctx.step("write-roadmap", () => store.upsert("roadmaps", i.userId, rec.proposed as Roadmap & { id?: string }, i.userId), () => `wrote roadmap v${rec.proposed.version}: week 1 is ${label(rec.diff.firstFocus.after ?? "")}`);
        const profile = await getProfile(i.userId);
        const after = rec.plan.hoursPerWeek;
        if (profile?.dna && profile.dna.hoursPerWeek !== after) {
          await store.upsert("profiles", i.userId, { ...profile, dna: { ...profile.dna, hoursPerWeek: after } } as Profile & { id?: string }, i.userId);
          ctx.emit("progress", `saved ${after} hours a week to your profile, so the next re-plan keeps them`, { hoursPerWeek: after });
        }
        const next = { ...rec, status: "adopted" as const, decidedAt: now };
        await store.upsert(PROPOSALS, rec.id, next, i.userId);
        ctx.done(`Roadmap v${rec.proposed.version} adopted from "${rec.plan.label}": ${rec.diff.weekChanges.length} weeks moved, outlook ${pct(rec.outlook.p50)} by ${dateLabel(rec.outlook.targetDate)}`, { version: rec.proposed.version });
        return proposalView(next, label);
      }
      // undo
      if (rec.status !== "adopted") throw new WhatIfConflict("Only an adopted plan can be undone.");
      if (live && live.version !== rec.proposed.version) throw new WhatIfConflict("Your roadmap has changed since you adopted this plan, so undo would overwrite newer work.");
      const restored: Roadmap = { ...rec.previous, version: rec.proposed.version + 1, generatedAt: now };
      await store.upsert("roadmaps", i.userId, restored as Roadmap & { id?: string }, i.userId);
      const profile = await getProfile(i.userId);
      if (profile?.dna && profile.dna.hoursPerWeek !== rec.hoursBefore) {
        await store.upsert("profiles", i.userId, { ...profile, dna: { ...profile.dna, hoursPerWeek: rec.hoursBefore } } as Profile & { id?: string }, i.userId);
      }
      const next = { ...rec, status: "undone" as const, decidedAt: now };
      await store.upsert(PROPOSALS, rec.id, next, i.userId);
      ctx.done(`restored your previous roadmap as v${restored.version}`);
      return proposalView(next, label);
    },
  });
  return output;
}
