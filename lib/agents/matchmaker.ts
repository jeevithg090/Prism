import "server-only";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { newRunId } from "@/lib/agents/events";
import { noDemographicSignals } from "@/lib/agents/guardrails";
import { runAgent, type AgentCtx } from "@/lib/agents/harness";
import { loadGraph } from "@/lib/graph/build";
import { cosine, embed, llmJSON } from "@/lib/llm";
import { MatchExplanationZ, PodZ, StudentSkillsZ, skillName, type StudentSkills } from "@/lib/schemas/community";
import { getStore } from "@/lib/store";
import type { BadgeId, BridgeMap, MatchExplanation, Pod, PodMember, Profile, SkillId } from "@/lib/types";

// P5 · Matchmaker: complementary study pods (peer learning, learning by teaching).
// The algorithm is deterministic and pure; only the explanation polish uses the LLM.
// Matching never uses demographic fields: only skills, interests, availability, direction,
// and the near-peer mix (a newcomer plus someone in year 2 or later).
// Governed by the agent harness: candidates are minimised before scoring (only the tenure badge
// survives) and the noDemographicSignals guardrail verifies it on every run.

export type CandidateSkills = {
  userId: string;
  proven: SkillId[];
  gaps: SkillId[];
  interests: string[];
  availability: string[];
  badges: BadgeId[];
  year: number;
  /** Primary target role (profile.dna.targetRoles[0]); used by the `direction` term. */
  targetRole?: string;
  /** Display name for explanations and progress events. */
  name?: string;
};

export type InterestSim = (a: CandidateSkills, b: CandidateSkills) => number;
export type ScoreOpts = { interestSim?: InterestSim };

