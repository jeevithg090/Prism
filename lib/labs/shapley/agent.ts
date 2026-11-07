// Readiness Explained · the governed agent around the pure explainer. It reads the Bridge Map (loadGraph), the
// student's evidence, the programme, the roadmap and the micro-challenge catalogue; runs inside runAgent with
// guardrails (efficiency axiom, injection shield on evidence text, no demographic inputs); keeps a compact
// explanation in `readiness_explanations` (read back to anchor the score history, written only when it changes);
// and, only after the student decides, saves the chosen next proof as a Coach goal note (`coach_memory`, which the
// Coach reads into its context, visible and deletable) plus `readiness_commitments`, which the page reads back.
import "server-only";
import { emit, newRunId } from "@/lib/agents/events";
import { loadChallengeFixtures } from "@/lib/agents/challenges";
import { addMemory } from "@/lib/agents/coach/memory";
import { noDemographicSignals, noOutboundMessaging } from "@/lib/agents/guardrails";
import { runAgent, type AgentRunMeta, type Guardrail } from "@/lib/agents/harness";
import { loadRoadmap } from "@/lib/agents/roadmap";
import { roleName } from "@/lib/agents/trajectories";
import { neutralize, scanForInjection } from "@/lib/agents/safety/injection";
import { loadGraph } from "@/lib/graph/build";
import { getProfile, listEvidence, programmeFixture } from "@/lib/graph/data";
import { skillName } from "@/lib/schemas/community";
import { getStore } from "@/lib/store";
import type { BridgeMap, EvidenceItem, Profile } from "@/lib/types";
import { explainReadiness, type ChallengeRef } from "./explain";
import { COMMITS, EXPLANATIONS, ExplanationZ, type Explanation, type NextAction, type StoredCommitment, type StoredExplanation } from "./model";

export class NoMapError extends Error {
  readonly code = "not_found";
  constructor(message: string) { super(message); this.name = "NoMapError"; }
}
export class UnknownActionError extends Error {
  readonly code = "not_found";
  constructor(message: string) { super(message); this.name = "UnknownActionError"; }
}

const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const pct = (x: number) => Math.round(x * 100);
const firstName = (p: Profile | null, id: string) => p?.name?.trim().split(/\s+/)[0] || id;
const roleOf = (p: Profile | null) => p?.dna?.targetRoles?.[0] ?? "ml-engineer";
const displayRole = (id: string) => roleName(id) || id.replace(/-/g, " ");

/** Evidence text is untrusted (it can come from a public repo): scanned, neutralised, and hidden if it instructs an AI. */
export function shieldEvidence(evidence: EvidenceItem[]): { evidence: EvidenceItem[]; flagged: number } {
  let flagged = 0;
  const out = evidence.map((e) => {
    if (!e.quote) return e;
    if (scanForInjection(e.quote).risk === "high") {
      flagged += 1;
      return { ...e, quote: "Evidence note hidden: it contained instructions aimed at an AI." };
    }
    return { ...e, quote: neutralize(e.quote).slice(0, 200) };
  });
  return { evidence: out, flagged };
}

/** Blocks an explanation whose shares don't add up (Shapley efficiency) or whose closed form disagrees with enumeration. */
export function efficiencyAxiom(): Guardrail<Explanation> {
  return {
    name: "shapleyEfficiency",
    apply(output) {
      const { efficiencyGap, closedFormGap, coalitions } = output.checks;
      if (efficiencyGap > 0.05) return { output, action: "blocked", detail: `shares miss readiness by ${efficiencyGap} points` };
      if (closedFormGap > 1e-9) return { output, action: "blocked", detail: `closed form differs from enumeration by ${closedFormGap}` };
      return { output, action: "pass", detail: `shares sum to readiness; closed form matches ${coalitions} enumerated coalitions` };
    },
  };
}

function challengeRefs(): ChallengeRef[] {
  try {
    return loadChallengeFixtures().map((c) => ({ skillId: c.skillId, minutes: c.minutes, title: c.title }));
  } catch {
    return [];
  }
}

export interface ExplainOptions { roleId?: string; runId?: string; persist?: boolean; quiet?: boolean; now?: Date }

const docId = (userId: string, roleId: string) => `${userId}:${roleId}`;

async function readDoc<T>(collection: string, id: string): Promise<T | null> {
  try { return (await getStore().get<T>(collection, id)) ?? null; } catch { return null; }
}

/** The stored explanation's anchored adjustment, if it's a sane number (anything else is ignored, never trusted). */
function anchorOf(prev: StoredExplanation | null): { adjustment: number } | null {
  const a = prev?.historyAdjustment;
  return typeof a === "number" && Number.isFinite(a) && Math.abs(a) <= 1 ? { adjustment: a } : null;
}

