import "server-only";
// Skill Half-life Radar · the agent. Reads the syllabus (Syllabus Agent), the Trend Forecaster's history, the Bridge
// Map's prerequisite edges and the anonymous cohort (Lecturer Insights), runs the maths in ./model inside the
// governed harness (events with real numbers, guardrails, ledger) and keeps the module lead's decisions in the
// `curriculum_refresh` collection. Agents propose, the module lead decides: nothing is ever sent or published.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { newRunId } from "@/lib/agents/events";
import { noOutboundMessaging } from "@/lib/agents/guardrails";
import { runAgent, type AgentCtx, type Checkpoint, type Guardrail } from "@/lib/agents/harness";
import { loadLecturerContext } from "@/lib/agents/lecturer";
import { ANONYMITY_MIN } from "@/lib/agents/peerInsights";
import { guardOutput, neutralize, scanForInjection, UNTRUSTED_RULE, wrapUntrusted } from "@/lib/agents/safety/injection";
import { getProgramme } from "@/lib/agents/syllabus";
import { getTrends } from "@/lib/agents/trends";
import * as graphBuild from "@/lib/graph/build";
import { llmJSON } from "@/lib/llm";
import { getStore } from "@/lib/store";
import type { Profile, Programme, SkillId, TrendSeries } from "@/lib/types";
import { buildEdges, cohortDemand, computeHalfLife, type Edge, type HalfLifeConfig } from "./model";
import {
  DecisionZ, HalfLifeReportZ, REFRESH_AT,
  type DecideReq, type Decision, type HalfLifeQuery, type HalfLifeReport, type ModuleHalfLife,
} from "./schema";

/** Where the module lead's decisions live (read back by this page and the Coach tool). */
export const DECISIONS = "curriculum_refresh";
const FALLBACK_ROLES = ["ml-engineer", "software-engineer", "data-analyst"];

export class HalfLifeError extends Error {
  constructor(message: string, readonly code: "not_found" | "bad_input") {
    super(message);
    this.name = "HalfLifeError";
  }
}

export const CHECKPOINT: Checkpoint = {
  kind: "lecturer-decision",
  who: "module lead",
  note: "Refresh notes are drafts. The module lead adopts, edits or dismisses each one; nothing changes in the syllabus by itself.",
};

const isDemo = () => process.env.DEMO_MODE === "true";

/** Reads a fixture under data/fixtures (path scoped statically, so the build traces only that folder). */
function readFixture<T>(rel: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "fixtures", rel), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function loadConfig(): HalfLifeConfig {
  const raw = readFixture<Partial<HalfLifeConfig>>("labs/halflife.json") ?? {};
  return { pairs: Array.isArray(raw.pairs) ? raw.pairs : [], successors: raw.successors ?? {}, keywords: raw.keywords ?? {} };
}

/** The Bridge Map's own curated prerequisites (absent when a test mocks the module: then the map's edges alone). */
function curatedPrereqs(): Record<SkillId, SkillId[]> {
  try {
    return (graphBuild as { CURATED_PREREQS?: Record<SkillId, SkillId[]> }).CURATED_PREREQS ?? {};
  } catch {
    return {};
  }
}

/** Prerequisite edges from a real Bridge Map on this programme (Aisha's in the seed). */
async function graphEdges(programmeId: string): Promise<{ edges: Edge[]; source: string | null }> {
  try {
    const profiles = (await getStore().list<Profile>("profiles")).filter((p) => p.programmeId === programmeId);
    profiles.sort((a, b) => Number(b.id === "aisha") - Number(a.id === "aisha") || a.id.localeCompare(b.id));
    for (const p of profiles.slice(0, 5)) {
      const role = p.dna?.targetRoles?.[0];
      if (!role) continue;
      const map = await graphBuild.loadGraph(p.id, role);
      if (map?.edges?.length) return { edges: map.edges, source: `${p.id}:${role}` };
    }
  } catch {
    /* no map: curated edges only */
  }
  return { edges: [], source: null };
}

async function cohortContext(programmeId: string) {
  try {
    const { students, demand } = await loadLecturerContext(programmeId);
    const size = students.length;
    if (size >= ANONYMITY_MIN) {
      const counts = new Map<string, number>();
      for (const s of students) if (s.primaryRole) counts.set(s.primaryRole, (counts.get(s.primaryRole) ?? 0) + 1);
      const roleMix = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([roleId, n]) => ({ roleId, weight: n, pct: Math.round((n / size) * 100) }));
      return { size, suppressed: false, roleMix, demand };
    }
    return { size, suppressed: true, ...equalMix() };
  } catch {
    return { size: 0, suppressed: true, ...equalMix() };
  }
}

