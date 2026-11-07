import "server-only";
// Live Lab Pulse: the deterministic cohort simulation used in DEMO_MODE (and whenever a lecturer asks for it).
// Each seeded student works through the real micro-challenge. Their file at any minute is the challenge's sample
// answer with one authored misconception per unmet criterion (data/fixtures/labs/pulse.json), and every
// submission is graded by the challenge's own rules (gradeWithRules), so the board's numbers come from the
// real grader. Students who have proven the skill on their Proof Ladder move faster; a lecturer's intervention
// pulls forward the fix for students who hadn't got there yet.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { gradeWithRules, loadChallengeFixtures } from "@/lib/agents/challenges";
import type { Challenge } from "@/components/challenge/model";
import type { CriterionMeta, PulseAttempt } from "./aggregate";
import type { Intervention, InterventionKind } from "./model";

const MutationZ = z.object({ find: z.string().min(1), replace: z.string() });
const PackZ = z.object({
  challengeId: z.string(),
  concepts: z.record(z.string(), z.string()),
  difficulty: z.record(z.string(), z.object({ meanMin: z.number().positive(), neverP: z.number().min(0).max(1) })),
  breaks: z.record(z.string(), z.object({ p: z.number().min(0).max(1), forMin: z.number().positive() })).default({}),
  mutations: z.record(z.string(), z.array(MutationZ)),
  explainers: z.record(z.string(), z.array(z.string().min(1))),
});
const FileZ = z.object({ defaultChallengeId: z.string(), packs: z.array(z.unknown()) });
export type PulsePack = z.infer<typeof PackZ>;

export const DEFAULT_CHALLENGE_ID = "ch_docker_01";
let cache: { defaultChallengeId: string; packs: PulsePack[] } | null = null;

export function applyMutations(src: string, muts: { find: string; replace: string }[]): string {
  return muts.reduce((s, m) => (s.includes(m.find) ? s.replace(m.find, m.replace) : s), src);
}

/**
 * Packs from data/fixtures/labs/pulse.json, self-checked against the real grader: a mutation is kept only if
 * applying it to the sample answer makes gradeWithRules report its criterion as unmet. Unknown challenges are dropped.
 */
export function loadPulsePacks(): { defaultChallengeId: string; packs: PulsePack[] } {
  if (cache) return cache;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/labs/pulse.json"), "utf8"));
  } catch {
    raw = undefined;
  }
  const file = FileZ.safeParse(raw);
  const challenges = loadChallengeFixtures();
  const packs = (file.success ? file.data.packs : []).flatMap((p) => {
    const parsed = PackZ.safeParse(p);
    if (!parsed.success) return [];
    const ch = challenges.find((c) => c.id === parsed.data.challengeId);
    if (!ch) return [];
    const mutations: PulsePack["mutations"] = {};
    for (const [id, muts] of Object.entries(parsed.data.mutations)) {
      const g = gradeWithRules(ch, applyMutations(ch.sampleAnswer, muts));
      const r = [...g.rubric, ...g.checks].find((x) => x.id === id);
      if (r && !r.met) mutations[id] = muts;
    }
    return [{ ...parsed.data, mutations }];
  });
  cache = { defaultChallengeId: file.success ? file.data.defaultChallengeId : DEFAULT_CHALLENGE_ID, packs };
  return cache;
}

export function findPack(challengeId: string): { pack: PulsePack; challenge: Challenge } | null {
  const pack = loadPulsePacks().packs.find((p) => p.challengeId === challengeId);
  const challenge = loadChallengeFixtures().find((c) => c.id === challengeId);
  return pack && challenge ? { pack, challenge } : null;
}

export function criterionMetas(ch: Challenge, pack: PulsePack | null): CriterionMeta[] {
  const meta = (kind: "rubric" | "check") => (c: Challenge["rubric"][number]): CriterionMeta => ({
    id: c.id, title: c.title, kind, description: c.description, hint: c.hint,
    concept: pack?.concepts[c.id] ?? c.title.toLowerCase(),
  });
  return [...ch.rubric.map(meta("rubric")), ...ch.checks.map(meta("check"))];
}