/** The student's saved next proof for this role, or null. */
export async function loadCommitment(userId: string, roleId: string): Promise<StoredCommitment | null> {
  const c = await readDoc<StoredCommitment>(COMMITS, docId(userId, roleId));
  return c && typeof c.actionId === "string" && typeof c.noteText === "string" ? c : null;
}

/** Explains the student's readiness. Throws NoMapError when they have no Bridge Map yet. */
export async function explainForUser(userId: string, opts: ExplainOptions = {}): Promise<{ explanation: Explanation; runId: string; meta: AgentRunMeta }> {
  const runId = opts.runId ?? newRunId();
  const now = opts.now ?? new Date();
  const profile = await getProfile(userId).catch(() => null);
  const roleId = opts.roleId ?? roleOf(profile);
  const name = firstName(profile, userId);
  const role = displayRole(roleId);
  const say = (status: "started" | "progress" | "done", agent: "roadmap" | "orchestrator", message: string, data?: Record<string, unknown>) => {
    if (!opts.quiet) try { emit({ runId, agent, status, message, ...(data ? { data } : {}) }); } catch { /* never breaks the run */ }
  };

  const prev = await readDoc<StoredExplanation>(EXPLANATIONS, docId(userId, roleId));
  const anchor = anchorOf(prev);
  const base = (map: BridgeMap, mode: Explanation["mode"], extra: Partial<Parameters<typeof explainReadiness>[0]> = {}) =>
    explainReadiness({
      map, evidence: [], programme: null, roadmap: null, challenges: [], startedAt: profile?.startedAt,
      hoursPerWeek: profile?.dna?.hoursPerWeek ?? null, firstName: name, roleName: role, now, skillName, mode, anchor, ...extra,
    });

  const { output, meta } = await runAgent<Explanation>({
    agent: "skillmap", runId, quiet: opts.quiet,
    purpose: `Explain what makes up ${name}'s ${role} readiness, source by source, with exact Shapley values`,
    input: { userId, roleId }, startData: { roleId },
    outputSchema: ExplanationZ,
    guardrails: [efficiencyAxiom(), noDemographicSignals<Explanation>(), noOutboundMessaging<Explanation>()],
    run: async (ctx) => {
      const [map, rawEvidence, roadmap] = await ctx.step(
        "read-sources",
        () => Promise.all([loadGraph(userId, roleId), listEvidence(userId).catch(() => [] as EvidenceItem[]), loadRoadmap(userId, roleId).catch(() => null)]),
        ([m, e, r]) => ({
          message: `Read the Bridge Map (${m?.nodes.filter((n) => n.demand > 0).length ?? 0} role skills), ${e.length} evidence items and a ${r?.weeks.length ?? 0}-week roadmap`,
          data: { skills: m?.nodes.length ?? 0, evidence: e.length, weeks: r?.weeks.length ?? 0 },
        }),
      );
      if (!map) throw new NoMapError(`No Bridge Map yet for ${name}. Finish onboarding to build one.`);
      const programme = programmeFixture(profile?.programmeId);
      const challenges = challengeRefs();
      const { evidence, flagged } = shieldEvidence(rawEvidence);
      ctx.record({ name: "injectionShield", action: flagged ? "modified" : "pass", detail: `${rawEvidence.filter((e) => e.quote).length} evidence notes scanned, ${flagged} hidden` });
      ctx.memo.scoringInputs = map.nodes.map((n) => ({ skillId: n.skillId, demand: n.demand, status: n.status }));
      const explanation = await ctx.step(
        "shapley",
        () => base(map, "full", { evidence, programme, roadmap, challenges }),
        (x) => ({
          message: `Exact Shapley values for ${x.checks.players} sources: ${x.checks.coalitions} coalitions checked, shares sum to ${fmt(x.readiness.mappedPoints)} points`
            + (x.readiness.adjustmentNote ? `, plus a ${fmt(x.readiness.adjustmentPoints)}-point stored-score adjustment` : ""),
          data: { players: x.checks.players, coalitions: x.checks.coalitions, efficiencyGap: x.checks.efficiencyGap, adjustmentPoints: x.readiness.adjustmentPoints },
        }),
      );
      const top = explanation.contributors[0];
      ctx.done(
        `Readiness ${pct(explanation.readiness.now)}% explained: ${top ? `${top.label} +${fmt(top.points)}` : "no sources yet"}, this week ${explanation.week.deltaPoints >= 0 ? "+" : "−"}${fmt(Math.abs(explanation.week.deltaPoints))} points`,
        { readinessPct: pct(explanation.readiness.now), contributors: explanation.contributors.length, weekDelta: explanation.week.deltaPoints },
      );
      return explanation;
    },
    fallback: async (err, ctx) => {
      if (err instanceof NoMapError) throw err;
      const map = await loadGraph(userId, roleId).catch(() => null);
      if (!map) throw new NoMapError(`No Bridge Map yet for ${name}. Finish onboarding to build one.`);
      ctx.memo.scoringInputs = map.nodes.map((n) => ({ skillId: n.skillId, demand: n.demand, status: n.status }));
      ctx.done(`Readiness ${pct(map.readinessNow)}% explained per skill (sources unavailable)`);
      return base(map, "skills");
    },
  });

  const best = output.next.best;
  if (best) {
    say("done", "roadmap", `Best next proof: ${best.skillName}, +${fmt(best.gainPoints)} points for ${fmt(best.hours)} h (${fmt(best.pointsPerHour)} an hour)`, {
      skillId: best.skillId, gainPoints: best.gainPoints, hours: best.hours, candidates: output.next.actions.length,
    });
  }
  say("done", "orchestrator", `Readiness explained. You decide what to prove next.`);

  if (opts.persist !== false) {
    const reanchored = !anchor || anchor.adjustment !== output.readiness.historyAdjustment;
    const doc: StoredExplanation = {
      id: docId(userId, roleId), userId, roleId, readinessPct: pct(output.readiness.now),
      top: output.contributors.slice(0, 5).map((c) => ({ label: c.label, points: c.points })),
      weekDeltaPoints: output.week.deltaPoints,
      best: best ? { id: best.id, title: best.title, skillId: best.skillId, gainPoints: best.gainPoints, hours: best.hours, pointsPerHour: best.pointsPerHour } : null,
      historyAdjustment: output.readiness.historyAdjustment,
      anchoredAt: !reanchored && prev?.anchoredAt ? prev.anchoredAt : output.generatedAt,
      generatedAt: output.generatedAt,
    };
    // A page load only writes when the summary actually changed.
    const same = prev && JSON.stringify({ ...prev, generatedAt: "" }) === JSON.stringify({ ...doc, generatedAt: "" });
    if (!same) try { await getStore().upsert(EXPLANATIONS, doc.id, doc, userId); } catch { /* read-only store is fine */ }
  }
  return { explanation: output, runId, meta };
}