function equalMix() {
  const demand: Record<string, Record<string, number>> = {};
  for (const r of FALLBACK_ROLES) {
    const d = readFixture<{ skills?: { skillId: string; share: number }[] }>(`market.${r}.json`);
    if (d?.skills) demand[r] = Object.fromEntries(d.skills.map((s) => [s.skillId, s.share]));
  }
  const roles = Object.keys(demand);
  return { roleMix: roles.map((roleId) => ({ roleId, weight: 1, pct: Math.round(100 / roles.length) })), demand };
}

async function latestDecisions(programmeId: string): Promise<Map<string, Decision>> {
  const out = new Map<string, Decision>();
  try {
    const rows = await getStore().list<Decision>(DECISIONS);
    for (const r of rows) {
      const d = DecisionZ.safeParse(r);
      if (!d.success || d.data.programmeId !== programmeId) continue;
      const prev = out.get(d.data.moduleCode);
      if (!prev || prev.decidedAt < d.data.decidedAt) out.set(d.data.moduleCode, d.data);
    }
  } catch {
    /* store down: no decisions shown */
  }
  return out;
}

// ---------- guardrails ----------

const CODE_SHAPE = /\b[A-Z]{2,5}\d[A-Za-z0-9]{2,6}\b/g;
const NUMBER = /\d+(?:\.\d+)?/g;

/** Output guardrail: a refresh note may only name module codes that exist in the programme. */
export function knownModuleCodes(codes: Set<string>): Guardrail<HalfLifeReport> {
  return {
    name: "knownModuleCodes",
    apply(output, ctx) {
      const templates = (ctx.memo.templates ?? {}) as Record<string, ModuleHalfLife["refreshNote"]>;
      let fixed = 0;
      const modules = output.modules.map((m) => {
        const bad = (m.refreshNote?.text.match(CODE_SHAPE) ?? []).filter((c) => !codes.has(c));
        if (!bad.length) return m;
        fixed++;
        return { ...m, refreshNote: templates[m.code] ?? null };
      });
      return fixed
        ? { output: { ...output, modules }, action: "modified", detail: `${fixed} note(s) named an unknown module: replaced with the template` }
        : { output, action: "pass", detail: "every note names real modules" };
    },
  };
}

/** Output guardrail: below 10 students the cohort's role mix is never shown. */
export function cohortAnonymity(): Guardrail<HalfLifeReport> {
  return {
    name: "anonymityThreshold",
    apply(output) {
      if (output.cohort.size >= ANONYMITY_MIN && !output.cohort.suppressed) return { output, action: "pass", detail: `group of ${output.cohort.size} (≥ ${ANONYMITY_MIN})` };
      if (!output.cohort.roleMix.length) return { output, action: "pass", detail: "no role mix shown" };
      return { output: { ...output, cohort: { ...output.cohort, suppressed: true, roleMix: [] } }, action: "modified", detail: `group of ${output.cohort.size} < ${ANONYMITY_MIN}: role mix hidden` };
    },
  };
}

/** An LLM rewrite is kept only if it adds no number, keeps the module code and keeps the learning-outcome link. */
export function groundedRewrite(template: string, rewrite: string, code: string): boolean {
  const allowed = new Set(template.match(NUMBER) ?? []);
  const nums = rewrite.match(NUMBER) ?? [];
  if (nums.some((n) => !allowed.has(n))) return false;
  if (template.includes(code) && !rewrite.includes(code)) return false;
  const lo = template.match(/learning outcome (\d+)/i)?.[1];
  if (lo && !new RegExp(`learning outcome ${lo}\\b`, "i").test(rewrite)) return false;
  return rewrite.length >= 20;
}

const RewriteZ = z.object({ note: z.string().min(20).max(600) });

async function polishNotes(report: HalfLifeReport, programme: Programme, ctx: AgentCtx): Promise<number> {
  let rewritten = 0;
  for (const m of report.modules.filter((x) => x.refreshNote && !x.flagged).slice(0, 3)) {
    const note = m.refreshNote!;
    const mod = programme.modules.find((x) => x.code === m.code);
    try {
      const out = await llmJSON({
        agent: "trends", runId: ctx.runId, schemaName: "refresh_note", temperature: 0.3,
        cacheKey: `halflife-${report.programmeId}-${m.code}-${note.text.length}`,
        schema: RewriteZ,
        system:
          "You polish one curriculum refresh note for a UK university module lead. Keep every number exactly as given, " +
          "keep the module code and the learning outcome number, add no new facts, at most 70 words, plain UK English. " + UNTRUSTED_RULE,
        user: `Draft note: ${note.text}\n\nModule syllabus text:\n${wrapUntrusted(`syllabus:${m.code}`, [...(mod?.topics ?? []), ...(mod?.learningOutcomes ?? [])].join("\n"), 2000)}`,
      });
      const text = guardOutput(out.note.trim());
      if (groundedRewrite(note.text, text, m.code)) {
        m.refreshNote = { ...note, text, source: "llm" };
        rewritten++;
      } else {
        ctx.record({ name: "groundedNumbers", action: "modified", detail: `${m.code}: rewrite changed a number or dropped a link, kept the template` });
      }
    } catch {
      ctx.degraded("no language model available: the deterministic notes are used");
      break;
    }
  }
  return rewritten;
}

