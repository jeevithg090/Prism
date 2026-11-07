// Readiness Explained · the pure explainer. Given a Bridge Map, the student's evidence, the programme, the roadmap
// and the micro-challenge catalogue, it says exactly how much each source adds to readiness (Shapley values over
// Keystone's own readiness function), how the score moved this week, and which next proof buys the most
// readiness per hour. No I/O, no clock: everything comes in through ExplainInput, so it is fully testable.
//
// The game. For every role skill s on the map (weight w_s = demand_s / Σ demand), the players are its sources:
//   evidence linked to s ............ 1.0 if it's proof (level ≥ 2 at confidence ≥ 0.6, as buildBridgeMap rules), else 0
//   degree modules that teach s ..... 0.7 once the module's term is over, 0.4 while it's still to come
//   a "recorded" source ............. when the map marks s higher than its linked sources justify (seeded or curated
//                                      maps), the difference is credited to the record itself, never hidden
// v_s(S) = max value in S, capped at the coverage the map gives s, so v_s(all) is exactly the map's coverage.
// Readiness(S) = Σ_s w_s · v_s(S). Because the game is a sum of per-skill games, Shapley linearity makes the per-skill
// computation exact for the whole score; each skill is solved in closed form and cross-checked by enumerating every
// coalition.
//
// The stored score. A seeded map's readinessNow can sit a little off the formula, and every merged proof shifts it
// with 2-decimal rounding (lib/graph/readiness shiftReadiness). That difference isn't a source and gets no Shapley
// share: it's reported as readiness.adjustmentPoints, with a note. Past weeks replay with an anchored adjustment
// (ExplainInput.anchor, stored by the agent), so later rounding can't rewrite history; it shows as its own mover.
import type { BridgeMap, BridgeNode, EvidenceItem, Programme, Roadmap } from "@/lib/types";
import { COVERAGE } from "@/lib/graph/readiness";
import { isTermDone, termEnd, upcomingLabel } from "@/lib/graph/terms";
import type { Contributor, Explanation, Mover, NextAction, SkillShare, SourceKind } from "./model";
import { leaveOneOut, maxGame, round3, shapleyExact, shapleyMaxClosedForm } from "./shapley";

/** Keystone's readiness weights, read from the readiness module itself so the explanation can't drift from the score. */
export { COVERAGE };
/** buildBridgeMap's proof bar (lib/graph/build.ts keeps it private; shapley.test.ts pins the two together). */
export const PROOF_LEVEL = 2;
export const PROOF_CONFIDENCE = 0.6;
/** An anchored adjustment more than 1 point off today's means the map was rebuilt or re-seeded: re-anchor. */
export const ANCHOR_MAX_DRIFT = 0.01;
/** Micro-challenges write level-1 evidence at this confidence (lib/agents/challenges.ts gradeChallenge). */
export const CHALLENGE_EVIDENCE = { level: 1, confidence: 0.7 } as const;
export const MAX_ENUMERATED_PLAYERS = 12;
const WEEK_MS = 7 * 86_400_000;
const TIMELINE_WEEKS = 6;
const EPS = 1e-9;

export const isProof = (e: { level: number; confidence: number }) => e.level >= PROOF_LEVEL && e.confidence >= PROOF_CONFIDENCE;

export interface ChallengeRef { skillId: string; minutes: number; title: string }

export interface ExplainInput {
  map: BridgeMap;
  evidence: EvidenceItem[];
  programme: Programme | null;
  startedAt?: string;
  roadmap: Roadmap | null;
  challenges: ChallengeRef[];
  hoursPerWeek?: number | null;
  firstName: string;
  roleName: string;
  now: Date;
  skillName: (id: string) => string;
  /** "skills" = the fallback: no per-source detail. */
  mode?: Explanation["mode"];
  /** The stored-score adjustment (0..1) taken at the first explanation, from `readiness_explanations`. */
  anchor?: { adjustment: number } | null;
}

interface Player {
  key: string;
  kind: SourceKind;
  label: string;
  detail: string;
  origin?: string;
  url?: string;
  createdAt?: string;
  belowBar?: { level: number; confidence: number };
  /** The player's value for this skill now (already capped at the node's coverage). */
  value: number;
  /** Its value at an earlier time t (0 if it didn't exist yet). */
  valueAt: (t: Date) => number;
}

