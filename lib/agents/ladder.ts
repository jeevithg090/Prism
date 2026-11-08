// P5 · Proof Ladder engine (Try → Build → Teach): every skill climbs three rungs, each proven by a
// different agent and confirmed by a person. Reads evidence; never writes any (the proof engine,
// the micro-challenge grader and the voice coach write it).
//   Rung 1 · Tried it      micro-challenge pass · completed module (degree-done) · GitHub/other evidence ≥ level 1
//   Rung 2 · Built it      a merged pod PR (keystone-pod evidence or a stored proof)
//   Rung 3 · Can teach it  a code review of a peer's PR in the skill · a keystone-interview for the skill
import "server-only";
import fs from "node:fs";
import path from "node:path";
import skillsJson from "@/data/skills.json";
import { getStore } from "@/lib/store";
import { loadGraph } from "@/lib/graph/build";
import { loadPod, repoNameOf } from "@/lib/agents/proof";
import { skillName } from "@/lib/schemas/community";
import { ProofResultZ, type ProjectProgress, type ProofResult } from "@/lib/schemas/studio";
import type { BridgeMap, BridgeNode, EvidenceItem, Profile, Roadmap, RoadmapWeek } from "@/lib/types";
import {
  levelOf, RUNG_LABEL, RUNGS,
  type LadderEvidence, type LadderRung, type LatestProof, type Passport, type ProofLadder, type RungNumber, type SkillLadder,
} from "@/components/ladder/model";

export class NotFoundError extends Error {
  readonly code = "not_found";
  constructor(message: string) { super(message); this.name = "NotFoundError"; }
}
export class PrivateError extends Error {
  readonly code = "private";
  constructor(message: string) { super(message); this.name = "PrivateError"; }
}

export const DEMO_USER_ID = "aisha";
const isDemoMode = () => process.env.DEMO_MODE === "true";
const capitalise = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id);

function readFixture<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return null;
  }
}

// ---------- loaders (store first, fixtures as the fallback) ----------

export async function loadProfile(userId: string): Promise<(Profile & { passportPublic?: boolean }) | null> {
  try {
    const p = await getStore().get<Profile & { passportPublic?: boolean }>("profiles", userId);
    if (p) return p;
  } catch { /* fall through */ }
  const fx = readFixture<Profile>(`data/fixtures/profile.${userId}.json`);
  return fx?.id === userId ? fx : null;
}

export async function loadUserMap(userId: string, roleId?: string): Promise<BridgeMap | null> {
  const role = roleId ?? (await loadProfile(userId))?.dna?.targetRoles?.[0];
  if (!role) return null;
  try {
    const stored = await getStore().get<BridgeMap>("maps", `${userId}:${role}`);
    if (stored && Array.isArray(stored.nodes)) return stored;
  } catch { /* fall through */ }
  try {
    const built = await loadGraph(userId, role);
    if (built && Array.isArray(built.nodes)) return built;
  } catch { /* fall through */ }
  const fx = readFixture<BridgeMap>(`data/fixtures/bridgemap.${userId}.${role}.json`);
  return fx && Array.isArray(fx.nodes) ? fx : null;
}

/** The roadmap week you're on now: the first week whose tasks aren't all done. */
export async function currentRoadmapWeek(userId: string, roleId?: string): Promise<RoadmapWeek | null> {
  let roadmap: Roadmap | null = null;
  try { roadmap = await getStore().get<Roadmap>("roadmaps", userId); } catch { /* fall through */ }
  if (!roadmap?.weeks?.length) {
    const role = roleId ?? (await loadProfile(userId))?.dna?.targetRoles?.[0];
    roadmap = role ? readFixture<Roadmap>(`data/fixtures/roadmap.${userId}.${role}.json`) : null;
  }
  if (!Array.isArray(roadmap?.weeks)) return null;
  return roadmap.weeks.find((w) => !(w.tasks?.length && w.tasks.every((t) => t.done))) ?? null;
}

