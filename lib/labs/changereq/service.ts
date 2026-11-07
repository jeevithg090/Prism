// Plan Change Requests: the Roadmap Agent opens a pull request against your roadmap when the market moves.
// Trends refit → Market re-weight → Roadmap diff (each in runAgent, so every step is timed, guarded and in the
// agent_runs ledger). Approving merges a new roadmap version into the `roadmaps` store (what /roadmap, the Coach's
// get_week_plan and the Architect read), keeps every version in `plan_versions`, and revert is a new version too.
import "server-only";
import { emit, newRunId } from "@/lib/agents/events";
import { noOutboundMessaging, maxItems } from "@/lib/agents/guardrails";
import { runAgent } from "@/lib/agents/harness";
import { buildRoadmap, loadRoadmap } from "@/lib/agents/roadmap";
import { scanForInjection, neutralize } from "@/lib/agents/safety/injection";
import { TREND_SKILLS } from "@/lib/agents/trends";
import { loadBridgeMap } from "@/lib/agents/tools/loaders";
import { getProfile, marketFixture, podFor, programmeFixture, readData, trendsFixture } from "@/lib/graph/data";
import { roleName } from "@/lib/graph/roles";
import { RoadmapZ } from "@/lib/graph/schemas";
import { getStore } from "@/lib/store";
import type { BridgeMap, Pod, Profile, Roadmap, RoleDemand, TrendSeries } from "@/lib/types";
import { applyHunks, lockedWeeks, proposeHunks, readinessFor, riskOf, runChecks, signalsFrom, titleFor, type Signals } from "./diff";
import { applyRefresh, weeklyScenario, type Scenario } from "./refresh";
import {
  CR_COLLECTION, VERSIONS_COLLECTION, ChangeRequestZ,
  type ChangeReqState, type ChangeRequest, type CrComment, type Hunk, type PlanVersionSummary, type RefreshInfo,
} from "./types";

/** DEMO_MODE runs on a fixed clock so the locked weeks and the diff are the same on every run. */
export const DEMO_NOW = new Date("2026-11-07T15:00:00.000Z");
const isDemo = () => process.env.DEMO_MODE === "true";
const clock = (now?: Date) => now ?? (isDemo() ? DEMO_NOW : new Date());

export class ChangeReqError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422 = 409, readonly code = "conflict") {
    super(message);
    this.name = "ChangeReqError";
  }
}

interface PlanVersionDoc {
  id: string;
  userId: string;
  version: number;
  cause: PlanVersionSummary["cause"];
  summary: string;
  createdAt: string;
  changeRequestNumber?: number;
  roadmap: Roadmap;
}

interface Ctx {
  userId: string;
  roleId: string;
  profile: Profile | null;
  map: BridgeMap;
  roadmap: Roadmap;
  pod: Pod | null;
  market: RoleDemand | null;
  trends: TrendSeries[];
}

async function context(userId: string, now: Date): Promise<Ctx> {
  const profile = await getProfile(userId);
  const roleId = profile?.dna?.targetRoles?.[0] ?? "ml-engineer";
  const [map, pod] = await Promise.all([loadBridgeMap(userId, roleId), podFor(userId)]);
  if (!map) throw new ChangeReqError("No Bridge Map yet. Finish onboarding so the Roadmap Agent has a plan to change.", 404, "not_found");
  const trends = trendsFixture() ?? [];
  let roadmap = await loadRoadmap(userId, roleId);
  if (!roadmap && profile?.dna) {
    roadmap = buildRoadmap({ profile, map, pod, trends, programme: programmeFixture(profile.programmeId), now }).roadmap;
  }
  if (!roadmap?.weeks?.length) throw new ChangeReqError("No roadmap yet. Build one on the Roadmap page first.", 404, "not_found");
  return { userId, roleId, profile, map, roadmap, pod, market: marketFixture(roleId), trends };
}

function scenarioFor(now: Date): Scenario {
  if (isDemo()) {
    const s = readData<Scenario>("data/fixtures/labs/changereq.refresh.json");
    if (s?.shocks) return s;
  }
  return weeklyScenario(now, TREND_SKILLS);
}