// ---------- deterministic randomness ----------

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** mulberry32: a tiny seeded PRNG, so the same seed always gives the same lab. */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How a room responds: the share who then fix it, how long the intervention takes (nobody checks meanwhile), and the spread after. */
const RESPONSE: Record<InterventionKind, { p: number; delay: number; spread: number }> = {
  explain: { p: 0.85, delay: 3, spread: 1.5 },
  peer: { p: 0.75, delay: 2, spread: 2 },
  nudge: { p: 0.5, delay: 0, spread: 3 },
};

/** What the simulation knows about a student: only whether they have proven the challenge's skill, or list it as a gap. */
export type SimStudent = { skill: "proven" | "gap" | "neutral" };

export interface SimulateInput {
  seed: string;
  challenge: Challenge;
  pack: PulsePack;
  students: SimStudent[];
  labMinutes: number;
  interventions: Intervention[];
}

const memo = new Map<string, { attempts: PulseAttempt[] }>();

/** Every graded submission of the simulated lab. Deterministic in (seed, students, interventions). */
export function simulateAttempts(input: SimulateInput): PulseAttempt[] {
  const { challenge: ch, pack, students, labMinutes } = input;
  const runs = input.interventions.filter((i) => i.decision === "run");
  const key = JSON.stringify([input.seed, ch.id, labMinutes, students.map((s) => s.skill), runs.map((i) => [i.criterionId, i.kind, i.minute])]);
  const hit = memo.get(key);
  if (hit) return hit.attempts;

  const rubricIds = ch.rubric.map((c) => c.id);
  const attempts: PulseAttempt[] = [];
  students.forEach((st, idx) => {
    const r = rng(`${input.seed}:${ch.id}:s${idx}`);
    const speed = st.skill === "proven" ? 0.55 : st.skill === "gap" ? 1.25 : 1;
    const neverScale = st.skill === "proven" ? 0.25 : 1;
    const fixAt = new Map<string, number>();
    for (const id of rubricIds) {
      const d = pack.difficulty[id] ?? { meanMin: 4, neverP: 0.1 };
      const never = r() < d.neverP * neverScale;
      const t = 1 + d.meanMin * speed * (0.6 + 0.8 * r());
      fixAt.set(id, never ? Number.POSITIVE_INFINITY : t);
    }
    const broken: { id: string; from: number; to: number }[] = [];
    for (const [id, b] of Object.entries(pack.breaks)) {
      if (r() < b.p) {
        const from = 2.5 + r() * 8;
        broken.push({ id, from, to: from + b.forMin * (0.7 + 0.6 * r()) });
      }
    }
    for (const i of runs) {
      const resp = RESPONSE[i.kind];
      const ri = rng(`${input.seed}:${ch.id}:s${idx}:${i.criterionId}:${i.minute}`);
      const current = fixAt.get(i.criterionId);
      if (current !== undefined && current > i.minute && ri() < resp.p) {
        fixAt.set(i.criterionId, Math.min(current, i.minute + resp.delay + resp.spread * ri()));
      }
    }

    let t = 1 + 2.5 * r();
    while (t <= labMinutes) {
      // While the lecturer explains (or pairs discuss), nobody presses Check.
      const busy = runs.find((i) => t >= i.minute && t < i.minute + RESPONSE[i.kind].delay);
      if (busy) t = busy.minute + RESPONSE[busy.kind].delay + 0.3 + r();
      if (t > labMinutes) break;
      const unmet = [
        ...rubricIds.filter((id) => (fixAt.get(id) ?? 0) > t),
        ...broken.filter((b) => b.from <= t && t < b.to).map((b) => b.id),
      ];
      const submission = applyMutations(ch.sampleAnswer, unmet.flatMap((id) => pack.mutations[id] ?? []));
      const g = gradeWithRules(ch, submission);
      const met = [...g.rubric, ...g.checks].filter((x) => x.met).map((x) => x.id);
      attempts.push({ student: idx, minute: Math.round(t * 10) / 10, met, passed: g.passed });
      if (met.length === ch.rubric.length + ch.checks.length) break;
      t += 1 + 1.5 * r();
    }
  });
  if (memo.size > 200) memo.clear();
  memo.set(key, { attempts });
  return attempts;
}