// ---------- the report ----------

export async function buildHalfLifeReport(q: Omit<HalfLifeQuery, "demo">, opts: { runId?: string; demo?: boolean; quiet?: boolean; polish?: boolean } = {}): Promise<{ report: HalfLifeReport; status: string }> {
  const demo = opts.demo ?? isDemo();
  const programme = getProgramme(q.programmeId);
  if (!programme) throw new HalfLifeError(`No syllabus for programme "${q.programmeId}". Read it on the onboarding page first.`, "not_found");
  const runId = opts.runId ?? newRunId();
  const codes = new Set(programme.modules.map((m) => m.code));
  const trace: string[] = [];

  const { output, meta } = await runAgent<HalfLifeReport>({
    agent: "trends",
    runId,
    purpose: `Skill Half-life Radar: how fast each ${programme.name} module goes stale`,
    input: q,
    startData: { modules: programme.modules.length, horizonYears: q.horizonYears },
    outputSchema: HalfLifeReportZ,
    checkpoint: CHECKPOINT,
    quiet: opts.quiet,
    guardrails: [knownModuleCodes(codes), cohortAnonymity(), noOutboundMessaging()],
    run: async (ctx) => {
      const say = (m: string) => { trace.push(m); return m; };
      const cfg = loadConfig();

      const trends = await ctx.step("trends", () => getTrends(undefined, { demo }).catch(() => [] as TrendSeries[]), (t) => ({
        message: say(`Read ${t.length} skill trend histories (${t[0]?.history.length ?? 0} months of hiring posts each)`), data: { skills: t.length },
      }));
      if (!trends.length) throw new Error("no trend data");

      const { edges: mapEdges, source } = await ctx.step("graph", () => graphEdges(q.programmeId), (g) => ({
        message: say(`Read ${g.edges.length} prerequisite edges from the Bridge Map${g.source ? "" : " (none found, so curated links only)"}`), data: { edges: g.edges.length },
      }));
      const edges = buildEdges(mapEdges, curatedPrereqs(), cfg);
      const pairCount = edges.filter((e) => e.kind === "co-occurs").length;

      const cohort = await ctx.step("cohort", () => cohortContext(q.programmeId), (c) => ({
        message: say(c.suppressed
          ? `Cohort below ${ANONYMITY_MIN} students, so demand is an equal mix of ${c.roleMix.length} roles`
          : `Weighted demand by what ${c.size} students are aiming for (${c.roleMix.length} target roles)`),
        data: { cohortSize: c.size, roles: c.roleMix.length },
      }));

      // The syllabus is scraped web text: scan it, neutralise it, and never quote a flagged module to a model.
      const flagged = new Set<string>();
      const safeProgramme: Programme = {
        ...programme,
        modules: programme.modules.map((m) => {
          const scan = scanForInjection([m.title, ...(m.topics ?? []), ...(m.learningOutcomes ?? [])].join("\n"));
          if (scan.risk === "high") flagged.add(m.code);
          return {
            ...m,
            title: neutralize(m.title),
            topics: (m.topics ?? []).map(neutralize),
            learningOutcomes: scan.risk === "high" ? [] : (m.learningOutcomes ?? []).map(neutralize),
          };
        }),
      };
      ctx.record({ name: "injectionShield", action: flagged.size ? "modified" : "pass", detail: flagged.size ? `${flagged.size} module(s) flagged: their outcomes are not quoted` : "syllabus text is clean" });
      say(`Scanned ${programme.modules.length} modules' syllabus text: ${flagged.size} flagged by the injection shield`);

      const computed = await ctx.step("forecast", () => computeHalfLife({
        programme: safeProgramme, trends, edges, cohortDemand: cohortDemand(cohort.roleMix, cohort.demand),
        horizonYears: q.horizonYears, cfg, flagged,
      }), (c) => {
        const fastest = c.modules.filter((m) => m.halfLifeYears !== null).sort((a, b) => a.halfLifeYears! - b.halfLifeYears!)[0];
        return {
          message: say(`Projected ${c.forecastsUsed} skill forecasts to ${c.horizonMonth}${fastest ? `: fastest half-life ${fastest.code} at ${fastest.halfLifeYears} years` : ""}`),
          data: { forecasts: c.forecastsUsed, edges: edges.length, pairs: pairCount, mapSource: source ?? "none" },
        };
      });

      const decisions = await latestDecisions(q.programmeId);
      ctx.memo.templates = Object.fromEntries(computed.modules.map((m) => [m.code, m.refreshNote]));
      const modules: ModuleHalfLife[] = computed.modules.map((m) => ({ ...m, decision: decisions.get(m.code) ?? null }));
      const needsRefresh = modules.filter((m) => m.urgency >= REFRESH_AT).length;
      const report: HalfLifeReport = {
        programmeId: programme.id, programmeName: programme.name, university: programme.university,
        horizonYears: q.horizonYears, horizonMonth: computed.horizonMonth, lastDataMonth: computed.lastDataMonth,
        modules,
        stats: { modules: modules.length, forecastsUsed: computed.forecastsUsed, edgesUsed: edges.length, needsRefresh, decaying: modules.filter((m) => m.status === "decaying").length },
        cohort: { size: cohort.size, suppressed: cohort.suppressed, roleMix: cohort.suppressed ? [] : cohort.roleMix.map(({ roleId, pct }) => ({ roleId, pct })) },
        trace, generatedAt: new Date().toISOString(), runId,
      };

      if (!demo && opts.polish !== false) {
        const n = await polishNotes(report, programme, ctx);
        if (n) say(`Polished ${n} refresh notes with the language model (numbers checked against the receipts)`);
      }
      const decaying = report.stats.decaying;
      say(`Ranked ${modules.length} modules: ${needsRefresh} ${needsRefresh === 1 ? "needs" : "need"} a refresh, ${decaying} ${decaying === 1 ? "is" : "are"} losing demand`);
      ctx.done(`Half-life Radar: ${needsRefresh} of ${modules.length} modules ${needsRefresh === 1 ? "needs" : "need"} a refresh`, { needsRefresh, modules: modules.length, decaying: report.stats.decaying });
      return report;
    },
  });
  return { report: output, status: meta.status };
}