interface SkillGame { node: BridgeNode; weight: number; coverage: number; players: Player[] }

const pts = (x: number) => Math.round(x * 10000) / 100; // 0..1 share → points, 2 dp

const SOURCE_LABEL: Record<string, string> = {
  github: "GitHub", "keystone-pod": "pod PR", "micro-challenge": "micro-challenge", "keystone-interview": "mock interview",
  certificate: "certificate", leetcode: "LeetCode", codeforces: "Codeforces", stackoverflow: "Stack Overflow",
  kaggle: "Kaggle", "linkedin-pdf": "CV",
};
const GROUP_LABEL: Record<string, string> = {
  github: "GitHub evidence", "keystone-pod": "Pod pull requests", "micro-challenge": "Micro-challenges",
  "keystone-interview": "Mock interviews", certificate: "Certificates",
};

function evidenceLabel(e: EvidenceItem, skill: string): string {
  const src = SOURCE_LABEL[e.source] ?? e.source;
  return e.source === "github" ? `${skill} on GitHub` : `${skill} ${src}`;
}

const validDate = (s?: string) => (s && Number.isFinite(Date.parse(s)) ? new Date(s) : null);

function buildGames(i: ExplainInput): SkillGame[] {
  const role = i.map.nodes.filter((n) => n.demand > 0);
  const total = role.reduce((a, n) => a + n.demand, 0);
  if (!total) return [];
  const byId = new Map(i.evidence.map((e) => [e.id, e]));
  const modulesBySkill = new Map<string, Programme["modules"]>();
  for (const m of i.programme?.modules ?? []) for (const s of m.skills) modulesBySkill.set(s.skillId, [...(modulesBySkill.get(s.skillId) ?? []), m]);
  const moduleByCode = new Map((i.programme?.modules ?? []).map((m) => [m.code, m]));
  const detailOnly = i.mode === "skills";

  return role.map((node) => {
    const coverage = COVERAGE[node.status] ?? 0;
    const DONE = COVERAGE["degree-done"];
    const UPCOMING = COVERAGE["degree-upcoming"];
    const cap = (v: number) => Math.min(v, coverage);
    const skill = node.name || i.skillName(node.skillId);
    const players: Player[] = [];
    if (!detailOnly) {
      // Evidence: the node's linked ids plus any of the student's evidence for the skill.
      const ev = new Map<string, EvidenceItem>();
      for (const id of node.evidenceIds ?? []) { const e = byId.get(id); if (e && e.skillId === node.skillId) ev.set(e.id, e); }
      for (const e of i.evidence) if (e.skillId === node.skillId && (!e.userId || e.userId === i.map.userId)) ev.set(e.id, e);
      for (const e of ev.values()) {
        const proof = isProof(e);
        const value = cap(proof ? COVERAGE.proven : 0);
        const at = validDate(e.createdAt);
        players.push({
          key: `ev:${e.id}`, kind: "evidence", label: evidenceLabel(e, skill), detail: e.quote || e.url, origin: e.source,
          url: e.url, createdAt: e.createdAt, value,
          ...(proof ? {} : { belowBar: { level: e.level, confidence: e.confidence } }),
          valueAt: (t) => (!at || at.getTime() <= t.getTime() ? value : 0),
        });
      }
      // Degree modules: the ones the map links, plus every module in the programme that teaches the skill.
      const codes = new Set([...(node.moduleCodes ?? []), ...(modulesBySkill.get(node.skillId) ?? []).map((m) => m.code)]);
      for (const code of codes) {
        const m = moduleByCode.get(code);
        const linked = (node.moduleCodes ?? []).includes(code);
        let raw: number;
        if (linked && node.status === "degree-done") raw = DONE;
        else if (linked && node.status === "degree-upcoming") raw = UPCOMING;
        else if (m && i.startedAt) raw = isTermDone(m, i.startedAt, i.now) ? DONE : UPCOMING;
        else raw = UPCOMING;
        const value = cap(raw);
        const ended = m && i.startedAt ? termEnd(m, i.startedAt) : null;
        const term = (m ? upcomingLabel(m) : node.upcomingLabel)?.replace(/\s*·\s*/g, ", ");
        players.push({
          key: `mod:${code}`, kind: "module", label: m ? `${code} ${m.title}` : code,
          detail: raw >= DONE
            ? `Done${term ? ` (${term})` : ""}: counts ${Math.round(DONE * 100)}% of a skill it teaches`
            : `${term ?? "Later in your degree"}: counts ${Math.round(UPCOMING * 100)}% until you've taken it`,
          origin: term, value,
          // A module whose term ended inside the window counted as upcoming before that date.
          valueAt: (t) => (raw >= DONE && ended && ended.getTime() > t.getTime() && ended.getTime() <= i.now.getTime() ? cap(UPCOMING) : value),
        });
      }
    }
    const best = players.reduce((m, p) => Math.max(m, p.value), 0);
    if (coverage - best > EPS) {
      players.push({
        key: `rec:${node.skillId}`, kind: "record", label: `${skill} (recorded)`,
        detail: detailOnly
          ? `${skill} as your Bridge Map records it`
          : node.status === "proven"
            ? `Proven on your Bridge Map without linked proof at level 2: link a repo or a pod PR to back it up`
            : `On your Bridge Map as ${node.status.replace("-", " ")} without a linked module`,
        value: coverage, valueAt: () => coverage,
      });
    }
    return { node, weight: node.demand / total, coverage, players };
  });
}