async function listCRs(userId: string): Promise<ChangeRequest[]> {
  const all = await getStore().list<ChangeRequest>(CR_COLLECTION, { userId });
  return all.filter((c) => c && c.userId === userId).sort((a, b) => b.number - a.number);
}

async function saveCR(cr: ChangeRequest): Promise<ChangeRequest> {
  const parsed = ChangeRequestZ.parse(cr);
  await getStore().upsert<ChangeRequest>(CR_COLLECTION, parsed.id, parsed, parsed.userId);
  return parsed;
}

async function getCR(userId: string, id: string): Promise<ChangeRequest> {
  const cr = await getStore().get<ChangeRequest>(CR_COLLECTION, id);
  if (!cr || cr.userId !== userId) throw new ChangeReqError("We couldn't find that change request.", 404, "not_found");
  return cr;
}

async function listVersions(userId: string): Promise<PlanVersionDoc[]> {
  const all = await getStore().list<PlanVersionDoc>(VERSIONS_COLLECTION, { userId });
  return all.filter((v) => v && v.userId === userId).sort((a, b) => b.version - a.version);
}

async function saveVersion(doc: Omit<PlanVersionDoc, "id">): Promise<void> {
  const id = `${doc.userId}:v${doc.version}`;
  await getStore().upsert<PlanVersionDoc>(VERSIONS_COLLECTION, id, { ...doc, id }, doc.userId);
}

/** Keeps the version you started from, so the very first merge can be reverted. */
async function ensureBase(roadmap: Roadmap): Promise<void> {
  const id = `${roadmap.userId}:v${roadmap.version}`;
  if (await getStore().get(VERSIONS_COLLECTION, id)) return;
  await saveVersion({ userId: roadmap.userId, version: roadmap.version, cause: "base", summary: `Roadmap v${roadmap.version} from the Roadmap Agent`, createdAt: roadmap.generatedAt, roadmap });
}

async function saveRoadmap(r: Roadmap): Promise<Roadmap> {
  const parsed = RoadmapZ.parse(r) as Roadmap;
  await getStore().upsert<Roadmap & { id?: string }>("roadmaps", parsed.userId, parsed, parsed.userId);
  return parsed;
}

const signedPct = (g: number) => `${g >= 0 ? "+" : "−"}${Math.abs(Math.round(g * 100))}%/yr`;

function refreshInfo(ctx: Ctx, scenario: Scenario, before: Signals, after: Signals, month: string, seriesRefit: number, monthsFit: number): RefreshInfo {
  const ids = new Set([...before.trend.keys(), ...before.demand.keys()]);
  const names = new Map(ctx.map.nodes.map((n) => [n.skillId, n.name]));
  const movers = [...ids]
    .map((id) => ({
      skillId: id, name: names.get(id) ?? id,
      growthBefore: before.trend.get(id)?.growth ?? 0, growthAfter: after.trend.get(id)?.growth ?? 0,
      demandBefore: before.demand.get(id) ?? 0, demandAfter: after.demand.get(id) ?? 0,
    }))
    .filter((m) => names.has(m.skillId) && (Math.abs(m.demandAfter - m.demandBefore) >= 0.01 || Math.abs(m.growthAfter - m.growthBefore) >= 0.02))
    .sort((a, b) => Math.abs(b.growthAfter - b.growthBefore) + Math.abs(b.demandAfter - b.demandBefore) - (Math.abs(a.growthAfter - a.growthBefore) + Math.abs(a.demandAfter - a.demandBefore)))
    .slice(0, 6);
  return { id: scenario.id, label: scenario.label, month, simulated: scenario.simulated, adsAnalysed: ctx.market?.adsAnalysed ?? 0, seriesRefit, monthsFit, movers };
}

export interface OpenResult { changeRequest: ChangeRequest | null; runId: string; reused: boolean; message: string }

