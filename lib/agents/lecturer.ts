import "server-only";
// Lecturer Insights (Teaching pillar, contract F14; P1's COULD, built by P5 for review).
// "Which high-demand industry skills does no module teach, and what practical lab could close the gap?"
// Anonymous by construction: the pure functions below never receive user ids, only roles and gap lists.
import { emit, newRunId } from "@/lib/agents/events";
import { loadCohort, loadMap, loadProgramme, loadRoleDemand } from "@/lib/agents/cohort";
import { ANONYMITY_MIN } from "@/lib/agents/peerInsights";
import { llmJSON } from "@/lib/llm";
import { skillName } from "@/lib/schemas/community";
import { LabIdeasDraftZ, roleName, type LecturerCohort, type LecturerInsights } from "@/lib/schemas/lecturer";
import type { BridgeMap } from "@/lib/types";

/** A skill counts as "asked for" by a role at ≥ 10% of its job ads. */
export const MIN_DEMAND = 0.1;
export const TOP_GAPS = 6;
export const THRESHOLD_MESSAGE =
  `Insights are hidden for this programme until at least ${ANONYMITY_MIN} students use Keystone. ` +
  "We only show groups this size so no student can be identified.";

/** One student, stripped of identity: first-choice role + current gaps. */
export type CohortStudent = { primaryRole: string | null; gaps: string[] };
/** roleId → skillId → share of ads (0..1). */
export type DemandByRole = Record<string, Record<string, number>>;
export type ModuleRef = { code: string; title?: string; skills: string[]; learningOutcomes: string[] };
export type Coverage = {
  /** Skills at least one module teaches. */
  covered: Set<string>;
  /** Skills we can't place either way (e.g. proven on a map with no module link): never claimed as uncovered. */
  unknown: Set<string>;
  modules: ModuleRef[];
  source: "programme" | "map" | "none";
};

// ---------- pure ----------