export interface CommitResult { action: NextAction; noteId: string; noteText: string; runId: string }

/**
 * The human checkpoint: the student chose `actionId` as their next proof. The action is recomputed server-side
 * (never trusted from the client), then saved as a Coach goal note the Coach reads into its context.
 */
export async function commitNextProof(userId: string, actionId: string, opts: { roleId?: string; runId?: string } = {}): Promise<CommitResult> {
  const runId = opts.runId ?? newRunId();
  const { explanation } = await explainForUser(userId, { roleId: opts.roleId, runId, quiet: true, persist: false });
  const action = explanation.next.actions.find((a) => a.id === actionId);
  if (!action) throw new UnknownActionError(`That next step isn't on ${explanation.firstName}'s plan any more. Refresh to see the current options.`);
  const text = action.gainPoints > 0
    ? `Next proof: ${action.skillName}. ${action.title} (+${fmt(action.gainPoints)} readiness points for about ${fmt(action.hours)} h)`
    : `Next step: ${action.skillName}. ${action.title} (rung 1, about ${Math.round(action.hours * 60)} minutes)`;
  const { output } = await runAgent<{ noteId: string; noteText: string }>({
    agent: "roadmap", runId,
    purpose: `Save ${explanation.firstName}'s chosen next proof as a Coach goal`,
    input: { userId, actionId },
    checkpoint: { kind: "student-approval", who: userId, note: `Chose ${action.skillName}: ${action.title}` },
    guardrails: [noOutboundMessaging()],
    run: async (ctx) => {
      const note = await ctx.step("save-goal", () => addMemory({ userId, kind: "goal", text, source: "Readiness Explained" }), (n) => `Saved a Coach goal note (${n.id})`);
      try {
        const doc: StoredCommitment = {
          id: docId(userId, explanation.roleId), userId, actionId, skillId: action.skillId, gainPoints: action.gainPoints, hours: action.hours,
          noteText: note.text, committedAt: new Date().toISOString(),
        };
        await getStore().upsert(COMMITS, doc.id, doc, userId);
      } catch { /* the note is what matters */ }
      ctx.done(`${explanation.firstName} chose ${action.skillName}: the Coach will plan around it`, { skillId: action.skillId });
      return { noteId: note.id, noteText: note.text };
    },
  });
  return { action, noteId: output.noteId, noteText: output.noteText, runId };
}