/** Thrown when the user has no profile; routes map it to 404 `not_found`. */
export class NotFoundError extends Error {
  readonly code = "not_found";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export const WEIGHTS = { coverage: 0.45, interest: 0.15, direction: 0.15, avail: 0.1, mix: 0.1, redundancy: 0.15 } as const;
const MAX_GAPS = 8;
const TOP_N = 3;
const MIN_POD = 3;
const MAX_POD = 4;
const EPS = 1e-9;

// ---------- small helpers ----------
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
const byUserId = (a: CandidateSkills, b: CandidateSkills) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

function jaccard<T>(a: Iterable<T>, b: Iterable<T>): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function pairs<T>(xs: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
}

const interestWords = (interests: string[]): string[] => interests.join(" ").toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Jaccard of the lowercase interest word sets (DEMO_MODE / embedding fallback). */
export const interestJaccard: InterestSim = (a, b) => jaccard(interestWords(a.interests), interestWords(b.interests));

// ---------- scoring ----------
export type ScoreParts = { coverage: number; interest: number; direction: number; avail: number; mix: number; redundancy: number };

export function scoreParts(members: CandidateSkills[], opts?: ScoreOpts): ScoreParts {
  const sim = opts?.interestSim ?? interestJaccard;
  const ps = pairs(members);
  const coverage = mean(
    members.map((m, i) => {
      const othersProven = new Set(members.flatMap((o, j) => (j === i ? [] : o.proven)));
      const gaps = uniq(m.gaps);
      return gaps.filter((g) => othersProven.has(g)).length / Math.max(1, gaps.length);
    }),
  );
  const interest = mean(ps.map(([a, b]) => clamp01(sim(a, b))));
  const direction = mean(ps.map(([a, b]) => (a.targetRole && a.targetRole === b.targetRole ? 1 : 0)));
  let common = members.length ? new Set(members[0].availability) : new Set<string>();
  for (const m of members.slice(1)) common = new Set(m.availability.filter((s) => common.has(s)));
  const avail = common.size > 0 ? 1 : 0;
  const redundancy = mean(ps.map(([a, b]) => jaccard(a.proven, b.proven)));
  const mix = members.some((m, i) => m.badges.includes("new-to-uni") && members.some((o, j) => j !== i && o.year >= 2)) ? 1 : 0;
  return { coverage, interest, direction, avail, mix, redundancy };
}

function rawScore(members: CandidateSkills[], opts?: ScoreOpts): number {
  const p = scoreParts(members, opts);
  return (
    WEIGHTS.coverage * p.coverage +
    WEIGHTS.interest * p.interest +
    WEIGHTS.direction * p.direction +
    WEIGHTS.avail * p.avail +
    WEIGHTS.mix * p.mix -
    WEIGHTS.redundancy * p.redundancy
  );
}

/** 0.45·coverage + 0.15·interest + 0.15·direction + 0.10·avail + 0.10·mix − 0.15·redundancy, clamped to [0,1], 2 decimals. */
export function scoreTeam(members: CandidateSkills[], opts?: ScoreOpts): number {
  if (!members.length) return 0;
  return round2(clamp01(rawScore(members, opts)));
}

/**
 * Greedy pod: best partner for the user, then keep adding whoever raises the score most
 * until 4 members (always at least 3 when enough candidates exist). Ties go to the
 * alphabetically first userId. Comparisons use the unrounded score.
 */
export function greedyPod(user: CandidateSkills, candidates: CandidateSkills[], opts?: ScoreOpts): CandidateSkills[] {
  const pool = candidates.filter((c) => c.userId !== user.userId).sort(byUserId);
  const team: CandidateSkills[] = [user];
  while (team.length < MAX_POD) {
    let best: { c: CandidateSkills; s: number } | null = null;
    for (const c of pool) {
      if (team.some((t) => t.userId === c.userId)) continue;
      const s = rawScore([...team, c], opts);
      if (!best || s > best.s + EPS) best = { c, s };
    }
    if (!best) break;
    if (team.length >= MIN_POD && best.s <= rawScore(team, opts) + EPS) break;
    team.push(best.c);
  }
  return team;
}

// ---------- learns / teaches / role ----------
export type MemberSkills = { userId: string; learns: SkillId[]; teaches: SkillId[] };

/** learns = gaps covered by teammates (gap order), teaches = proven skills teammates need (most-needed first); top 3 each. */
export function learnsTeaches(team: CandidateSkills[]): MemberSkills[] {
  return team.map((m, i) => {
    const others = team.filter((_, j) => j !== i);
    const othersProven = new Set(others.flatMap((o) => o.proven));
    const learns = uniq(m.gaps).filter((g) => othersProven.has(g)).slice(0, TOP_N);
    const need = (s: SkillId) => others.filter((o) => o.gaps.includes(s)).length;
    const teaches = uniq(m.proven)
      .map((s, idx) => ({ s, idx, n: need(s) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.idx - b.idx)
      .slice(0, TOP_N)
      .map((x) => x.s);
    return { userId: m.userId, learns, teaches };
  });
}

/** "Learns Docker · Teaches Python" */
export function roleLabel(learns: SkillId[], teaches: SkillId[]): string {
  const parts = [learns[0] && `Learns ${skillName(learns[0])}`, teaches[0] && `Teaches ${skillName(teaches[0])}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Pod member";
}

// ---------- explanations ----------
const capitalise = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id);
const firstName = (id: string, names: Record<string, string>) => (names[id] ?? capitalise(id)).trim().split(/\s+/)[0] || capitalise(id);

function skillList(ids: SkillId[]): string {
  const n = ids.map(skillName);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** Skills `a` can review for `b`, in b's learning order. */
const gives = (a: MemberSkills, b: MemberSkills) => b.learns.filter((s) => a.teaches.includes(s));

/**
 * Template lines from the viewpoint of `userId` ("Priya reviews your Docker; you review Priya's Python.").
 * Handles one-directional exchanges; members with no exchange with the user get one third-person line
 * with another teammate so everyone in the pod is explained.
 */
export function templateExplanations(userId: string, members: MemberSkills[], names: Record<string, string>): MatchExplanation[] {
  const me = members.find((m) => m.userId === userId);
  const lines: MatchExplanation[] = [];
  if (!me) return lines;
  const others = members.filter((m) => m.userId !== userId);
  const uncovered: MemberSkills[] = [];
  let oneWay = 0;
  for (const b of others) {
    const B = firstName(b.userId, names);
    const theyReview = gives(b, me); // b reviews my work
    const iReview = gives(me, b); // I review b's work
    let text: string | null = null;
    if (theyReview.length && iReview.length) {
      text = `${B} reviews your ${skillList(theyReview)}; you review ${B}'s ${skillList(iReview)}.`;
    } else if (theyReview.length) {
      text =
        oneWay++ % 2 === 0
          ? `${B} reviews your ${skillList(theyReview)} work, so you learn from someone a step ahead.`
          : `${B} reviews your ${skillList(theyReview)}; you pair up on the project and learn by doing.`;
    } else if (iReview.length) {
      text = `You review ${B}'s ${skillList(iReview)}; teaching it is the fastest way to lock it in.`;
    }
    if (text) lines.push({ fromUserId: userId, toUserId: b.userId, text });
    else uncovered.push(b);
  }
  for (const c of uncovered) {
    for (const d of others) {
      if (d.userId === c.userId) continue;
      const cGives = gives(c, d);
      const dGives = gives(d, c);
      if (!cGives.length && !dGives.length) continue;
      const C = firstName(c.userId, names);
      const D = firstName(d.userId, names);
      const text =
        cGives.length && dGives.length
          ? `${C} reviews ${D}'s ${skillList(cGives)}; ${D} reviews ${C}'s ${skillList(dGives)}.`
          : cGives.length
            ? `${C} reviews ${D}'s ${skillList(cGives)} and learns by teaching.`
            : `${D} reviews ${C}'s ${skillList(dGives)} and learns by teaching.`;
      lines.push({ fromUserId: c.userId, toUserId: d.userId, text });
      break;
    }
  }
  return lines;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, name: string) => new RegExp(`(^|[^A-Za-z0-9+#])${escapeRe(name)}($|[^A-Za-z0-9+#])`, "i").test(text);

const PolishZ = z.object({ lines: z.array(MatchExplanationZ) });

/** One optional llmJSON call; any failure (or a line that drops a skill) keeps the template text. */
export async function polishExplanations(lines: MatchExplanation[], members: MemberSkills[], runId?: string): Promise<MatchExplanation[]> {
  if (!lines.length) return lines;
  const skillNames = uniq(members.flatMap((m) => [...m.learns, ...m.teaches])).map(skillName);
  try {
    const out = await llmJSON({
      agent: "matchmaker",
      runId,
      system:
        "You polish short peer-learning explanations for university study pods (learning by teaching, near-peer mentoring). " +
        "Rewrite each line to be warm and specific, ≤ 14 words, keep the skills. Keep 'you' for the reader. " +
        "Keep fromUserId and toUserId unchanged. Never mention personal characteristics.",
      user: JSON.stringify({ lines }),
      schema: PolishZ,
      schemaName: "pod_explanations",
      temperature: 0.4,
    });
    return lines.map((t) => {
      const p = out.lines.find((l) => l.fromUserId === t.fromUserId && l.toUserId === t.toUserId);
      const text = p?.text.trim() ?? "";
      const keepsSkills = skillNames.filter((n) => mentions(t.text, n)).every((n) => mentions(text, n));
      return text && keepsSkills && text.split(/\s+/).length <= 30 ? { ...t, text } : t;
    });
  } catch {
    return lines;
  }
}

// ---------- naming ----------
const POD_NAMES = ["Comet", "Nova", "Aurora", "Orbit", "Pulsar", "Zenith", "Nebula", "Vega", "Lumen", "Atlas"];
/** Deterministic from the score: 0.82 → "Pod Aurora". */
export function podName(score: number): string {
  return `Pod ${POD_NAMES[Math.round(score * 100) % POD_NAMES.length]}`;
}

// ---------- candidates ----------
function fromProfile(profile: Profile, proven: SkillId[], gaps: SkillId[]): CandidateSkills {
  return {
    userId: profile.id,
    name: profile.name,
    proven: uniq(proven),
    gaps: uniq(gaps).slice(0, MAX_GAPS),
    interests: profile.interests ?? [],
    availability: profile.availability ?? [],
    badges: profile.badges ?? [],
    year: profile.year,
    targetRole: profile.dna?.targetRoles?.[0],
  };
}

/** Proven = `proven` nodes; gaps = role nodes (demand > 0) with status `gap`, by demand desc, top 8. */
export function buildCandidate(profile: Profile, map: Pick<BridgeMap, "nodes">): CandidateSkills {
  const nodes = [...map.nodes].sort((a, b) => b.demand - a.demand);
  return fromProfile(
    profile,
    nodes.filter((n) => n.status === "proven").map((n) => n.skillId),
    nodes.filter((n) => n.status === "gap" && n.demand > 0).map((n) => n.skillId),
  );
}

export function candidateFromSeed(profile: Profile, skills?: { proven: SkillId[]; gaps: SkillId[] }): CandidateSkills {
  return fromProfile(profile, skills?.proven ?? [], skills?.gaps ?? []);
}

function readJSON(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  } catch {
    return undefined;
  }
}

/** data/seed/student-skills.json, read at runtime ({} if missing or invalid). */
export function loadStudentSkills(): StudentSkills {
  const parsed = StudentSkillsZ.safeParse(readJSON("data/seed/student-skills.json"));
  return parsed.success ? parsed.data : {};
}

/** data/fixtures/pod.aisha.json (the DEMO_MODE safety net), or null. */
export function readDemoPod(): Pod | null {
  const parsed = PodZ.safeParse(readJSON("data/fixtures/pod.aisha.json"));
  return parsed.success ? parsed.data : null;
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

async function loadUserMap(userId: string, roleId: string): Promise<BridgeMap | null> {
  try {
    const m = await getStore().get<BridgeMap>("maps", `${userId}:${roleId}`);
    if (m?.nodes?.length) return m;
  } catch {
    /* fall through */
  }
  try {
    const m = await loadGraph(userId, roleId);
    if (m?.nodes?.length) return m;
  } catch {
    /* fall through */
  }
  if (!SAFE_ID.test(userId) || !SAFE_ID.test(roleId)) return null;
  const m = readJSON(`data/fixtures/bridgemap.${userId}.${roleId}.json`) as BridgeMap | undefined;
  return m?.nodes?.length ? m : null;
}

/** Cosine of embed(interests.join(", ")), computed once per run; Jaccard if embedding fails. */
async function embeddingSim(cands: CandidateSkills[]): Promise<InterestSim> {
  try {
    const withText = cands.filter((c) => c.interests.length > 0);
    const vecs = await embed(withText.map((c) => c.interests.join(", ")));
    if (!Array.isArray(vecs) || vecs.length !== withText.length) throw new Error("embedding count mismatch");
    const byId = new Map(withText.map((c, i) => [c.userId, vecs[i]]));
    return (a, b) => {
      const va = byId.get(a.userId);
      const vb = byId.get(b.userId);
      return va && vb ? cosine(va, vb) : 0;
    };
  } catch {
    return interestJaccard;
  }
}

// ---------- pods I/O (used by the routes) ----------
/** Pods whose members include `userId`, newest first. */
/** The seeded demo fixture pod. It stays reachable by id (and as the DEMO fallback), but it is not
 *  listed as anyone's pod, so the demo starts on "Find my pod" and the matchmaker forms the pod live. */
export const DEMO_FIXTURE_POD_ID = "pod_demo01";

export async function listPodsForUser(userId: string): Promise<Pod[]> {
  const store = getStore();
  const all = await store.list<Pod>("pods");
  // The demo pod counts as the user's own only once they've been matched into it.
  const claimed = new Set((await store.list<{ podId: string }>("pod_claims", { userId })).map((c) => c.podId));
  return all
    .map((p) => PodZ.safeParse(p))
    .flatMap((r) => (r.success ? [r.data] : []))
    .filter((p) => p.id !== DEMO_FIXTURE_POD_ID || claimed.has(p.id))
    .filter((p) => p.members.some((m) => m.userId === userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

// ---------- the agent ----------
/** Data minimisation: the scoring view keeps only the tenure badge (`new-to-uni`) for the near-peer mix rule. */
export function minimiseForScoring(c: CandidateSkills): CandidateSkills {
  return { ...c, badges: c.badges.filter((b) => b === "new-to-uni") };
}

export const MATCH_PURPOSE = "Form a complementary study pod from skills, interests and availability";

export async function matchPod(input: { userId: string; runId?: string }): Promise<Pod> {
  const runId = input.runId ?? newRunId();
  const demo = process.env.DEMO_MODE === "true";
  const { output } = await runAgent<Pod>({
    agent: "matchmaker",
    runId,
    purpose: MATCH_PURPOSE,
    input: { userId: input.userId, demo },
    outputSchema: PodZ,
    guardrails: [noDemographicSignals<Pod>()],
    run: (ctx) => runMatch(input.userId, ctx, demo),
    fallback: (err, ctx) => {
      if (err instanceof NotFoundError) throw err; // a missing profile is a 404, never masked
      const fixture = demo ? readDemoPod() : null;
      if (!fixture) throw err;
      ctx.done("Matchmaker hit a problem: showing the demo pod", { podId: fixture.id, score: fixture.score });
      return fixture;
    },
  });
  return output;
}

async function runMatch(userId: string, ctx: AgentCtx, demo: boolean): Promise<Pod> {
  const store = getStore();
  const { user, others } = await ctx.step(
    "load candidates",
    async () => {
      const profile = await store.get<Profile>("profiles", userId);
      if (!profile) throw new NotFoundError(`No profile for ${userId}`);

      const seedSkills = loadStudentSkills();
      const roleId = profile.dna?.targetRoles?.[0] ?? "ml-engineer";
      const map = await loadUserMap(userId, roleId);
      const me = map ? buildCandidate(profile, map) : candidateFromSeed(profile, seedSkills[userId]);

      const profiles = await store.list<Profile>("profiles");
      const seen = new Set<string>([userId]);
      const pool: CandidateSkills[] = [];
      for (const p of profiles) {
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        if (seedSkills[p.id]) {
          pool.push(candidateFromSeed(p, seedSkills[p.id]));
          continue;
        }
        // Real (non-seeded) users count too once they have a Bridge Map.
        const role = p.dna?.targetRoles?.[0];
        const m = role ? await loadUserMap(p.id, role) : null;
        if (m?.nodes?.length) pool.push(buildCandidate(p, m));
      }
      pool.sort(byUserId);
      return { user: minimiseForScoring(me), others: pool.map(minimiseForScoring) };
    },
    (r) => ({ message: `Matchmaker: comparing ${r.others.length} students`, data: { candidates: r.others.length } }),
  );
  ctx.memo.scoringInputs = [user, ...others]; // what the guardrail checks: exactly what was scored
  if (!others.length) throw new Error("No other students to match with yet");

  const interestSim = demo ? interestJaccard : await embeddingSim([user, ...others]);
  const opts: ScoreOpts = { interestSim };
  const team = greedyPod(user, others, opts);
  const names = Object.fromEntries(team.map((t) => [t.userId, t.name ?? capitalise(t.userId)]));

  const partner = team[1];
  const fills = user.gaps.filter((g) => partner.proven.includes(g)).slice(0, TOP_N);
  ctx.emit("progress", `best partner: ${firstName(partner.userId, names)}${fills.length ? ` (fills ${fills.map(skillName).join(", ")})` : ""}`, {
    partnerId: partner.userId, fills, pairScore: scoreTeam([user, partner], opts),
  });

  const score = scoreTeam(team, opts);
  ctx.emit("progress", `pod score ${score.toFixed(2)}`, { score, size: team.length, parts: scoreParts(team, opts) });

  // DEMO_MODE: when the live match equals the seeded demo pod, return it under its stable id, so every
  // server instance (serverless functions don't share memory) can resolve it for project / proof calls.
  if (demo) {
    const fixture = readDemoPod();
    const ids = new Set(team.map((t) => t.userId));
    if (fixture && fixture.members.length === ids.size && fixture.members.every((m) => ids.has(m.userId))) {
      await store.upsert("pods", fixture.id, fixture, userId);
      // Record that this user has joined the demo pod, so it shows up as *their* pod from now on.
      await store.upsert("pod_claims", `${userId}:${fixture.id}`, { id: `${userId}:${fixture.id}`, userId, podId: fixture.id }, userId);
      ctx.done(`${fixture.name} is ready: ${team.map((t) => firstName(t.userId, names)).join(", ")}`, {
        podId: fixture.id, score: fixture.score, memberIds: team.map((t) => t.userId),
      });
      return fixture;
    }
  }

  const skills = learnsTeaches(team);
  const members: PodMember[] = skills.map((m) => ({ ...m, role: roleLabel(m.learns, m.teaches) }));
  const templates = templateExplanations(userId, skills, names);
  const explanations = demo ? templates : await polishExplanations(templates, skills, ctx.runId);

  const pod: Pod = PodZ.parse({
    id: `pod_${nanoid(6)}`,
    name: podName(score),
    members,
    explanations,
    score,
    createdAt: new Date().toISOString(),
  });
  await store.upsert("pods", pod.id, pod, userId);

  ctx.done(`${pod.name} is ready: ${team.map((t) => firstName(t.userId, names)).join(", ")}`, {
    podId: pod.id, score, memberIds: team.map((t) => t.userId),
  });
  return pod;
}
