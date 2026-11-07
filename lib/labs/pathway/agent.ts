// Shortest Path to Opportunity: the governed agent. Reads the Bridge Map, roadmap, programme and market, ranks every
// open placement and internship by the shortest learning path to it, and (only after the student approves) pulls a
// path to the front of their roadmap. Runs inside runAgent (events, guardrails, ledger, human checkpoint).
import "server-only";
import { emit } from "@/lib/agents/events";
import { addMemory, deleteMemory } from "@/lib/agents/coach/memory";
import { maxItems, noOutboundMessaging } from "@/lib/agents/guardrails";
import { runAgent } from "@/lib/agents/harness";
import { loadRoadmap } from "@/lib/agents/roadmap";
import { loadBridgeMap } from "@/lib/agents/tools/loaders";
import { CURATED_PREREQS } from "@/lib/graph/build";
import { getProfile, marketFixture, podFor, programmeFixture, skillMeta } from "@/lib/graph/data";
import { DEMO_UID, UID_COOKIE, safeUserId } from "@/lib/session-cookie";
import { getStore } from "@/lib/store";
import type { BridgeMap, Pod, Profile, Programme, Roadmap } from "@/lib/types";
import { fmtDate, plural } from "./format";
import { demoOpportunities, effortTable, liveOpportunities } from "./opportunities";
import { mergePathIntoRoadmap, previewOf } from "./roadmapMerge";
import { createSolver, isClosed, keystoneSkill, rankPaths } from "./solver";
import type { Opportunity, OpportunityPath, PathwayResult, RoadmapPreview } from "./types";

export const PATHWAY_COLLECTION = "lab_pathway";
export const MAX_PATHS = 12;
/** DEMO_MODE pins "today" so the demo's weeks and deadlines never drift. */
export const DEMO_NOW = "2026-11-07T09:00:00Z";
export const isDemo = () => process.env.DEMO_MODE === "true";
export const clock = () => (isDemo() ? new Date(DEMO_NOW) : new Date());

export type PathwayErrorCode = "not_found" | "conflict";
export class PathwayError extends Error {
  constructor(message: string, readonly code: PathwayErrorCode) {
    super(message);
    this.name = "PathwayError";
  }
}