/** The most-targeted first-choice role that has demand data (ties → alphabetical). */
export function pickDemandRole(students: CohortStudent[], demand: DemandByRole): string | null {
  const counts = new Map<string, number>();
  for (const s of students) if (s.primaryRole && demand[s.primaryRole]) counts.set(s.primaryRole, (counts.get(s.primaryRole) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function computeCohortRoles(programmeId: string, students: CohortStudent[], demand: DemandByRole): LecturerCohort {
  const cohortSize = students.length;
  if (cohortSize < ANONYMITY_MIN) return { programmeId, cohortSize, suppressed: true, demandRole: null, roles: [] };
  const counts = new Map<string, number>();
  for (const s of students) if (s.primaryRole) counts.set(s.primaryRole, (counts.get(s.primaryRole) ?? 0) + 1);
  const roles = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([roleId, n]) => ({ roleId, roleName: roleName(roleId), students: n, pct: Math.round((n / cohortSize) * 100) }));
  const d = pickDemandRole(students, demand);
  return { programmeId, cohortSize, suppressed: false, demandRole: d ? { roleId: d, roleName: roleName(d) } : null, roles };
}

/**
 * High-demand skills for the cohort's most-targeted role that no module covers,
 * ranked by demandPct × studentsTargeting (top 6). Empty below the anonymity threshold or without coverage data.
 */
export function computeLecturerGaps(input: {
  students: CohortStudent[];
  demand: DemandByRole;
  coverage: Coverage;
  limit?: number;
}): LecturerInsights["gaps"] {
  const { students, demand, coverage } = input;
  if (students.length < ANONYMITY_MIN || coverage.source === "none") return [];
  const role = pickDemandRole(students, demand);
  if (!role) return [];
  return Object.entries(demand[role])
    .filter(([id, share]) => share >= MIN_DEMAND && !coverage.covered.has(id) && !coverage.unknown.has(id))
    .map(([skillId, share]) => ({
      skillId,
      demandPct: Math.round(share * 100),
      studentsTargeting: students.filter(
        (s) => (s.primaryRole !== null && (demand[s.primaryRole]?.[skillId] ?? 0) >= MIN_DEMAND) || s.gaps.includes(skillId),
      ).length,
    }))
    .filter((g) => g.studentsTargeting > 0)
    .sort((a, b) => b.demandPct * b.studentsTargeting - a.demandPct * a.studentsTargeting || b.demandPct - a.demandPct || a.skillId.localeCompare(b.skillId))
    .slice(0, input.limit ?? TOP_GAPS);
}

/** Which existing module skill a lab for each gap builds on, the lab itself, and outcome keywords. */
const LABS: Record<string, { hosts: string[]; text: string; keywords: string[] }> = {
  docker: { hosts: ["testing", "system-design", "databases"], keywords: ["deploy", "build", "software", "implement"],
    text: "Add a containerised deployment step to the {code} coursework: students ship their solution as a Docker image a marker can run with one command" },
  aws: { hosts: ["system-design", "databases", "security-basics"], keywords: ["deploy", "distributed", "scal", "design"],
    text: "Add a cloud deployment lab to {code}: students deploy their service to a free-tier cloud account and explain the cost and security trade-offs" },
  sql: { hosts: ["databases"], keywords: ["query", "data", "database", "design"],
    text: "Add a hands-on SQL lab to {code}: students write joins, aggregates and window functions against a real open dataset, checked by automated tests" },
  pytorch: { hosts: ["machine-learning", "deep-learning"], keywords: ["implement", "train", "model", "evaluate"],
    text: "Re-run one {code} lab in PyTorch: students train a small image classifier and compare it with their scikit-learn baseline" },
  tensorflow: { hosts: ["deep-learning", "machine-learning"], keywords: ["implement", "train", "model"],
    text: "Re-run one {code} lab in TensorFlow: students train a small model and compare it with their existing baseline" },
  mlops: { hosts: ["machine-learning", "deep-learning"], keywords: ["evaluate", "model", "reproduc", "experiment"],
    text: "Add experiment tracking and a model card to the {code} coursework: students log their runs, version their data and justify the model they ship" },
  "llm-apps": { hosts: ["deep-learning", "machine-learning"], keywords: ["apply", "implement", "evaluate"],
    text: "Add a small LLM app exercise to {code}: retrieval-based Q&A over the module notes, with a checklist for spotting wrong answers" },
  "llm-evaluation": { hosts: ["machine-learning", "deep-learning"], keywords: ["evaluate", "critic", "measure"],
    text: "Add an evaluation lab to {code}: students build a small test set and measure where a language model's answers go wrong" },
  "vector-databases": { hosts: ["databases", "machine-learning"], keywords: ["query", "data", "search"],
    text: "Add a semantic search exercise to {code}: students index documents as embeddings and compare the results with keyword search" },
  kubernetes: { hosts: ["system-design", "testing"], keywords: ["distributed", "scal", "design", "deploy"],
    text: "Add a scaling exercise to {code}: students run their service as several replicas behind a load balancer and watch it recover from a failure" },
  "ci-cd": { hosts: ["testing", "system-design"], keywords: ["test", "quality", "software"],
    text: "Run the {code} coursework tests in GitHub Actions: every push builds and tests the code, so students practise continuous integration" },
};

function outcomeClause(m: ModuleRef | undefined, keywords: string[], host: string | undefined, label: string): string {
  if (m && m.learningOutcomes.length) {
    const idx = m.learningOutcomes.findIndex((lo) => keywords.some((k) => lo.toLowerCase().includes(k)));
    const i = idx >= 0 ? idx : 0;
    const lo = m.learningOutcomes[i].replace(/\.$/, "");
    return ` (supports learning outcome ${i + 1}: '${lo.length > 90 ? `${lo.slice(0, 87)}…` : lo}')`;
  }
  if (m && host) {
    const name = skillName(host);
    const inSentence = /[A-Z]/.test(name.slice(1)) ? name : name.toLowerCase(); // "Testing" → "testing", keep "SQL"
    return ` (builds on what ${label} already teaches about ${inSentence})`;
  }
  return "";
}

/** Deterministic lab ideas for the top gaps, linked to existing modules (used whenever the LLM is unavailable). */
export function templateLabIdeas(gaps: LecturerInsights["gaps"], modules: ModuleRef[], n = 3): string[] {
  const used = new Set<string>();
  return gaps.slice(0, n).map((g) => {
    const lab = LABS[g.skillId] ?? {
      hosts: [], keywords: ["apply", "implement", "practical"],
      text: `Add a short practical exercise on ${skillName(g.skillId)} to {code}: students apply it to their existing coursework and explain their choices`,
    };
    let host: string | undefined;
    let mod: ModuleRef | undefined;
    for (const pass of [true, false]) {
      for (const h of lab.hosts) {
        mod = modules.find((m) => m.skills.includes(h) && (!pass || !used.has(m.code)));
        if (mod) { host = h; break; }
      }
      if (mod) break;
    }
    mod ??= modules.find((m) => !used.has(m.code)) ?? modules[0];
    if (mod) used.add(mod.code);
    const text = mod
      ? lab.text.replace("{code}", mod.title ? `${mod.code} ${mod.title}` : mod.code)
      : lab.text.replace("the {code} coursework", "an existing module's coursework").replace("one {code} lab", "one existing lab").replace("{code}", "an existing module");
    return `${text}${outcomeClause(mod, lab.keywords, host, mod?.code ?? "")}.`;
  });
}

// ---------- I/O ----------

function coverageFromMap(map: BridgeMap | undefined): Coverage {
  if (!map) return { covered: new Set(), unknown: new Set(), modules: [], source: "none" };
  const covered = new Set<string>();
  const unknown = new Set<string>();
  const byCode = new Map<string, ModuleRef>();
  for (const n of map.nodes) {
    if (n.status === "degree-done" || n.status === "degree-upcoming" || n.moduleCodes.length) covered.add(n.skillId);
    else if (n.status === "proven") unknown.add(n.skillId); // proven but no module link: we can't say whether a module teaches it
    for (const code of n.moduleCodes) {
      const m = byCode.get(code) ?? { code, skills: [], learningOutcomes: [] };
      m.skills.push(n.skillId);
      byCode.set(code, m);
    }
  }
  return { covered, unknown, modules: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)), source: "map" };
}