const isEvidence = (e: unknown): e is EvidenceItem =>
  !!e && typeof e === "object" && typeof (e as EvidenceItem).id === "string" &&
  typeof (e as EvidenceItem).skillId === "string" && typeof (e as EvidenceItem).source === "string";

/** The user's evidence: the store, plus `data/fixtures/evidence.<user>.json` when present (the store wins on id). */
export async function loadEvidence(userId: string): Promise<EvidenceItem[]> {
  const byId = new Map<string, EvidenceItem>();
  const fx = readFixture<unknown>(`data/fixtures/evidence.${userId}.json`);
  if (Array.isArray(fx)) for (const e of fx) if (isEvidence(e) && (e.userId ?? userId) === userId) byId.set(e.id, { ...e, userId });
  try {
    for (const e of await getStore().list<unknown>("evidence", { userId })) {
      if (isEvidence(e) && e.userId === userId) byId.set(e.id, e);
    }
  } catch { /* store unavailable: fixtures only */ }
  return [...byId.values()];
}

async function loadProofs(): Promise<ProofResult[]> {
  try {
    return (await getStore().list<unknown>("proofs")).flatMap((p) => {
      const parsed = ProofResultZ.safeParse(p);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

async function loadProgress(podId: string): Promise<ProjectProgress | null> {
  try { return await getStore().get<ProjectProgress>("pod_progress", podId); } catch { return null; }
}

/** Seeded students' proven skills (data/seed/student-skills.json): their GitHub-proven skills. */
function seededProven(userId: string): string[] {
  const all = readFixture<Record<string, { proven?: string[] }>>("data/seed/student-skills.json");
  const proven = all?.[userId]?.proven;
  return Array.isArray(proven) ? proven.filter((s) => typeof s === "string") : [];
}

// ---------- skill mentions in a review quote ("Reviewed Aisha's Docker PR" → docker) ----------

const SKILLS = (skillsJson as { id: string; name: string }[]).filter((s) => s.id !== "code-review");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MENTION = SKILLS.filter((s) => s.name.length > 1).map((s) => ({
  id: s.id,
  // Short names (SQL, AWS, Git) match case-sensitively so "git" in a URL or "aws" in prose doesn't count.
  re: new RegExp(`(?<![\\w-])${escapeRe(s.name)}(?![\\w-])`, s.name.length <= 3 ? "" : "i"),
}));

export function skillsMentioned(text: string): string[] {
  return MENTION.filter((m) => m.re.test(text)).map((m) => m.id);
}

// ---------- the ladder ----------

type Candidates = Map<string, Record<RungNumber, LadderEvidence[]>>;

function add(c: Candidates, skillId: string, rung: RungNumber, ev: LadderEvidence) {
  if (skillId === "code-review") return;
  const entry = c.get(skillId) ?? { 1: [], 2: [], 3: [] };
  if (!entry[rung].some((e) => e.id === ev.id)) entry[rung].push(ev);
  c.set(skillId, entry);
}

const newest = (xs: LadderEvidence[]) =>
  [...xs].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))[0];

function fromEvidence(c: Candidates, e: EvidenceItem) {
  const base = { id: e.id, url: e.url ?? "", createdAt: e.createdAt ?? "" };
  const quote = e.quote?.trim();
  switch (e.source) {
    case "micro-challenge":
      add(c, e.skillId, 1, { ...base, source: "micro-challenge", quote: quote || `Passed the ${skillName(e.skillId)} micro-challenge` });
      return;
    case "keystone-pod":
      if (e.skillId === "code-review") {
        for (const s of skillsMentioned(quote ?? "")) add(c, s, 3, { ...base, source: "code-review", quote: quote || "Reviewed a peer's pull request" });
      } else {
        add(c, e.skillId, 2, { ...base, source: "keystone-pod", quote: quote || `Merged a ${skillName(e.skillId)} pull request in your pod` });
      }
      return;
    case "keystone-interview":
      add(c, e.skillId, 3, { ...base, source: "keystone-interview", quote: quote || `Explained ${skillName(e.skillId)} in a mock interview` });
      return;
    default:
      if ((e.level ?? 0) >= 1) add(c, e.skillId, 1, { ...base, source: e.source, quote: quote || `${skillName(e.skillId)} evidence from ${e.source}` });
  }
}

async function fromProofs(c: Candidates, userId: string, evidence: EvidenceItem[]) {
  const known = new Set(evidence.map((e) => e.id));
  for (const p of await loadProofs()) {
    const learner = p.userId === userId;
    const reviewer = p.reviewerUserId === userId && p.userId !== userId;
    if (!learner && !reviewer) continue;
    // Evidence the proof engine wrote is already counted; this covers a proof whose evidence lives elsewhere.
    if (learner && known.has(p.evidenceIds[0] ?? "")) continue;
    if (reviewer && p.evidenceIds.slice(1).some((id) => known.has(id))) continue;
    const progress = await loadProgress(p.podId);
    const merged = progress?.merged?.find((m) => m.issueIndex === p.issueIndex);
    const pod = await loadPod(p.podId);
    const issue = pod?.project?.issues?.[p.issueIndex];
    const url = merged?.prUrl ?? issue?.githubIssueUrl ?? pod?.project?.repoUrl ?? "";
    const createdAt = merged?.mergedAt ?? "";
    if (learner) {
      add(c, p.skillId, 2, {
        id: p.evidenceIds[0] ?? `proof_${p.podId}_${p.issueIndex}`, source: "keystone-pod", url, createdAt,
        quote: issue ? `Merged '${issue.title}'` : p.message,
      });
    } else {
      const learnerName = capitalise(p.userId);
      add(c, p.skillId, 3, {
        id: p.evidenceIds[1] ?? `proof_${p.podId}_${p.issueIndex}_review`, source: "code-review", url, createdAt,
        quote: `Reviewed ${learnerName}'s ${p.skillName} PR`,
      });
    }
  }
}

function fromMap(c: Candidates, map: BridgeMap) {
  for (const n of map.nodes) {
    const has = c.get(n.skillId);
    if (n.status === "proven" && !has?.[1].length && !has?.[2].length) {
      add(c, n.skillId, 1, {
        id: n.evidenceIds?.[0] ?? `map_${n.skillId}`, source: "github", url: "/map", createdAt: map.generatedAt ?? "",
        quote: `Found in your GitHub repos by the Evidence Agent (level ${n.level ?? 1} of 3 on your Bridge Map)`,
      });
    } else if (n.status === "degree-done" && !has?.[1].length) {
      const modules = n.moduleCodes?.length ? n.moduleCodes.join(", ") : "a module";
      add(c, n.skillId, 1, {
        id: `degree_${n.skillId}`, source: "degree", url: "/map", createdAt: map.generatedAt ?? "",
        quote: `Completed ${modules} in your degree`,
      });
    }
  }
}

function buildRungs(entry: Record<RungNumber, LadderEvidence[]> | undefined): LadderRung[] {
  const proven = RUNGS.map((r) => (entry?.[r]?.length ? newest(entry[r]) : undefined));
  return RUNGS.map((r, i) => {
    const evidence = proven[i];
    if (evidence) return { rung: r, label: RUNG_LABEL[r], status: "done", evidence };
    const higher = RUNGS.find((h) => h > r && proven[h - 1]);
    return higher
      ? { rung: r, label: RUNG_LABEL[r], status: "done", impliedBy: higher as 2 | 3 }
      : { rung: r, label: RUNG_LABEL[r], status: "open" };
  });
}

/**
 * The Proof Ladder for one user. With `skillId`, just that skill (all rungs open if there's no evidence);
 * otherwise every skill with a proven rung, plus the Bridge Map gaps (level 0), highest level first,
 * then by how many ads want it.
 */
export async function getProofLadder(userId: string, skillId?: string): Promise<ProofLadder> {
  const [evidence, map] = await Promise.all([loadEvidence(userId), loadUserMap(userId)]);
  const c: Candidates = new Map();
  for (const e of evidence) fromEvidence(c, e);
  await fromProofs(c, userId, evidence);
  if (map) fromMap(c, map);
  for (const s of seededProven(userId)) {
    if (!c.get(s)?.[1].length && !c.get(s)?.[2].length) {
      add(c, s, 1, { id: `seed_${userId}_${s}`, source: "github", url: "", createdAt: "", quote: "Found in their GitHub repos (seeded demo profile)" });
    }
  }

  const nodes = new Map<string, BridgeNode>((map?.nodes ?? []).map((n) => [n.skillId, n]));
  const ids = skillId
    ? [skillId]
    : [...new Set([...c.keys(), ...(map?.nodes ?? []).filter((n) => n.status === "gap").map((n) => n.skillId)])];

  const skills: SkillLadder[] = ids.filter((id) => id !== "code-review").map((id) => {
    const rungs = buildRungs(c.get(id));
    const node = nodes.get(id);
    return {
      skillId: id, skillName: node?.name ?? skillName(id), rungs, level: levelOf(rungs),
      ...(node ? { status: node.status, demand: node.demand } : {}),
    };
  });
  skills.sort((a, b) => b.level - a.level || (b.demand ?? 0) - (a.demand ?? 0) || a.skillName.localeCompare(b.skillName));
  return { userId, skills, generatedAt: new Date().toISOString() };
}

// ---------- latest proof (the mock interview asks about the PR you just merged) ----------

const ROLE_NAME: Record<string, string> = {
  "ml-engineer": "ML engineer", "software-engineer": "Software engineer", "data-analyst": "Data analyst",
};
export const roleName = (id?: string) => (id ? ROLE_NAME[id] ?? capitalise(id.replace(/-/g, " ")) : undefined);

const firstName = (p: Profile | null, id: string) => p?.name?.split(" ")[0] || capitalise(id);

function mergedOn(iso?: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** The newest merged pod PR for `userId`, or (for the demo pod) the first issue they're working on; null if none. */
export async function getLatestProof(userId: string): Promise<LatestProof | null> {
  const mine = (await loadProofs()).filter((p) => p.userId === userId);
  const dated = await Promise.all(mine.map(async (p) => {
    const merged = (await loadProgress(p.podId))?.merged?.find((m) => m.issueIndex === p.issueIndex);
    return { p, mergedAt: merged?.mergedAt, prUrl: merged?.prUrl };
  }));
  dated.sort((a, b) => (Date.parse(b.mergedAt ?? "") || 0) - (Date.parse(a.mergedAt ?? "") || 0));
  const top = dated[0];

  let podId: string; let issueIndex: number; let status: "merged" | "in-progress"; let mergedAt: string | undefined;
  let prUrl: string | undefined; let base: Pick<ProofResult, "readinessBefore" | "readinessAfter" | "message"> | null = null;
  if (top) {
    ({ podId, issueIndex } = top.p);
    status = "merged"; mergedAt = top.mergedAt; prUrl = top.prUrl; base = top.p;
  } else {
    const fx = readFixture<{ id: string }>("data/fixtures/pod.aisha.json");
    const pod = fx ? await loadPod(fx.id) : null;
    const idx = pod?.project?.issues?.findIndex((i) => i.assigneeUserId === userId) ?? -1;
    if (!pod || idx < 0) return null;
    podId = pod.id; issueIndex = idx; status = "in-progress";
  }

  const pod = await loadPod(podId);
  const issue = pod?.project?.issues?.[issueIndex];
  if (!pod || !issue) return null;
  const reviewerP = await loadProfile(issue.reviewerUserId);
  const reviewerName = firstName(reviewerP, issue.reviewerUserId);
  const repo = repoNameOf(pod.project?.repoUrl) ?? pod.name;
  const url = prUrl ?? issue.githubIssueUrl ?? pod.project?.repoUrl ?? "";
  const ladder = await getProofLadder(userId, issue.skillId);
  const level = ladder.skills[0]?.level ?? 0;
  const skill = skillName(issue.skillId);
  const message = base?.message ?? `${skill} is ${firstName(await loadProfile(userId), userId)}'s pod issue, not merged yet`;
  const levelLabel = level ? `${level} of 3: ${RUNG_LABEL[level as RungNumber]}` : "0 of 3";

  return {
    userId, podId, podName: pod.name, issueIndex, skillId: issue.skillId, skillName: skill, prTitle: issue.title,
    prUrl: url, repo, reviewerUserId: issue.reviewerUserId, reviewerName,
    ...(mergedAt ? { mergedAt } : {}), status,
    readinessBefore: base?.readinessBefore ?? 0, readinessAfter: base?.readinessAfter ?? 0,
    ladderLevel: level, message, isDemo: status === "in-progress",
    dynamicVariables: {
      latest_pr_title: issue.title,
      latest_pr_skill: skill,
      latest_pr_repo: repo,
      latest_pr_url: url,
      latest_pr_reviewer: reviewerName,
      latest_pr_status: status === "merged" ? "merged" : "in progress",
      latest_pr_merged_on: mergedOn(mergedAt),
      pod_name: pod.name,
      ladder_level: levelLabel,
    },
  };
}

// ---------- Skill Passport ----------

const PROGRAMME_NAME: Record<string, string> = { "uom-bsc-cs": "BSc Computer Science, University of Manchester" };

function programmeLabel(id: string): string {
  const fx = readFixture<{ name?: string; university?: string }>(`data/fixtures/programme.${id}.json`);
  if (fx?.name && fx.university) return `${fx.name}, ${fx.university}`;
  return PROGRAMME_NAME[id] ?? id;
}

/** The Skill Passport. Private by default: only the owner sees it until they opt in. */
export async function getPassport(userId: string, viewerId: string): Promise<Passport> {
  const profile = await loadProfile(userId);
  if (!profile) throw new NotFoundError(`We couldn't find a passport for ${userId}.`);
  const isOwner = viewerId === userId;
  const isPublic = profile.passportPublic === true;
  if (!isPublic && !isOwner) throw new PrivateError(`${firstName(profile, userId)} hasn't made their passport public.`);
  const role = profile.dna?.targetRoles?.[0];
  const [ladder, map] = await Promise.all([getProofLadder(userId), loadUserMap(userId, role)]);
  return {
    userId, name: profile.name, ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    programme: programmeLabel(profile.programmeId), year: profile.year, badges: profile.badges ?? [],
    ...(role ? { roleName: roleName(role) } : {}),
    ...(map ? { readinessNow: map.readinessNow, readinessProjected: map.readinessProjected } : {}),
    isPublic, isOwner, isDemo: profile.isDemo === true || isDemoMode(),
    skills: ladder.skills.filter((s) => s.level > 0),
  };
}

/** Opt in or out of the public passport (stored on the profile document). Owner only. */
export async function setPassportVisibility(userId: string, viewerId: string, isPublic: boolean): Promise<{ isPublic: boolean }> {
  if (viewerId !== userId) throw new PrivateError("Only you can change who sees your passport.");
  const profile = await loadProfile(userId);
  if (!profile) throw new NotFoundError(`We couldn't find a profile for ${userId}.`);
  await getStore().upsert("profiles", userId, { ...profile, passportPublic: isPublic }, userId);
  return { isPublic };
}

/** `ks_uid` cookie → viewer id (the demo persona when there's no session, matching useViewerId). */
export function viewerFromRequest(req: Request): string {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)ks_uid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : DEMO_USER_ID;
}