/** Shapley shares (as 0..1 coverage) for one game at one moment, closed form plus the enumeration check. */
function solve(values: number[]): { phi: number[]; loo: number[]; coalitions: number; gap: number } {
  const k = values.length;
  const phi = shapleyMaxClosedForm(values);
  const game = maxGame(values);
  let gap = 0;
  let coalitions = 0;
  if (k <= MAX_ENUMERATED_PLAYERS) {
    const exact = shapleyExact(k, game);
    coalitions = 2 ** k;
    for (let j = 0; j < k; j++) gap = Math.max(gap, Math.abs(exact[j] - phi[j]));
  }
  const loo = k <= 30 ? leaveOneOut(k, game) : values.map(() => 0);
  return { phi, loo, coalitions, gap };
}

function contributionsAt(games: SkillGame[], t: Date | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of games) {
    const values = g.players.map((p) => (t ? p.valueAt(t) : p.value));
    const phi = shapleyMaxClosedForm(values);
    g.players.forEach((p, j) => out.set(p.key, (out.get(p.key) ?? 0) + g.weight * phi[j]));
  }
  return out;
}

const readinessAt = (games: SkillGame[], t: Date) =>
  games.reduce((a, g) => a + g.weight * g.players.reduce((m, p) => Math.max(m, p.valueAt(t)), 0), 0);

const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const fmt2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

function adjustmentNote(headline: number, mapped: number, skills: number): string | null {
  const d = (headline - mapped) * 100;
  if (Math.abs(d) < 0.05) return null;
  return `Your Bridge Map stores ${fmt2(headline * 100)} points, and the readiness formula over its ${skills} skills gives ${fmt2(mapped * 100)}. `
    + `The ${fmt2(Math.abs(d))}-point difference is in the stored score itself: it was set when the map was seeded, or rounded to two decimals when a proof moved it. No source earns it, so it gets no share.`;
}