/** Runs the weekly refresh and, if the plan should change, opens (or returns the already open) change request. */
export async function openChangeRequest(userId: string, opts: { runId?: string; now?: Date } = {}): Promise<OpenResult> {
  const runId = opts.runId ?? newRunId();
  const now = clock(opts.now);
  const first = async () => (await getProfile(userId))?.name?.split(" ")[0] || userId;
  emit({ runId, agent: "orchestrator", status: "started", message: `Weekly refresh: does the market change ${await first()}'s plan?` });
  try {
    const ctx = await context(userId, now);
    const scenario = scenarioFor(now);
    const before = signalsFrom(ctx.market, ctx.trends);

    const { output: refreshed } = await runAgent({
      agent: "trends", runId, purpose: "Trend Forecaster: refit every skill's hiring trend with this week's data",
      input: { scenario: scenario.id }, startData: { series: ctx.trends.length },
      run: async (a) => {
        const r = await a.step("refit", () => applyRefresh(ctx.trends, ctx.market, scenario), (x) => ({
          message: `refitted ${x.seriesRefit} series on the last ${x.monthsFit} months (OLS on logit share, 95% band)`, data: { series: x.seriesRefit, months: x.monthsFit },
        }));
        const top = r.trends
          .map((t) => ({ t, d: t.growthPerYear - (ctx.trends.find((o) => o.skillId === t.skillId)?.growthPerYear ?? 0) }))
          .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
        const old = top ? ctx.trends.find((o) => o.skillId === top.t.skillId)?.growthPerYear ?? 0 : 0;
        const name = top ? ctx.map.nodes.find((n) => n.skillId === top.t.skillId)?.name ?? top.t.skillId : "";
        a.done(`Trend Forecaster: ${r.seriesRefit} skills refitted${top ? `; biggest move ${name} ${signedPct(old)} → ${signedPct(top.t.growthPerYear)}` : ""}`, { series: r.seriesRefit, month: r.month });
        return r;
      },
    });

    await runAgent({
      agent: "market", runId, purpose: `Market Agent: re-weight ${ctx.market?.adsAnalysed ?? 0} ${roleName(ctx.roleId)} ads with this week's shares`,
      input: { roleId: ctx.roleId, scenario: scenario.id },
      run: async (a) => {
        const moved = (refreshed.market?.skills ?? []).filter((s) => Math.abs(s.share - (ctx.market?.skills.find((o) => o.skillId === s.skillId)?.share ?? s.share)) >= 0.01).length;
        a.done(`Market Agent: ${ctx.market?.adsAnalysed ?? 0} ads re-weighted; ${moved} skills moved by a point or more`, { ads: ctx.market?.adsAnalysed ?? 0, moved });
        return moved;
      },
    });

    const after = signalsFrom(refreshed.market, refreshed.trends);
    const existing = await listCRs(userId);
    const open = existing.find((c) => c.status === "open");
    if (open && open.baseVersion === ctx.roadmap.version && open.refresh.id === scenario.id) {
      const message = `Change request #${open.number} is already open for this refresh`;
      emit({ runId, agent: "orchestrator", status: "done", message, data: { number: open.number, hunks: open.hunks.length } });
      return { changeRequest: open, runId, reused: true, message };
    }

    const number = (existing[0]?.number ?? 0) + 1;
    const { output: cr } = await runAgent<ChangeRequest | null>({
      agent: "roadmap", runId, purpose: "Roadmap Agent: diff your roadmap against the refreshed market and open a change request",
      input: { userId, version: ctx.roadmap.version, scenario: scenario.id },
      startData: { weeks: ctx.roadmap.weeks.length, version: ctx.roadmap.version },
      guardrails: [maxItems<ChangeRequest | null>(3, { field: "hunks" }), noOutboundMessaging<ChangeRequest | null>()],
      checkpoint: { kind: "student-approval", who: userId, note: "The roadmap only changes if the student approves the change request." },
      run: async (a) => {
        const locked = lockedWeeks(ctx.roadmap, now);
        const hunks = await a.step("diff", () => proposeHunks({ roadmap: ctx.roadmap, nodes: ctx.map.nodes, before, after, now }), (h) => ({
          message: `compared ${ctx.roadmap.weeks.length - locked.size} editable weeks against ${ctx.map.nodes.length} skills: ${h.length} ${h.length === 1 ? "week clears" : "weeks clear"} the 15% churn threshold`,
          data: { hunks: h.length, editable: ctx.roadmap.weeks.length - locked.size },
        }));
        if (!hunks.length) {
          a.done("Roadmap Agent: no week changes this time; your plan still fits the market", { hunks: 0 });
          return null;
        }
        const readiness = readinessFor(ctx.roadmap, ctx.map.nodes, after, hunks);
        const next = applyHunks({ roadmap: ctx.roadmap, hunks, nodes: ctx.map.nodes, pod: ctx.pod, theoryPractice: ctx.profile?.dna?.theoryPractice, changeRequestNumber: number, now, readinessAfter: readiness.after });
        const checks = await a.step("checks", () => runChecks({ roadmap: ctx.roadmap, next, hunks, nodes: ctx.map.nodes, edges: ctx.map.edges, pod: ctx.pod, locked, after, readiness }), (c) => ({
          message: `ran ${c.length} checks: ${c.filter((x) => x.status === "pass").length} pass, ${c.filter((x) => x.status === "warn").length} warn, ${c.filter((x) => x.status === "fail").length} fail`,
          data: { pass: c.filter((x) => x.status === "pass").length, warn: c.filter((x) => x.status === "warn").length, fail: c.filter((x) => x.status === "fail").length },
        }));
        const out: ChangeRequest = {
          id: `cr_${userId}_${number}`, number, userId, roleId: ctx.roleId, title: titleFor(hunks), status: "open",
          baseVersion: ctx.roadmap.version,
          refresh: refreshInfo(ctx, scenario, before, after, refreshed.month, refreshed.seriesRefit, refreshed.monthsFit),
          hunks, checks, risk: riskOf(checks), readiness,
          comments: [{ id: "c1", author: "roadmap", ts: now.toISOString(), text: `This week's refresh moved ${hunks.length === 1 ? "one week" : `${hunks.length} weeks`} past the 15% churn threshold, so I opened this request. Nothing changes until you approve. Reply "keep <skill>" to drop a change.` }],
          createdAt: now.toISOString(), runId,
        };
        a.done(`Roadmap Agent: opened change request #${number} (${hunks.length} ${hunks.length === 1 ? "week" : "weeks"}, ${out.risk} risk); waiting for you`, { number, hunks: hunks.length, risk: out.risk });
        return out;
      },
    });

    if (!cr) {
      emit({ runId, agent: "orchestrator", status: "done", message: "Refresh done: your roadmap still fits, no change request needed", data: { hunks: 0 } });
      return { changeRequest: null, runId, reused: false, message: "Your roadmap still fits this week's market." };
    }
    for (const old of existing.filter((c) => c.status === "open")) await saveCR({ ...old, status: "superseded", decidedAt: now.toISOString() });
    const saved = await saveCR(cr);
    emit({ runId, agent: "orchestrator", status: "done", message: `A change request with ${saved.hunks.length} ${saved.hunks.length === 1 ? "week" : "weeks"} is ready for your review. You decide.`, data: { number: saved.number, hunks: saved.hunks.length } });
    return { changeRequest: saved, runId, reused: false, message: `Change request #${saved.number} is ready for review.` };
  } catch (e) {
    emit({ runId, agent: "orchestrator", status: "error", message: "The refresh stopped; your roadmap is unchanged" });
    throw e;
  }
}