/** The student a request acts for: the demo student with `demo`, else the `ks_uid` cookie (never a body field). */
export function viewerFrom(req: Request, demo?: boolean): string {
  if (demo) return DEMO_UID;
  const raw = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${UID_COOKIE}=`))?.slice(UID_COOKIE.length + 1);
  return safeUserId(raw) ?? DEMO_UID;
}

interface Ctx { profile: Profile; roleId: string; map: BridgeMap; roadmap: Roadmap | null; programme: Programme | null; pod: Pod | null }

async function loadContext(userId: string): Promise<Ctx> {
  const profile = await getProfile(userId);
  if (!profile?.dna) throw new PathwayError("We couldn't find your profile. Finish onboarding first.", "not_found");
  const roleId = profile.dna.targetRoles?.[0] ?? "ml-engineer";
  const map = await loadBridgeMap(userId, roleId).catch(() => null);
  if (!map) throw new PathwayError("No Bridge Map yet. Add your degree in onboarding and Keystone will build it.", "not_found");
  const [roadmap, pod] = await Promise.all([
    loadRoadmap(userId, roleId).catch(() => null),
    podFor(userId).catch(() => null),
  ]);
  return { profile, roleId, map, roadmap, programme: programmeFixture(profile.programmeId), pod };
}

function solverFor(c: Ctx, now: Date) {
  return createSolver({
    map: c.map, profile: c.profile, programme: c.programme, roadmap: c.roadmap, effort: effortTable(),
    meta: skillMeta, curated: CURATED_PREREQS, market: marketFixture, now,
  });
}

const firstName = (p: Profile) => p.name?.trim().split(/\s+/)[0] || p.id;

interface PathwayRecord {
  id: string; userId: string; opportunityId: string; title: string; employer: string;
  fromVersion: number; toVersion: number; appliedAt: string; previous: Roadmap; memoryNoteId?: string;
}

async function readRecord(userId: string): Promise<PathwayRecord | null> {
  try {
    const r = await getStore().get<PathwayRecord>(PATHWAY_COLLECTION, userId);
    return r && r.userId === userId && r.previous ? r : null;
  } catch {
    return null;
  }
}

// ---------- rank every opportunity ----------

export async function findPathways(userId: string, opts: { runId?: string; live?: boolean } = {}): Promise<PathwayResult> {
  const now = clock();
  const { output, meta } = await runAgent<PathwayResult>({
    agent: "roadmap",
    runId: opts.runId,
    purpose: "Shortest path to opportunity: how far you are from each placement and internship",
    input: { userId, live: !!opts.live },
    guardrails: [maxItems<PathwayResult>(MAX_PATHS, { field: "paths" }), noOutboundMessaging<PathwayResult>()],
    run: async (ctx) => {
      const c = await ctx.step("read your Bridge Map and roadmap", () => loadContext(userId), (x) => {
        const proven = x.map.nodes.filter((n) => n.status === "proven").length;
        const degree = x.map.nodes.filter((n) => n.status === "degree-done" || n.status === "degree-upcoming").length;
        return {
          message: `Read your Bridge Map: ${x.map.nodes.length} skills, ${proven} proven, ${degree} from your degree; roadmap v${x.roadmap?.version ?? 0}`,
          data: { skills: x.map.nodes.length, proven, degree, roadmapVersion: x.roadmap?.version ?? 0 },
        };
      });

      // Handoff: the Market Agent supplies the listings.
      emit({ runId: ctx.runId, agent: "market", status: "started", message: "Market Agent: gathering placements and internships" });
      const demo = demoOpportunities();
      const live = opts.live && !isDemo() ? await liveOpportunities(c.roleId) : { opportunities: [] as Opportunity[], droppedUnsafe: 0, searched: 0 };
      const all = [...demo, ...live.opportunities];
      const open = all.filter((o) => !isClosed(o, now));
      emit({
        runId: ctx.runId, agent: "market", status: "done",
        message: `Market Agent: ${plural(open.length, "open listing")} (${demo.length} demo${live.opportunities.length ? `, ${live.opportunities.length} live` : ""}${live.droppedUnsafe ? `, ${live.droppedUnsafe} unsafe dropped` : ""})`,
        data: { demo: demo.length, live: live.opportunities.length, droppedUnsafe: live.droppedUnsafe, closed: all.length - open.length },
      });
      if (live.droppedUnsafe) ctx.record({ name: "injectionShield", action: "modified", detail: `dropped ${plural(live.droppedUnsafe, "live listing")} that tried to instruct an AI` });

      const solver = solverFor(c, now);
      const paths = await ctx.step("search the skill graph", () => rankPaths(open.map((o) => solver.solve(o))), (ps) => {
        const combos = ps.reduce((a, p) => a + p.combosSearched, 0);
        return { message: `Searched ${plural(combos, "skill combination")} across ${plural(ps.length, "opportunity", "opportunities")}`, data: { combos, opportunities: ps.length } };
      });
      const combosSearched = paths.reduce((a, p) => a + p.combosSearched, 0);
      const record = await readRecord(userId);
      const closest = paths.find((p) => p.state === "within-reach");
      const ready = paths.filter((p) => p.state === "apply-now").length;
      ctx.done(
        closest
          ? `Closest next step: ${closest.opportunity.employer}, ${plural(closest.skillsToLearn, "skill")} and ${plural(closest.studyWeeks, "week")} away; ${ready} you can apply to now`
          : `${plural(paths.length, "opportunity", "opportunities")} ranked`,
        { opportunities: paths.length, applyNow: ready, combos: combosSearched },
      );
      const keystone = keystoneSkill(paths);
      return {
        userId, firstName: firstName(c.profile), roleId: c.roleId, asOf: now.toISOString(), hoursPerWeek: solver.hoursPerWeek,
        source: live.opportunities.length ? "demo+live" : "demo", paths, ...(keystone ? { keystone } : {}),
        closed: all.length - open.length, droppedUnsafe: live.droppedUnsafe, combosSearched,
        ...(record && c.roadmap?.version === record.toVersion
          ? { applied: { opportunityId: record.opportunityId, title: record.title, employer: record.employer, version: record.toVersion } }
          : {}),
      };
    },
  });
  return { ...output, runId: meta.runId };
}

/** One opportunity's path (the Coach tool and the add flow use this). */
async function pathFor(userId: string, opportunityId: string, now: Date): Promise<{ c: Ctx; path: OpportunityPath }> {
  const c = await loadContext(userId);
  let opp = demoOpportunities().find((o) => o.id === opportunityId);
  if (!opp && opportunityId.startsWith("live-") && !isDemo()) opp = (await liveOpportunities(c.roleId)).opportunities.find((o) => o.id === opportunityId);
  if (!opp) throw new PathwayError("That listing isn't available any more. Refresh the list and pick another.", "not_found");
  if (isClosed(opp, now)) throw new PathwayError("Applications for that listing have closed.", "conflict");
  return { c, path: solverFor(c, now).solve(opp) };
}

// ---------- add a path to the roadmap (human checkpoint) ----------

export type AddResult =
  | { status: "needs_approval"; preview: RoadmapPreview }
  | { status: "added"; preview: RoadmapPreview; version: number; rememberedGoal: boolean; runId: string }
  | { status: "already-added"; version: number }
  | { status: "nothing-to-add"; message: string };

export async function addPathToRoadmap(
  userId: string,
  i: { opportunityId: string; approved: boolean; rememberGoal?: boolean; runId?: string },
): Promise<AddResult> {
  const now = clock();
  const { c, path } = await pathFor(userId, i.opportunityId, now);
  const learn = path.steps.filter((s) => s.mode === "learn");
  if (!learn.length) return { status: "nothing-to-add", message: path.state === "apply-now" ? "You already have every skill it asks for: you can apply now." : "Your degree covers everything it asks for in time: nothing to add." };
  if (!c.roadmap) throw new PathwayError("You don't have a roadmap yet. Open Roadmap to build one, then come back.", "not_found");
  const record = await readRecord(userId);
  if (record && record.opportunityId === i.opportunityId && record.toVersion === c.roadmap.version) return { status: "already-added", version: c.roadmap.version };

  const merged = mergePathIntoRoadmap({ roadmap: c.roadmap, path, profile: c.profile, pod: c.pod, category: (id) => skillMeta(id).category, now });
  if (!merged.changes.length) {
    return { status: "nothing-to-add", message: merged.laterNotes.length ? `Nothing to add yet. ${merged.laterNotes.join(" ")}` : "Nothing to add: your roadmap already covers this path." };
  }
  const preview = previewOf(path, c.roadmap, merged, (id) => c.map.nodes.find((n) => n.skillId === id)?.name ?? skillMeta(id).name);
  // The human checkpoint: nothing is written until the student presses "Approve and add".
  if (!i.approved) return { status: "needs_approval", preview };

  const who = firstName(c.profile);
  const o = path.opportunity;
  const { output, meta } = await runAgent<{ version: number; rememberedGoal: boolean }>({
    agent: "roadmap",
    runId: i.runId,
    purpose: `Add the shortest path to ${o.title} at ${o.employer} to the roadmap`,
    input: { userId, opportunityId: o.id, version: c.roadmap.version },
    checkpoint: { kind: "student-approval", who, note: `${who} approved pulling ${plural(merged.changes.length, "skill")} forward for ${o.employer}` },
    guardrails: [noOutboundMessaging()],
    run: async (ctx) => {
      const store = getStore();
      const moved = merged.changes.filter((x) => x.kind === "moved").length;
      const added = merged.changes.length - moved;
      await ctx.step("save the roadmap", () => store.upsert<Roadmap & { id?: string }>("roadmaps", userId, merged.roadmap, userId), () => ({
        message: `Roadmap v${merged.roadmap.version}: ${moved} ${moved === 1 ? "week" : "weeks"} moved forward, ${added} added for ${o.employer}`,
        data: { version: merged.roadmap.version, moved, added },
      }));
      let memoryNoteId: string | undefined;
      if (i.rememberGoal) {
        try {
          const note = await addMemory({ userId, kind: "goal", text: `you're aiming for ${o.title} at ${o.employer}${o.closesAt ? `; applications close ${fmtDate(o.closesAt)}` : ""}`, source: "Shortest path to opportunity" });
          memoryNoteId = note.id;
        } catch {
          ctx.degraded("coach memory unavailable: the goal note was not saved");
        }
      }
      const rec: PathwayRecord = {
        id: userId, userId, opportunityId: o.id, title: o.title, employer: o.employer,
        fromVersion: c.roadmap!.version, toVersion: merged.roadmap.version, appliedAt: now.toISOString(), previous: c.roadmap!,
        ...(memoryNoteId ? { memoryNoteId } : {}),
      };
      await store.upsert(PATHWAY_COLLECTION, userId, rec, userId);
      ctx.done(`Roadmap v${merged.roadmap.version} ready: ${plural(merged.changes.length, "skill")} pulled forward for ${o.title}`, { version: merged.roadmap.version });
      return { version: merged.roadmap.version, rememberedGoal: !!memoryNoteId };
    },
  });
  return { status: "added", preview, version: output.version, rememberedGoal: output.rememberedGoal, runId: meta.runId };
}