export function explainReadiness(i: ExplainInput): Explanation {
  const games = buildGames(i);
  const headline = i.map.readinessNow ?? 0;
  const mapped = games.reduce((a, g) => a + g.weight * g.coverage, 0);
  const adjustment = headline - mapped;
  const anchored = i.anchor && Number.isFinite(i.anchor.adjustment) && Math.abs(i.anchor.adjustment - adjustment) <= ANCHOR_MAX_DRIFT;
  const history = anchored ? i.anchor!.adjustment : adjustment;
  const drift = adjustment - history;

  // ---------- Shapley per skill, then per source ----------
  const acc = new Map<string, Contributor & { _p: number; _l: number }>();
  const skills: SkillShare[] = [];
  let coalitions = 0;
  let closedFormGap = 0;
  for (const g of games) {
    const { phi, loo, coalitions: c, gap } = solve(g.players.map((p) => p.value));
    coalitions += c;
    closedFormGap = Math.max(closedFormGap, gap);
    const shares: SkillShare["shares"] = [];
    g.players.forEach((p, j) => {
      const share = g.weight * phi[j];
      const marginal = g.weight * loo[j];
      const cur = acc.get(p.key) ?? {
        id: p.key, kind: p.kind, label: p.label, detail: p.detail, points: 0, leaveOneOut: 0, skills: [], _p: 0, _l: 0,
        ...(p.origin ? { origin: p.origin } : {}), ...(p.url ? { url: p.url } : {}), ...(p.createdAt ? { createdAt: p.createdAt } : {}),
        ...(p.belowBar ? { belowBar: p.belowBar } : {}),
      };
      cur._p += share;
      cur._l += marginal;
      cur.skills.push({ skillId: g.node.skillId, name: g.node.name || i.skillName(g.node.skillId), points: pts(share) });
      acc.set(p.key, cur);
      shares.push({ contributorId: p.key, label: p.label, kind: p.kind, points: pts(share) });
    });
    skills.push({
      skillId: g.node.skillId, name: g.node.name || i.skillName(g.node.skillId), status: g.node.status,
      demandPct: Math.round(g.node.demand * 100), maxPoints: pts(g.weight), points: pts(g.weight * g.coverage),
      shares: shares.sort((a, b) => b.points - a.points), coalitions: c,
    });
  }
  const contributors: Contributor[] = [...acc.values()]
    .map(({ _p, _l, ...c }) => ({ ...c, points: pts(_p), leaveOneOut: pts(_l), skills: c.skills.filter((s) => s.points > 0 || c.belowBar) }))
    .filter((c) => c.points > 0 || c.belowBar)
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label));
  const efficiencyGap = Math.abs([...acc.values()].reduce((a, c) => a + c._p, 0) - mapped) * 100;
  skills.sort((a, b) => b.points - a.points || b.maxPoints - a.maxPoints);

  // ---------- groups ----------
  const groupMap = new Map<string, { kind: SourceKind; label: string; points: number; count: number }>();
  for (const c of contributors) {
    const key = c.kind === "evidence" ? `evidence:${c.origin ?? "other"}` : c.kind;
    const label = c.kind === "evidence" ? GROUP_LABEL[c.origin ?? ""] ?? `${SOURCE_LABEL[c.origin ?? ""] ?? "Other"} evidence`
      : c.kind === "module" ? "Degree modules" : "Recorded skills";
    const g = groupMap.get(key) ?? { kind: c.kind, label, points: 0, count: 0 };
    g.points += c.points;
    g.count += 1;
    groupMap.set(key, g);
  }
  const groups = [...groupMap.values()].map((g) => ({ ...g, points: Math.round(g.points * 100) / 100 })).sort((a, b) => b.points - a.points);

  // ---------- week over week, and a 6-week replay from evidence dates and term ends ----------
  // Past weeks: the formula at that date plus the anchored adjustment. Now: the stored score itself.
  const since = new Date(i.now.getTime() - WEEK_MS);
  const timeline = Array.from({ length: TIMELINE_WEEKS }, (_, k) => {
    const back = TIMELINE_WEEKS - 1 - k;
    const t = new Date(i.now.getTime() - back * WEEK_MS);
    return { weekOf: t.toISOString().slice(0, 10), points: pts(back === 0 ? headline : readinessAt(games, t) + history) };
  });
  const fromPoints = pts(readinessAt(games, since) + history);
  const toPoints = pts(headline);
  const before = contributionsAt(games, since);
  const after = contributionsAt(games, null);
  const movers: Mover[] = [...new Set([...before.keys(), ...after.keys()])]
    .map((key) => ({ key, d: (after.get(key) ?? 0) - (before.get(key) ?? 0) }))
    .concat(Math.abs(drift) >= 0.0005 ? [{ key: "adjustment", d: drift }] : [])
    .filter((m) => Math.abs(m.d) >= 0.0005)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 6)
    .map((m): Mover => {
      if (m.key === "adjustment") return { contributorId: "adjustment", label: "Rounding of your stored score", kind: "adjustment", points: pts(m.d) };
      const c = acc.get(m.key);
      return { contributorId: m.key, label: c?.label ?? m.key, kind: c?.kind ?? "evidence", points: pts(m.d) };
    });
  const deltaPoints = Math.round((toPoints - fromPoints) * 100) / 100;
  let lastChange: Explanation["week"]["lastChange"] = null;
  for (let k = timeline.length - 1; k > 0; k--) {
    const d = timeline[k].points - timeline[k - 1].points;
    if (Math.abs(d) >= 0.05) { lastChange = { weekOf: timeline[k].weekOf, deltaPoints: Math.round(d * 100) / 100 }; break; }
  }

  // ---------- the best next proof: marginal readiness per hour ----------
  const gameBySkill = new Map(games.map((g) => [g.node.skillId, g]));
  const gainFor = (skillId: string, value: number) => {
    const g = gameBySkill.get(skillId);
    return g ? pts(g.weight * Math.max(0, Math.max(g.coverage, value) - g.coverage)) : 0;
  };
  const whyFor = (g: SkillGame, gain: number): string => {
    const skill = g.node.name || i.skillName(g.node.skillId);
    const mod = g.players.filter((p) => p.kind === "module").sort((a, b) => b.value - a.value)[0];
    if (g.node.status === "gap") return `No module covers ${skill}, so a proof adds its full weight: ${Math.round(g.node.demand * 100)}% of ${i.roleName} ads, +${fmt(gain)} points.`;
    const has = Math.round(g.coverage * 100);
    if (g.node.status === "degree-upcoming") return `${mod ? mod.label.split(" ")[0] : "Your degree"} already counts ${has}% of ${skill}; a proof now adds the other ${100 - has}%, +${fmt(gain)} points.`;
    if (g.node.status === "degree-done") return `${mod ? mod.label.split(" ")[0] : "A module you've done"} counts ${has}% of ${skill}; a proof adds the last ${100 - has}%, +${fmt(gain)} points.`;
    return `${skill} is already proven.`;
  };
  const actions: NextAction[] = [];
  const seen = new Set<string>();
  for (const w of i.roadmap?.weeks ?? []) {
    if (seen.has(w.focusSkillId)) continue;
    const g = gameBySkill.get(w.focusSkillId);
    if (!g || g.coverage >= 1) continue;
    seen.add(w.focusSkillId);
    const weeks = (i.roadmap?.weeks ?? []).filter((x) => x.focusSkillId === w.focusSkillId);
    const hours = weeks.flatMap((x) => x.tasks).filter((t) => !t.done).reduce((a, t) => a + (Number.isFinite(t.hours) ? t.hours : 0), 0);
    const gain = gainFor(w.focusSkillId, 1);
    if (gain <= 0) continue;
    const skill = g.node.name || i.skillName(w.focusSkillId);
    actions.push({
      id: `rm:${w.focusSkillId}`, kind: "roadmap", skillId: w.focusSkillId, skillName: skill, title: w.proof, hours,
      gainPoints: gain, pointsPerHour: Math.round((hours > 0 ? gain / hours : gain) * 100) / 100, rung: "Built it",
      href: `/roadmap#skill-${w.focusSkillId}`, why: whyFor(g, gain), week: w.week,
    });
  }
  const tried = new Set(i.evidence.filter((e) => e.source === "micro-challenge").map((e) => e.skillId));
  for (const ch of i.challenges) {
    const g = gameBySkill.get(ch.skillId);
    if (!g || g.coverage >= 1 || tried.has(ch.skillId) || actions.some((a) => a.id === `ch:${ch.skillId}`)) continue;
    const hours = Math.round((ch.minutes / 60) * 100) / 100;
    const gain = gainFor(ch.skillId, isProof(CHALLENGE_EVIDENCE) ? 1 : 0);
    const skill = g.node.name || i.skillName(ch.skillId);
    actions.push({
      id: `ch:${ch.skillId}`, kind: "challenge", skillId: ch.skillId, skillName: skill, title: ch.title, hours, gainPoints: gain,
      pointsPerHour: Math.round((gain / Math.max(hours, EPS)) * 100) / 100, rung: "Tried it", href: `/challenge?skill=${encodeURIComponent(ch.skillId)}`,
      why: gain > 0 ? whyFor(g, gain) : `A ${ch.minutes}-minute micro-challenge proves rung 1 (level 1), and readiness only counts level 2 proof, so it adds 0 points today. It's the quick way in before the pod PR.`,
    });
  }
  actions.sort((a, b) => b.pointsPerHour - a.pointsPerHour || b.gainPoints - a.gainPoints || (a.week ?? 99) - (b.week ?? 99));
  const best = actions.find((a) => a.gainPoints > 0) ?? null;
  const firstStep = best ? actions.find((a) => a.kind === "challenge" && a.skillId === best.skillId) ?? null : null;
  // Show the six best paying proofs, plus up to two rung-1 challenges for those same skills (honestly at 0 points).
  const paying = actions.filter((a) => a.gainPoints > 0).slice(0, 6);
  const payingSkills = new Set(paying.map((a) => a.skillId));
  const shown = [...paying, ...actions.filter((a) => a.gainPoints === 0 && payingSkills.has(a.skillId)).slice(0, 2)];

  // ---------- insights (plain sentences, real numbers only) ----------
  const insights: string[] = [];
  const overlap = contributors
    .filter((c) => c.kind === "evidence" && c.points - c.leaveOneOut >= 0.1)
    .sort((a, b) => b.points - b.leaveOneOut - (a.points - a.leaveOneOut))[0];
  if (overlap) {
    const skill = overlap.skills[0];
    const partner = skills.find((s) => s.skillId === skill?.skillId)?.shares.find((s) => s.contributorId !== overlap.id && s.points > 0);
    insights.push(`${overlap.label} earns ${fmt(overlap.points)} points, but only ${fmt(overlap.leaveOneOut)} are its alone: ${partner ? partner.label : "another source"} would still cover part of ${skill?.name ?? "that skill"} without it.`);
  }
  const weak = contributors.find((c) => c.belowBar);
  if (weak?.belowBar) {
    insights.push(`${weak.label} counts 0 points for now: readiness needs level ${PROOF_LEVEL} at ${Math.round(PROOF_CONFIDENCE * 100)}% confidence, and it's level ${weak.belowBar.level} at ${Math.round(weak.belowBar.confidence * 100)}%.`);
  }
  const topModule = contributors.find((c) => c.kind === "module");
  if (topModule) insights.push(`${topModule.label} is worth ${fmt(topModule.points)} points across ${topModule.skills.length} ${topModule.skills.length === 1 ? "skill" : "skills"} before you write a line of code.`);
  if (firstStep && best) {
    insights.push(`The ${firstStep.skillName} micro-challenge adds 0 readiness points on its own (it proves level 1), but it's a ${Math.round(firstStep.hours * 60)}-minute way into the ${best.skillName} proof that adds ${fmt(best.gainPoints)}.`);
  }

  const proofPlayers = games.reduce((a, g) => a + g.players.length, 0);
  return {
    userId: i.map.userId, roleId: i.map.roleId, roleName: i.roleName, firstName: i.firstName, generatedAt: i.now.toISOString(),
    mode: i.mode ?? "full",
    readiness: {
      now: headline, projected: i.map.readinessProjected ?? headline, mappedPoints: pts(mapped), adjustmentPoints: pts(adjustment),
      adjustmentNote: adjustmentNote(headline, mapped, games.length), historyAdjustment: history,
    },
    contributors, skills, groups,
    week: { since: since.toISOString(), fromPoints, toPoints, deltaPoints, movers, lastChange },
    timeline,
    next: { best, firstStep, actions: shown, hoursPerWeek: i.hoursPerWeek ?? null },
    insights: insights.slice(0, 4),
    checks: { players: proofPlayers, coalitions, efficiencyGap: round3(efficiencyGap), closedFormGap },
  };
}