/** Merges an open change request: a new roadmap version (history kept), the request marked approved. */
export async function approveChangeRequest(userId: string, id: string, opts: { runId?: string; now?: Date } = {}): Promise<{ roadmap: Roadmap; changeRequest: ChangeRequest; runId: string }> {
  const runId = opts.runId ?? newRunId();
  const now = clock(opts.now);
  const cr = await getCR(userId, id);
  if (cr.status !== "open") throw new ChangeReqError(`Change request #${cr.number} is already ${cr.status}.`);
  const ctx = await context(userId, now);
  if (ctx.roadmap.version !== cr.baseVersion) {
    throw new ChangeReqError(`Your roadmap moved to v${ctx.roadmap.version} after this request was opened on v${cr.baseVersion}. Run the refresh again to rebase it.`);
  }
  emit({ runId, agent: "orchestrator", status: "started", message: `You approved change request #${cr.number}: merging it into your roadmap` });
  const { output } = await runAgent({
    agent: "roadmap", runId, purpose: `Roadmap Agent: merge change request #${cr.number} into roadmap v${cr.baseVersion}`,
    input: { userId, id, baseVersion: cr.baseVersion },
    checkpoint: { kind: "student-approval", who: userId, note: `The student approved change request #${cr.number}.` },
    run: async (a) => {
      await ensureBase(ctx.roadmap);
      const next = applyHunks({ roadmap: ctx.roadmap, hunks: cr.hunks, nodes: ctx.map.nodes, pod: ctx.pod, theoryPractice: ctx.profile?.dna?.theoryPractice, changeRequestNumber: cr.number, now, readinessAfter: cr.readiness.after });
      const saved = await a.step("save", () => saveRoadmap(next), (r) => ({ message: `saved roadmap v${r.version} (${cr.hunks.length} ${cr.hunks.length === 1 ? "week" : "weeks"} changed, hours unchanged)`, data: { version: r.version } }));
      await saveVersion({ userId, version: saved.version, cause: "change-request", changeRequestNumber: cr.number, summary: cr.title, createdAt: now.toISOString(), roadmap: saved });
      const merged = await saveCR({ ...cr, status: "approved", decidedAt: now.toISOString(), resultVersion: saved.version });
      a.done(`Roadmap Agent: roadmap v${saved.version} is live; v${cr.baseVersion} is kept so you can revert`, { version: saved.version, from: cr.baseVersion });
      return { roadmap: saved, changeRequest: merged };
    },
  });
  emit({ runId, agent: "orchestrator", status: "done", message: `Roadmap v${output.roadmap.version} is live. The Architect and your Coach now plan from it.`, data: { version: output.roadmap.version } });
  return { ...output, runId };
}