// ---------- the module lead's decision (human checkpoint) ----------

export async function decideRefresh(req: DecideReq, opts: { runId?: string } = {}): Promise<Decision> {
  const runId = opts.runId ?? newRunId();
  if (req.note) {
    const scan = scanForInjection(req.note);
    if (scan.risk === "high") throw new HalfLifeError("That note reads like an instruction to an AI, so it wasn't saved. Rephrase it as a note for colleagues.", "bad_input");
  }
  const { report } = await buildHalfLifeReport(
    { programmeId: req.programmeId, horizonYears: req.horizonYears ?? 3 },
    { runId, quiet: true, polish: false, ...(req.demo ? { demo: true } : {}) },
  );
  const mod = report.modules.find((m) => m.code === req.moduleCode);
  if (!mod) throw new HalfLifeError(`Module ${req.moduleCode} isn't in ${report.programmeName}.`, "not_found");
  const note = req.note ? neutralize(req.note) : mod.refreshNote?.text;
  if (!note) throw new HalfLifeError(`Module ${req.moduleCode} has no refresh note to decide on. Write one first.`, "bad_input");

  const { output } = await runAgent<Decision>({
    agent: "trends",
    runId,
    purpose: `Record the module lead's decision on the ${req.moduleCode} refresh note`,
    input: { moduleCode: req.moduleCode, decision: req.decision },
    outputSchema: DecisionZ,
    checkpoint: CHECKPOINT,
    guardrails: [noOutboundMessaging()],
    run: async (ctx) => {
      const doc: Decision = {
        id: `${req.programmeId}:${req.moduleCode}`,
        programmeId: req.programmeId, moduleCode: req.moduleCode, decision: req.decision, note,
        ...(mod.refreshNote?.learningOutcome ? { learningOutcome: mod.refreshNote.learningOutcome } : {}),
        skillIds: mod.refreshNote?.skillIds ?? mod.drift.slice(0, 1).map((d) => d.skillId),
        urgency: mod.urgency, halfLifeYears: mod.halfLifeYears,
        decidedAt: new Date().toISOString(), decidedBy: "module-lead", runId,
      };
      await ctx.step("save", () => getStore().upsert(DECISIONS, doc.id, doc), () => `Saved the ${req.decision} decision for ${req.moduleCode} (urgency ${mod.urgency})`);
      ctx.done(`Module lead ${req.decision} the ${req.moduleCode} refresh note`, { urgency: mod.urgency, decision: req.decision });
      return doc;
    },
  });
  return output;
}

export async function listDecisions(programmeId: string): Promise<Decision[]> {
  return [...(await latestDecisions(programmeId)).values()].sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1));
}