/** Cohort (anonymised), demand per target role, and module coverage, from P1's fixtures with Bridge Map fallbacks. */
export async function loadLecturerContext(programmeId: string) {
  const { profiles, skills } = await loadCohort(programmeId);
  const students: CohortStudent[] = profiles.map((p) => ({ primaryRole: p.dna?.targetRoles?.[0] ?? null, gaps: skills[p.id]?.gaps ?? [] }));

  // Any cohort member's Bridge Map (in the seed, Aisha's) is the fallback for demand + coverage.
  let refMap: BridgeMap | undefined;
  for (const p of profiles) {
    const r = p.dna?.targetRoles?.[0];
    if (r && (refMap = await loadMap(p.id, r))) break;
  }

  const demand: DemandByRole = {};
  for (const roleId of new Set(students.map((s) => s.primaryRole).filter((r): r is string => !!r))) {
    const market = loadRoleDemand(roleId);
    if (market) demand[roleId] = Object.fromEntries(market.skills.map((s) => [s.skillId, s.share]));
    else if (refMap?.roleId === roleId) demand[roleId] = Object.fromEntries(refMap.nodes.map((n) => [n.skillId, n.demand]));
  }

  const programme = loadProgramme(programmeId);
  const coverage: Coverage = programme
    ? {
        covered: new Set(programme.modules.flatMap((m) => m.skills.filter((s) => s.level >= 1).map((s) => s.skillId))),
        unknown: new Set(),
        modules: programme.modules.map((m) => ({ code: m.code, title: m.title, skills: m.skills.map((s) => s.skillId), learningOutcomes: m.learningOutcomes ?? [] })),
        source: "programme",
      }
    : coverageFromMap(refMap);

  return { students, demand, coverage };
}

export async function buildLecturerInsights(programmeId: string, opts: { demo?: boolean } = {}): Promise<LecturerInsights> {
  const runId = newRunId();
  emit({ runId, agent: "market", status: "started", message: `Lecturer Insights: reading the ${programmeId} cohort, syllabus and job ads` });
  const { students, demand, coverage } = await loadLecturerContext(programmeId);
  if (students.length < ANONYMITY_MIN) {
    emit({ runId, agent: "market", status: "done", message: `Only ${students.length} students: below the anonymity threshold of ${ANONYMITY_MIN}, nothing shown` });
    return { gaps: [], labIdeas: [THRESHOLD_MESSAGE] };
  }
  const gaps = computeLecturerGaps({ students, demand, coverage });
  emit({
    runId, agent: "market", status: "progress",
    message: `Compared ${students.length} students' target roles with ${coverage.modules.length} modules: ${gaps.length} high-demand skills no module covers`,
    data: { cohortSize: students.length, modules: coverage.modules.length, gaps: gaps.length, coverageSource: coverage.source },
  });

  const fallback = templateLabIdeas(gaps, coverage.modules);
  let labIdeas = fallback;
  if (!opts.demo && gaps.length) {
    try {
      const draft = await llmJSON({
        agent: "market", runId, schemaName: "lab_ideas", temperature: 0.4,
        cacheKey: `lecturer-labs-${programmeId}-${gaps.map((g) => g.skillId).join("-")}`,
        schema: LabIdeasDraftZ,
        system:
          "You help university module leads add practical, industry-relevant labs to EXISTING modules. " +
          "Write exactly 3 lab ideas, each one sentence of at most 45 words. Each idea names one existing module code from the list, " +
          "the industry skill it adds, what students do, and the learning outcome it supports (quote it when outcomes are given). " +
          "Plain UK English. Never invent module codes. No student names or personal data.",
        user: JSON.stringify({
          gaps: gaps.map((g) => ({ skill: skillName(g.skillId), demandPct: g.demandPct, studentsTargeting: g.studentsTargeting })),
          modules: coverage.modules.slice(0, 20).map((m) => ({ code: m.code, title: m.title, teaches: m.skills.map(skillName), learningOutcomes: m.learningOutcomes.slice(0, 6) })),
        }),
      });
      const ideas = draft.labIdeas.map((s) => s.trim()).filter(Boolean).slice(0, 3);
      if (ideas.length) labIdeas = ideas;
    } catch {
      // No key / model error: the deterministic templates are already in place.
    }
  }
  emit({ runId, agent: "market", status: "done", message: `Lecturer Insights ready: ${gaps.length} gaps, ${labIdeas.length} lab ideas`, data: { gaps: gaps.length, labIdeas: labIdeas.length } });
  return { gaps, labIdeas };
}