export async function rejectChangeRequest(userId: string, id: string, opts: { reason?: string; runId?: string; now?: Date } = {}): Promise<{ changeRequest: ChangeRequest; runId: string }> {
  const runId = opts.runId ?? newRunId();
  const now = clock(opts.now);
  const cr = await getCR(userId, id);
  if (cr.status !== "open") throw new ChangeReqError(`Change request #${cr.number} is already ${cr.status}.`);
  const { output } = await runAgent({
    agent: "roadmap", runId, purpose: `Roadmap Agent: close change request #${cr.number} without merging`,
    input: { userId, id }, quiet: true,
    checkpoint: { kind: "student-approval", who: userId, note: `The student rejected change request #${cr.number}.` },
    run: async () => {
      const comments: CrComment[] = [...cr.comments];
      if (opts.reason) comments.push({ id: `c${comments.length + 1}`, author: "student", text: neutralize(opts.reason), ts: now.toISOString() });
      comments.push({ id: `c${comments.length + 1}`, author: "roadmap", ts: now.toISOString(), text: `Closed without changes. Your roadmap stays on v${cr.baseVersion}, and next week's refresh starts from it.` });
      return saveCR({ ...cr, status: "rejected", decidedAt: now.toISOString(), comments });
    },
  });
  return { changeRequest: output, runId };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A comment on the request. "keep <skill>" drops that hunk (the agent pushes a fixup); "why" explains it. */
export async function commentOnChangeRequest(userId: string, id: string, text: string, opts: { runId?: string; now?: Date } = {}): Promise<{ changeRequest: ChangeRequest; runId: string }> {
  const runId = opts.runId ?? newRunId();
  const now = clock(opts.now);
  const cr = await getCR(userId, id);
  if (cr.status !== "open") throw new ChangeReqError(`Change request #${cr.number} is ${cr.status}, so it takes no more comments.`);
  const { output } = await runAgent({
    agent: "roadmap", runId, purpose: `Roadmap Agent: answer your comment on change request #${cr.number}`,
    input: { userId, id, chars: text.length },
    guardrails: [noOutboundMessaging<ChangeRequest>()],
    run: async (a) => {
      const scan = scanForInjection(text);
      const clean = neutralize(text).slice(0, 500);
      const comments: CrComment[] = [...cr.comments, { id: `c${cr.comments.length + 1}`, author: "student", text: clean, ts: now.toISOString(), ...(scan.risk === "high" ? { flagged: true } : {}) }];
      const reply = (t: string) => comments.push({ id: `c${comments.length + 1}`, author: "roadmap", text: t, ts: now.toISOString() });
      let hunks: Hunk[] = cr.hunks;
      if (scan.risk === "high") {
        a.record({ name: "injectionShield", action: "modified", detail: `comment flagged (${scan.findings.map((f) => f.kind).join(", ")})` });
        reply("That comment reads like instructions to an AI, so I treated it as text and changed nothing. Approve or reject the request yourself, or reply \"keep <skill>\".");
      } else {
        const t = norm(clean);
        const keep = /\b(keep|dont change|don t change|leave|skip)\b/.test(t)
          ? cr.hunks.filter((h) => [h.outgoing.after, h.incoming.after].some((s) => t.includes(norm(s.name)) || t.includes(norm(s.skillId))))
          : [];
        if (keep.length) {
          hunks = cr.hunks.filter((h) => !keep.includes(h));
          reply(hunks.length
            ? `Done: I dropped the week ${keep.map((h) => h.week).join(" and ")} change, so ${keep.map((h) => h.outgoing.after.name).join(" and ")} ${keep.length === 1 ? "stays" : "stay"} where ${keep.length === 1 ? "it was" : "they were"}. ${hunks.length} ${hunks.length === 1 ? "change is" : "changes are"} left.`
            : "Done: I dropped the last change, so there's nothing left to merge. I've closed this request and your roadmap is unchanged.");
        } else if (/\bwhy\b|\breason\b|\bexplain\b/.test(t)) {
          reply(cr.hunks.map((h) => `Week ${h.week}: ${h.receipt}`).join(" "));
        } else {
          reply("Noted. You can approve, reject, or reply \"keep <skill>\" (for example \"keep Kubernetes\") to drop one change.");
        }
      }
      let next: ChangeRequest = { ...cr, comments, hunks };
      if (hunks.length !== cr.hunks.length) {
        if (!hunks.length) next = { ...next, status: "closed", decidedAt: now.toISOString() };
        else {
          const ctx = await context(userId, now);
          const refreshed = applyRefresh(ctx.trends, ctx.market, scenarioFor(now));
          const after = signalsFrom(refreshed.market, refreshed.trends);
          const locked = lockedWeeks(ctx.roadmap, now);
          const readiness = { before: cr.readiness.before, after: readinessFor(ctx.roadmap, ctx.map.nodes, after, hunks).after };
          const merged = applyHunks({ roadmap: ctx.roadmap, hunks, nodes: ctx.map.nodes, pod: ctx.pod, theoryPractice: ctx.profile?.dna?.theoryPractice, changeRequestNumber: cr.number, now, readinessAfter: readiness.after });
          const checks = runChecks({ roadmap: ctx.roadmap, next: merged, hunks, nodes: ctx.map.nodes, edges: ctx.map.edges, pod: ctx.pod, locked, after, readiness });
          next = { ...next, title: titleFor(hunks), checks, risk: riskOf(checks), readiness };
        }
        a.done(`Roadmap Agent: updated change request #${cr.number} to ${hunks.length} ${hunks.length === 1 ? "change" : "changes"}`, { hunks: hunks.length });
      } else a.done(`Roadmap Agent: replied on change request #${cr.number}`);
      return saveCR(next);
    },
  });
  return { changeRequest: output, runId };
}

/** Restores an earlier version as a NEW version (history is never rewritten, like git revert). */
export async function revertToVersion(userId: string, toVersion: number, opts: { runId?: string; now?: Date } = {}): Promise<{ roadmap: Roadmap; runId: string }> {
  const runId = opts.runId ?? newRunId();
  const now = clock(opts.now);
  const target = await getStore().get<PlanVersionDoc>(VERSIONS_COLLECTION, `${userId}:v${toVersion}`);
  if (!target || target.userId !== userId) throw new ChangeReqError(`There's no saved version v${toVersion} to go back to.`, 404, "not_found");
  const current = await loadRoadmap(userId);
  if (!current) throw new ChangeReqError("No roadmap to revert.", 404, "not_found");
  if (current.version === toVersion) throw new ChangeReqError(`You're already on v${toVersion}.`);
  emit({ runId, agent: "orchestrator", status: "started", message: `Reverting your roadmap to v${toVersion}` });
  const { output } = await runAgent({
    agent: "roadmap", runId, purpose: `Roadmap Agent: restore roadmap v${toVersion} as a new version`,
    input: { userId, toVersion, from: current.version },
    checkpoint: { kind: "student-approval", who: userId, note: `The student reverted to v${toVersion}.` },
    run: async (a) => {
      await ensureBase(current);
      const doneIds = new Set(current.weeks.flatMap((w) => w.tasks.filter((t) => t.done).map((t) => `${w.week}:${w.focusSkillId}:${t.type}`)));
      const restored: Roadmap = {
        ...target.roadmap,
        version: current.version + 1,
        readinessNow: current.readinessNow,
        generatedAt: now.toISOString(),
        weeks: target.roadmap.weeks.map((w) => ({ ...w, tasks: w.tasks.map((t) => ({ ...t, done: doneIds.has(`${w.week}:${w.focusSkillId}:${t.type}`) })) })),
      };
      const saved = await saveRoadmap(restored);
      await saveVersion({ userId, version: saved.version, cause: "revert", summary: `Reverted to v${toVersion}`, createdAt: now.toISOString(), roadmap: saved });
      for (const cr of (await listCRs(userId)).filter((c) => c.status === "approved" && (c.resultVersion ?? 0) > toVersion)) {
        await saveCR({ ...cr, status: "reverted" });
      }
      a.done(`Roadmap Agent: roadmap v${saved.version} restores v${toVersion}; ticks you made are kept`, { version: saved.version, restored: toVersion });
      return saved;
    },
  });
  emit({ runId, agent: "orchestrator", status: "done", message: `Roadmap v${output.version} is live (same plan as v${toVersion})`, data: { version: output.version } });
  return { roadmap: output, runId };
}

/** Everything the page needs: the current plan, the open request, past requests and versions. */
export async function getChangeReqState(userId: string, opts: { now?: Date } = {}): Promise<ChangeReqState> {
  const now = clock(opts.now);
  const ctx = await context(userId, now);
  const locked = lockedWeeks(ctx.roadmap, now);
  const names = new Map(ctx.map.nodes.map((n) => [n.skillId, n.name]));
  const [crs, versions] = await Promise.all([listCRs(userId), listVersions(userId)]);
  const vs: PlanVersionSummary[] = versions.map((v) => ({
    version: v.version, cause: v.cause, summary: v.summary, createdAt: v.createdAt,
    ...(v.changeRequestNumber ? { changeRequestNumber: v.changeRequestNumber } : {}), current: v.version === ctx.roadmap.version,
  }));
  if (!vs.some((v) => v.version === ctx.roadmap.version)) {
    vs.unshift({ version: ctx.roadmap.version, cause: "base", summary: `Roadmap v${ctx.roadmap.version} from the Roadmap Agent`, createdAt: ctx.roadmap.generatedAt, current: true });
  }
  return {
    userId, roleId: ctx.roleId, roleName: roleName(ctx.roleId), version: ctx.roadmap.version,
    weeks: ctx.roadmap.weeks.map((w) => ({
      week: w.week, startDate: w.startDate, skillId: w.focusSkillId, name: names.get(w.focusSkillId) ?? w.focusSkillId,
      hours: w.tasks.reduce((s, t) => s + t.hours, 0), isExamWeek: w.isExamWeek, locked: locked.has(w.week),
    })),
    open: crs.find((c) => c.status === "open") ?? null,
    history: crs.filter((c) => c.status !== "open").map(({ id, number, title, status, createdAt, decidedAt, resultVersion }) => ({ id, number, title, status, createdAt, ...(decidedAt ? { decidedAt } : {}), ...(resultVersion ? { resultVersion } : {}) })),
    versions: vs,
    demo: isDemo() || !!ctx.profile?.isDemo,
  };
}