// ---------- undo ----------

export async function undoPathway(userId: string, opts: { runId?: string } = {}): Promise<{ status: "undone"; version: number; runId: string }> {
  const record = await readRecord(userId);
  if (!record) throw new PathwayError("There's nothing to undo: no path from this page is in your roadmap.", "not_found");
  const profile = await getProfile(userId);
  const current = await loadRoadmap(userId, profile?.dna?.targetRoles?.[0]).catch(() => null);
  if (!current || current.version !== record.toVersion) {
    throw new PathwayError("Your roadmap has changed since you added this path, so Undo would lose those changes. Re-plan it on the Roadmap page instead.", "conflict");
  }
  const who = profile ? firstName(profile) : userId;
  const { output, meta } = await runAgent<{ version: number }>({
    agent: "roadmap",
    runId: opts.runId,
    purpose: `Undo the path to ${record.title} at ${record.employer}`,
    input: { userId, version: current.version },
    checkpoint: { kind: "student-approval", who, note: `${who} chose to undo the path to ${record.employer}` },
    run: async (ctx) => {
      const store = getStore();
      const restored: Roadmap = { ...record.previous, version: current.version + 1, generatedAt: clock().toISOString() };
      await ctx.step("restore the roadmap", () => store.upsert<Roadmap & { id?: string }>("roadmaps", userId, restored, userId), () => `Roadmap v${restored.version}: back to the plan from v${record.fromVersion}`);
      await store.remove(PATHWAY_COLLECTION, userId);
      if (record.memoryNoteId) await deleteMemory(userId, record.memoryNoteId).catch(() => false);
      ctx.done(`Roadmap v${restored.version} restored`, { version: restored.version });
      return { version: restored.version };
    },
  });
  return { status: "undone", version: output.version, runId: meta.runId };
}
