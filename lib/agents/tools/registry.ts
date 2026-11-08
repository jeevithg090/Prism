// P5 · Keystone tool registry: the one typed list of tools shared by the Coach agent, the MCP endpoint
// (/api/mcp) and the governance page (/api/tools). Names, effects and approval flags are fixed by
// AGENT-PRINCIPLES.md ("Canonical Keystone tools"). Every tool:
//  - acts for ctx.userId (never a userId argument), validates its input with zod,
//  - returns a compact JSON object and a ≤ 400-char summarize() observation,
//  - throws ToolError with a recoverable message,
//  - refuses to run without ctx.approved when it requires a human checkpoint.
import "server-only";
import { EXTRA_TOOLS } from "./extensions";
import { z } from "zod";
import { matchPod, NotFoundError as MatchNotFound } from "@/lib/agents/matchmaker";
import { NotFoundError as ProofNotFound, recordMergedPR } from "@/lib/agents/proof";
import { reviewNow } from "@/lib/agents/techlead";
import { loadBadges } from "@/lib/community/badges";
import { findGuidesForUser, GUIDES_DAILY_LIMIT, GuidesError } from "@/lib/community/guides";
import { createHelpRequest } from "@/lib/community/help";
import { startPodProject } from "@/lib/community/projects";
import { similarForUser } from "@/lib/community/trajectories";
import { loadMomentumWeeks } from "@/components/momentum/server";
import { describeBreakdown, formatChange } from "@/lib/momentum";
import { HelpKindZ, SkillIdZ, skillName } from "@/lib/schemas/community";
import type { PRReview, ProofResult } from "@/lib/schemas/studio";
import type { BadgeId, GuideSuggestion, HelpRequest, MomentumWeek, Receipt, SkillId } from "@/lib/types";
import { ToolError } from "./errors";
import {
  compactPod, degreeCoverage, displayRole, gapNodes, latestEvidence, loadBridgeMap, loadWeekPlan,
  nextIssueFor, nodesWithStatus, pct, primaryRole, receiptFor, requireBridgeMap, requirePod, requireProfile, resolvePod,
  type CompactPod, type WeekPlan,
} from "./loaders";
import type { AnyTool, KeystoneTool, ToolContext } from "./types";

export { ToolError, isToolError, type ToolErrorCode } from "./errors";
export type { AnyTool, KeystoneTool, ToolCallRecord, ToolContext, ToolEffect } from "./types";

export const MAX_SUMMARY_CHARS = 400;

/** Trims an observation to the summary budget on a word boundary. */
export function clip(text: string, max = MAX_SUMMARY_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:·(]+$/, "")}…`;
}

const names = (ids: SkillId[]) => ids.map(skillName).join(", ");
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Wraps a tool so the human checkpoint and the summary budget hold no matter who calls run()/summarize(). */
function defineTool<I extends z.ZodTypeAny, O>(t: KeystoneTool<I, O>): AnyTool {
  const tool: KeystoneTool<I, O> = {
    ...t,
    async run(input, ctx) {
      if (t.requiresApproval && !ctx.approved) {
        throw new ToolError(`${t.title} needs the student's approval first (human-in-the-loop). Ask them, then call it again once approved.`, "needs_approval");
      }
      return t.run(input, ctx);
    },
    summarize: (output) => clip(t.summarize(output)) || `${t.title}: done.`,
  };
  return tool as unknown as AnyTool;
}

const NoInputZ = z.object({});
const PodIdZ = z.string().min(1).max(64).describe("Pod id, e.g. \"pod_demo01\". Omit to use the student's newest pod.");

// ---------- 1. get_student_snapshot ----------

interface Snapshot {
  userId: string;
  name: string;
  roleId: string;
  role: string;
  readinessNow: number | null;
  readinessProjected: number | null;
  topGaps: { skillId: SkillId; name: string; demandPct: number }[];
  week: Pick<WeekPlan, "week" | "focusSkillId" | "focusSkillName" | "proof" | "source"> | null;
  pod: { id: string; name: string; members: number; project: string | null; merged: number; total: number } | null;
  latestProof: { skillId: SkillId; skillName: string; source: string; createdAt: string; url?: string } | null;
}

const getStudentSnapshot = defineTool({
  name: "get_student_snapshot",
  title: "Read your snapshot",
  description:
    "Start here: a compact brief of the student before planning anything. Returns readiness now → projected, the top 3 skill gaps with % of job ads, the current roadmap week, pod status with merged-issue progress, and the latest proof of skill. Use the specific tools for detail; don't call this repeatedly in one conversation.",
  input: NoInputZ,
  effect: "read",
  requiresApproval: false,
  agent: "orchestrator",
  async run(_input, ctx): Promise<Snapshot> {
    const profile = await requireProfile(ctx.userId);
    const roleId = primaryRole(profile);
    const [map, pod, proof] = await Promise.all([loadBridgeMap(ctx.userId, roleId), resolvePod(ctx.userId), latestEvidence(ctx.userId)]);
    const [week, cpod] = await Promise.all([loadWeekPlan(profile, roleId, map, pod), pod ? compactPod(pod) : null]);
    return {
      userId: profile.id,
      name: profile.name,
      roleId,
      role: displayRole(roleId),
      readinessNow: map ? map.readinessNow : null,
      readinessProjected: map ? map.readinessProjected : null,
      topGaps: map ? gapNodes(map).slice(0, 3).map((n) => ({ skillId: n.skillId, name: n.name || skillName(n.skillId), demandPct: pct(n.demand) })) : [],
      week: week ? { week: week.week, focusSkillId: week.focusSkillId, focusSkillName: week.focusSkillName, proof: week.proof, source: week.source } : null,
      pod: cpod
        ? { id: cpod.id, name: cpod.name, members: cpod.members.length, project: cpod.project?.title ?? null, merged: cpod.project?.merged ?? 0, total: cpod.project?.total ?? 0 }
        : null,
      latestProof: proof ? { skillId: proof.skillId, skillName: skillName(proof.skillId), source: proof.source, createdAt: proof.createdAt, ...(proof.url ? { url: proof.url } : {}) } : null,
    };
  },
  summarize(s: Snapshot) {
    const first = s.name.split(" ")[0] || s.userId;
    const readiness = s.readinessNow === null ? "no Bridge Map yet" : `readiness ${pct(s.readinessNow)}% → ${pct(s.readinessProjected ?? s.readinessNow)}%`;
    const gaps = s.topGaps.length ? ` Top gaps: ${s.topGaps.map((g) => `${g.name} ${g.demandPct}%`).join(", ")}.` : "";
    const week = s.week ? ` Week ${s.week.week}: ${s.week.focusSkillName}.` : "";
    const pod = s.pod
      ? ` ${s.pod.name} (${s.pod.members} members${s.pod.project ? `, ${s.pod.merged}/${s.pod.total} issues merged` : ", no project yet"}).`
      : " No pod yet.";
    const proof = s.latestProof ? ` Latest proof: ${s.latestProof.skillName} (${s.latestProof.source}).` : " No proof yet.";
    return `${first} (${s.role}): ${readiness}.${gaps}${week}${pod}${proof}`;
  },
});

// ---------- 2. get_bridge_map ----------

interface BridgeMapView {
  roleId: string;
  role: string;
  readinessNow: number;
  readinessProjected: number;
  topGaps: { skillId: SkillId; name: string; demandPct: number; trend?: string; degreeCoverage: Receipt["coveredByDegree"] }[];
  comingInDegree: { skillId: SkillId; name: string; demandPct: number; when?: string; moduleCode?: string }[];
  proven: { skillId: SkillId; name: string }[];
  counts: { proven: number; degreeDone: number; degreeUpcoming: number; gap: number };
}

const getBridgeMap = defineTool({
  name: "get_bridge_map",
  title: "Read your Bridge Map",
  description:
    "Use when you need the student's skill picture for their target role: what employers ask for vs what their degree and proof cover. Returns readiness now and projected, the top gaps (skill, % of job ads, trend, degree coverage), skills the degree covers later, and proven skills. For one skill's reasoning use explain_recommendation instead.",
  input: z.object({
    roleId: z.string().regex(/^[a-z0-9-]+$/).max(40).optional().describe("Role id like \"ml-engineer\". Omit for the student's primary target role."),
    limit: z.number().int().min(1).max(10).default(5).describe("How many top gaps to return (1-10, default 5)."),
  }),
  effect: "read",
  requiresApproval: false,
  agent: "skillmap",
  async run(input, ctx): Promise<BridgeMapView> {
    const profile = await requireProfile(ctx.userId);
    const roleId = input.roleId ?? primaryRole(profile);
    const map = await requireBridgeMap(ctx.userId, roleId);
    const count = (s: string) => map.nodes.filter((n) => n.status === s).length;
    return {
      roleId,
      role: displayRole(roleId),
      readinessNow: map.readinessNow,
      readinessProjected: map.readinessProjected,
      topGaps: gapNodes(map).slice(0, input.limit).map((n) => ({
        skillId: n.skillId, name: n.name || skillName(n.skillId), demandPct: pct(n.demand),
        ...(n.trend ? { trend: n.trend } : {}), degreeCoverage: degreeCoverage(n),
      })),
      comingInDegree: nodesWithStatus(map, "degree-upcoming").filter((n) => n.demand > 0).slice(0, 3).map((n) => ({
        skillId: n.skillId, name: n.name || skillName(n.skillId), demandPct: pct(n.demand),
        ...(n.upcomingLabel ? { when: n.upcomingLabel } : {}), ...(n.moduleCodes?.[0] ? { moduleCode: n.moduleCodes[0] } : {}),
      })),
      proven: nodesWithStatus(map, "proven").map((n) => ({ skillId: n.skillId, name: n.name || skillName(n.skillId) })),
      counts: { proven: count("proven"), degreeDone: count("degree-done"), degreeUpcoming: count("degree-upcoming"), gap: count("gap") },
    };
  },
  summarize(m: BridgeMapView) {
    const gaps = m.topGaps.slice(0, 3).map((g, i) => {
      const extra = i === 0 ? [`${g.demandPct}% of ads`, g.trend === "rising" ? "rising" : "", g.degreeCoverage === "no" ? "no module" : ""] : [`${g.demandPct}%`];
      return `${g.name} (${extra.filter(Boolean).join(", ")})`;
    });
    const later = m.comingInDegree[0] ? ` Degree covers later: ${m.comingInDegree[0].name}${m.comingInDegree[0].when ? ` (${m.comingInDegree[0].when})` : ""}.` : "";
    const proven = m.proven.length ? ` Proven: ${m.proven.slice(0, 5).map((p) => p.name).join(", ")}.` : "";
    return `Readiness ${pct(m.readinessNow)}% → ${pct(m.readinessProjected)}% (${m.role}).${gaps.length ? ` Top gaps: ${gaps.join(", ")}.` : " No gaps left."}${later}${proven}`;
  },
});

// ---------- 3. get_week_plan ----------

const getWeekPlan = defineTool({
  name: "get_week_plan",
  title: "Read this week's plan",
  description:
    "Use when the student asks what to do this week or next. Returns the current roadmap week: focus skill, tasks with hours, the proof that completes the week, and its receipt. Comes from the saved roadmap, else a starter week built from the top gap (source tells you which). Don't use it for the overall skill picture: that's get_bridge_map.",
  input: NoInputZ,
  effect: "read",
  requiresApproval: false,
  agent: "roadmap",
  async run(_input, ctx): Promise<WeekPlan> {
    const profile = await requireProfile(ctx.userId);
    const roleId = primaryRole(profile);
    const [map, pod] = await Promise.all([loadBridgeMap(ctx.userId, roleId), resolvePod(ctx.userId)]);
    const plan = await loadWeekPlan(profile, roleId, map, pod);
    if (!plan) {
      throw new ToolError("No roadmap and no skill gaps to plan from yet. Call get_bridge_map to check the student's map, or ask them to finish onboarding.", "not_found");
    }
    return plan;
  },
  summarize(w: WeekPlan) {
    const open = w.tasks.filter((t) => !t.done);
    const hours = open.reduce((a, t) => a + (t.hours || 0), 0);
    const tasks = open.slice(0, 3).map((t) => `${t.title} (${t.hours}h)`).join("; ");
    return `Week ${w.week}${w.totalWeeks ? ` of ${w.totalWeeks}` : ""}: ${w.focusSkillName}${w.isExamWeek ? " (exam week, lighter load)" : ""}. ${open.length} tasks, ~${hours}h: ${tasks}. Proof: ${w.proof}.${w.source === "fallback" ? " (Starter week from the top gap.)" : ""}`;
  },
});

// ---------- 4. explain_recommendation ----------

interface Explanation {
  skillId: SkillId;
  skillName: string;
  status: string;
  priorityRank: number | null;
  receipt: Receipt;
}

const explainRecommendation = defineTool({
  name: "explain_recommendation",
  title: "Explain a recommendation",
  description:
    "Use when the student asks why a skill is (or isn't) on their plan. Returns the receipt for one skill: % of job ads, trend, whether a degree module covers it, its priority rank among gaps, and a one-sentence reason. Omit skillId to explain this week's focus skill.",
  input: z.object({
    skillId: SkillIdZ.max(40).optional().describe("Kebab-case skill id like \"docker\" or \"pytorch\". Omit for this week's focus skill."),
  }),
  effect: "read",
  requiresApproval: false,
  agent: "roadmap",
  async run(input, ctx): Promise<Explanation> {
    const profile = await requireProfile(ctx.userId);
    const roleId = primaryRole(profile);
    const map = await requireBridgeMap(ctx.userId, roleId);
    const week = await loadWeekPlan(profile, roleId, map, null);
    const skillId = input.skillId ?? week?.focusSkillId;
    if (!skillId) throw new ToolError("No focus skill yet. Pass a skillId such as \"docker\".", "invalid_input");
    const node = map.nodes.find((n) => n.skillId === skillId);
    if (!node) {
      throw new ToolError(`${skillName(skillId)} isn't on the student's ${displayRole(roleId)} Bridge Map. Call get_bridge_map to see which skills are.`, "not_found");
    }
    const rank = gapNodes(map).findIndex((n) => n.skillId === skillId);
    const receipt = week?.focusSkillId === skillId && week.receipt && week.source !== "fallback" ? week.receipt : receiptFor(node, roleId);
    return { skillId, skillName: node.name || skillName(skillId), status: node.status, priorityRank: rank >= 0 ? rank + 1 : null, receipt };
  },
  summarize(e: Explanation) {
    const r = e.receipt;
    const cover = r.coveredByDegree === "no" ? "not covered by a module" : r.coveredByDegree === "upcoming" ? `covered later by ${r.moduleCode ?? "a module"}` : `covered by ${r.moduleCode ?? "a module"}`;
    const rank = e.priorityRank ? `, gap #${e.priorityRank} by demand` : "";
    return `${e.skillName}: ${r.demandPct}% of ads${r.trend ? `, ${r.trend}` : ""}, ${cover}${rank}. ${r.reason}`;
  },
});

// ---------- 5. find_pod ----------

type MyPod = { pod: CompactPod | null; userId: string };

const podLine = (p: CompactPod, userId: string) => {
  const me = p.members.find((m) => m.userId === userId);
  const others = p.members.filter((m) => m.userId !== userId).map((m) => m.name);
  const learnTeach = me ? ` You learn ${names(me.learns) || "from the project"}; you teach ${names(me.teaches) || "by reviewing"}.` : "";
  return { others, learnTeach };
};

const findPod = defineTool({
  name: "find_pod",
  title: "Find my study pod",
  description:
    "Use when the student has no pod yet (check get_my_pod first) or explicitly wants a new one. Runs the Matchmaker on skills, interests and availability (never demographics) and saves a new 3-4 person pod. Returns members with what each learns and teaches, the pod score and plain-English pairing explanations.",
  input: NoInputZ,
  effect: "write",
  requiresApproval: false,
  agent: "matchmaker",
  async run(_input, ctx): Promise<MyPod> {
    try {
      return { userId: ctx.userId, pod: await compactPod(await matchPod({ userId: ctx.userId, runId: ctx.runId })) };
    } catch (e) {
      if (e instanceof MatchNotFound) throw new ToolError(`No Keystone profile for "${ctx.userId}", so there's nothing to match on yet. Ask the student to finish onboarding.`, "not_found");
      throw new ToolError("The Matchmaker couldn't form a pod right now (not enough other students yet). Try again later, or post in Community with ask_for_help.", "failed");
    }
  },
  summarize({ pod: p, userId }: MyPod) {
    if (!p) return "No pod formed.";
    const { others, learnTeach } = podLine(p, userId);
    return `Formed ${p.name} (score ${p.score.toFixed(2)}) with ${list(others)}.${learnTeach} ${p.explanations[0] ?? ""} Next: start_pod_project sets up the GitHub repo and issues.`;
  },
});

// ---------- 6. get_my_pod ----------

const getMyPod = defineTool({
  name: "get_my_pod",
  title: "Read my pod",
  description:
    "Use when the student asks about their pod, teammates, project or issues. Returns their newest pod: members with learns/teaches, the project with each issue's assignee, reviewer and merged status, and progress (merged/total). Returns pod: null when they have none; then offer find_pod.",
  input: NoInputZ,
  effect: "read",
  requiresApproval: false,
  agent: "matchmaker",
  async run(_input, ctx): Promise<MyPod> {
    const pod = await resolvePod(ctx.userId);
    return { userId: ctx.userId, pod: pod ? await compactPod(pod) : null };
  },
  summarize({ pod, userId }: MyPod) {
    if (!pod) return "No pod yet. Call find_pod to form a study pod of 3-4 students whose skills complement the student's.";
    const { others, learnTeach } = podLine(pod, userId);
    const next = nextIssueFor(pod, userId);
    const project = pod.project
      ? ` Project "${pod.project.title}": ${pod.project.merged}/${pod.project.total} issues merged.${next ? ` Your next issue: #${next.number} ${next.title} (reviewer ${next.reviewer}).` : ""}`
      : " No project yet: start_pod_project sets one up.";
    return `${pod.name} (score ${pod.score.toFixed(2)}) with ${list(others)}.${learnTeach}${project}`;
  },
});

// ---------- 7. start_pod_project ----------

interface StartedProject {
  podId: string;
  podName: string;
  created: boolean;
  project: NonNullable<CompactPod["project"]>;
  yourIssue: { number: number; title: string; reviewer: string } | null;
}

const startPodProjectTool = defineTool({
  name: "start_pod_project",
  title: "Start our pod project",
  description:
    "Use once a pod exists and has no project yet. The Architect designs a 3-week project where everyone practises what they learn, then creates the GitHub repo, milestones and issues (a demo repo in demo mode). Needs the student's approval. Returns the project with issues, assignees and reviewers; safe to repeat (an existing repo is returned as-is).",
  input: z.object({ podId: PodIdZ.optional() }),
  effect: "external",
  requiresApproval: true,
  agent: "architect",
  async run(input, ctx): Promise<StartedProject> {
    const pod = await requirePod(ctx.userId, input.podId);
    const result = await startPodProject(pod.id, ctx.runId);
    if (!result) throw new ToolError(`Pod ${pod.id} disappeared before the project could be created. Call get_my_pod and try again.`, "not_found");
    const cpod = await compactPod(result.pod);
    const mine = nextIssueFor(cpod, ctx.userId);
    return {
      podId: cpod.id, podName: cpod.name, created: result.created, project: cpod.project!,
      yourIssue: mine ? { number: mine.number, title: mine.title, reviewer: mine.reviewer } : null,
    };
  },
  summarize(r: StartedProject) {
    const p = r.project;
    const head = r.created ? `Created "${p.title}" for ${r.podName}` : `${r.podName} already has "${p.title}"`;
    const mine = r.yourIssue ? ` Your first issue: #${r.yourIssue.number} ${r.yourIssue.title} (reviewer ${r.yourIssue.reviewer}).` : "";
    return `${head}: ${p.total} issues across ${p.milestones.length} milestones${p.repoUrl ? ` at ${p.repoUrl}` : ""}.${mine}`;
  },
});

// ---------- 8. review_my_pr ----------

const reviewMyPr = defineTool({
  name: "review_my_pr",
  title: "Review my pull request",
  description:
    "Use when the student has opened a PR in their pod repo and wants feedback before their reviewer looks. The AI Tech Lead gives a Socratic review (guiding questions and docs links, never full solutions) of the newest open PR, and posts it as a GitHub comment when live. Needs approval. Returns the PR, the hints and whether it was posted.",
  input: z.object({
    podId: PodIdZ.optional(),
    prNumber: z.number().int().positive().optional().describe("PR number in the pod repo. Omit for the newest open PR."),
  }),
  effect: "external",
  requiresApproval: true,
  agent: "techlead",
  async run(input, ctx): Promise<PRReview> {
    const pod = await requirePod(ctx.userId, input.podId);
    if (!pod.project?.repoUrl) throw new ToolError(`${pod.name} has no repo yet: call start_pod_project first.`, "not_found");
    try {
      return await reviewNow({ podId: pod.id, ...(input.prNumber ? { prNumber: input.prNumber } : {}) }, ctx.runId);
    } catch (e) {
      if (e instanceof ProofNotFound) throw new ToolError(`${e.message} Call get_my_pod to check the pod.`, "not_found");
      throw e;
    }
  },
  summarize(r: PRReview) {
    const topics = r.hints.map((h) => h.match(/^\*\*(.+?):?\*\*/)?.[1]?.replace(/[:?]$/, "").toLowerCase()).filter(Boolean) as string[];
    const where = r.posted ? "posted on GitHub" : r.source === "demo" ? "demo review, not posted" : "not posted";
    const about = topics.length ? ` on ${list(topics)}` : r.hints[0] ? `: ${r.hints[0]}` : "";
    return `Tech Lead reviewed "${r.prTitle}" (${where}): ${r.hints.length} guiding questions${about}. Questions, not answers: the pod reviewer has the final say.`;
  },
});

// ---------- 9. record_merged_pr ----------

const recordMergedPr = defineTool({
  name: "record_merged_pr",
  title: "Record a merged PR as proof",
  description:
    "Use only after a teammate has reviewed and merged the student's pod PR for an issue. The proof engine saves evidence for the learner and the reviewer, marks the skill proven on the Bridge Map, adds momentum and re-plans the roadmap. Needs approval. Returns readiness before → after and any badges; repeating it for the same issue changes nothing.",
  input: z.object({
    issueIndex: z.number().int().min(0).max(50).describe("0-based issue index from get_my_pod (issue #1 is index 0)."),
    podId: PodIdZ.optional(),
    prUrl: z.string().url().max(300).optional().describe("Link to the merged PR, if known."),
  }),
  effect: "write",
  requiresApproval: true,
  agent: "evidence",
  async run(input, ctx): Promise<ProofResult> {
    const pod = await requirePod(ctx.userId, input.podId);
    if (!pod.project) throw new ToolError(`${pod.name} has no project yet: call start_pod_project first.`, "not_found");
    try {
      return await recordMergedPR({ podId: pod.id, issueIndex: input.issueIndex, ...(input.prUrl ? { prUrl: input.prUrl } : {}), runId: ctx.runId });
    } catch (e) {
      if (e instanceof ProofNotFound) {
        throw new ToolError(`${e.message} Issues are 0-based: call get_my_pod for the list (it has ${pod.project.issues.length}).`, "not_found");
      }
      throw e;
    }
  },
  summarize(r: ProofResult) {
    const badges = r.badgesEarned.length ? ` New badge: ${r.badgesEarned.join(", ")}.` : "";
    return `${r.message}. Evidence saved for the learner${r.evidenceIds.length > 1 ? " and the reviewer (code review)" : ""}; +${r.momentumPoints} momentum.${badges}`;
  },
});

// ---------- 10. find_students_like_me ----------

interface Journeys {
  journeys: { id: string; userId: string; name: string; similarity: number; outcomeRole: string; openToChat: boolean; advice: string; highlights: string[] }[];
  openToChat: number;
}

const findStudentsLikeMe = defineTool({
  name: "find_students_like_me",
  title: "Find students like me",
  description:
    "Use when the student wants to see how others with similar interests got where they want to go (near-peer mentoring). Returns the most similar senior journeys: outcome role, similarity, key steps, advice and who is open to a 15-minute chat. To request a chat, follow with ask_for_help (kind chat-15, toUserId).",
  input: z.object({ limit: z.number().int().min(1).max(5).default(3).describe("How many journeys (1-5, default 3).") }),
  effect: "read",
  requiresApproval: false,
  agent: "trajectories",
  async run(input, ctx): Promise<Journeys> {
    const similar = await similarForUser(ctx.userId, { limit: input.limit, runId: ctx.runId });
    if (!similar) throw new ToolError(`No Keystone profile for "${ctx.userId}". Ask the student to finish onboarding first.`, "not_found");
    const journeys = similar.map(({ trajectory: t, similarity }) => ({
      id: t.id, userId: t.userId, name: t.name, similarity, outcomeRole: t.outcomeRole, openToChat: t.openToChat,
      advice: t.advice, highlights: t.steps.slice(0, 3).map((s) => `Y${s.year} ${s.label}`),
    }));
    return { journeys, openToChat: journeys.filter((j) => j.openToChat).length };
  },
  summarize(r: Journeys) {
    if (!r.journeys.length) return "No senior journeys to compare with yet. Try again later, or post a question in Community with ask_for_help.";
    const items = r.journeys.map((j) => `${j.name} → ${j.outcomeRole} (${pct(j.similarity)}% similar${j.openToChat ? ", open to chat" : ""})`);
    return `${r.journeys.length} journeys like yours: ${items.join("; ")}. ${r.openToChat} open to a 15-min chat (ask_for_help, kind chat-15).`;
  },
});

// ---------- 11. get_momentum ----------

interface Momentum {
  weeks: { week: string; score: number; changePct: number }[];
  latest: MomentumWeek | null;
  badges: BadgeId[];
}

const getMomentum = defineTool({
  name: "get_momentum",
  title: "Read my momentum",
  description:
    "Use when the student asks how they're doing lately or needs encouragement grounded in facts. Returns 6 weeks of momentum (verified activity: merged PRs, roadmap milestones, helping newcomers, mock interviews), this week's change vs their own 4-week baseline, and their badges. It never compares the student with others.",
  input: NoInputZ,
  effect: "read",
  requiresApproval: false,
  agent: "evidence",
  async run(_input, ctx): Promise<Momentum> {
    const badges = await loadBadges(ctx.userId);
    if (!badges) throw new ToolError(`No Keystone profile for "${ctx.userId}". Ask the student to finish onboarding first.`, "not_found");
    const weeks = await loadMomentumWeeks(ctx.userId);
    return { weeks: weeks.map((w) => ({ week: w.week, score: w.score, changePct: w.changePct })), latest: weeks[weeks.length - 1] ?? null, badges };
  },
  summarize(m: Momentum) {
    const badges = m.badges.length ? ` Badges: ${m.badges.join(", ")}.` : "";
    if (!m.latest) return `No momentum yet: a first merged PR or finished roadmap week starts it.${badges}`;
    const l = m.latest;
    const from = describeBreakdown(l.breakdown);
    const trail = m.weeks.map((w) => w.score).join(" → ");
    return `This week (${l.week}): ${l.score} points, ${formatChange(l.changePct)} vs your own baseline (${Math.round(l.baseline * 10) / 10}).${from ? ` From ${from}.` : ""} Last ${m.weeks.length} weeks: ${trail}.${badges}`;
  },
});

// ---------- 12. ask_for_help ----------

const KIND_PHRASE: Record<HelpRequest["kind"], string> = { question: "question", "chat-15": "15-minute chat request", "code-review": "code review request" };

const askForHelp = defineTool({
  name: "ask_for_help",
  title: "Ask for help in Community",
  description:
    "Use when the student is stuck, wants a code review, or wants a 15-minute chat with a senior (toUserId from find_students_like_me). Posts a help request to Keystone's Community feed only; nothing is sent outside the app. Needs approval. Returns the saved request with its id and status.",
  input: z.object({
    kind: HelpKindZ.default("question").describe("question · chat-15 (a 15-minute chat) · code-review."),
    message: z.string().trim().min(1).max(1000).describe("The request in the student's own words (max 1000 chars)."),
    toUserId: z.string().min(1).max(64).optional().describe("A specific helper's userId; omit to ask all helpers."),
  }),
  effect: "write",
  requiresApproval: true,
  agent: "orchestrator",
  async run(input, ctx): Promise<HelpRequest> {
    if (input.toUserId && input.toUserId === ctx.userId) throw new ToolError("toUserId is the student themselves: omit it to ask all helpers.", "invalid_input");
    await requireProfile(ctx.userId);
    return createHelpRequest({ fromUserId: ctx.userId, kind: input.kind, message: input.message, ...(input.toUserId ? { toUserId: input.toUserId } : {}) });
  },
  summarize(h: HelpRequest) {
    const to = h.toUserId ? ` for ${h.toUserId}` : " for all helpers";
    return `Posted your ${KIND_PHRASE[h.kind]}${to} in Community (${h.id}, ${h.status}). It stays inside Keystone; you'll see replies there.`;
  },
});

// ---------- 13. find_guides ----------

interface Guides {
  guides: GuideSuggestion[];
  usedToday: number;
  remainingToday: number;
}

const findGuidesTool = defineTool({
  name: "find_guides",
  title: "Find practitioners to learn from",
  description:
    `Use when the student wants real practitioners or communities for their top gap. Returns up to 4 public guides (why each is relevant, a link, a suggested question, a draft message the student sends themselves). Each call uses one of ${GUIDES_DAILY_LIMIT} drafts a day, so don't call it twice in one conversation.`,
  input: NoInputZ,
  effect: "read",
  requiresApproval: false,
  agent: "guides",
  async run(_input, ctx): Promise<Guides> {
    try {
      const r = await findGuidesForUser(ctx.userId);
      return { guides: r.guides.slice(0, 4), usedToday: r.usedToday, remainingToday: r.remainingToday };
    } catch (e) {
      if (e instanceof GuidesError) {
        throw new ToolError(
          e.code === "daily_limit"
            ? `${e.message} Meanwhile, find_students_like_me suggests seniors open to a 15-minute chat.`
            : `${e.message} Ask the student to finish onboarding first.`,
          e.code === "daily_limit" ? "limit" : "not_found",
        );
      }
      throw e;
    }
  },
  summarize(g: Guides) {
    if (!g.guides.length) return `No practitioners found this time (${g.remainingToday} of ${GUIDES_DAILY_LIMIT} drafts left today).`;
    const who = g.guides.map((x) => `${x.name} (${x.source})`).join(", ");
    return `${g.guides.length} practitioners: ${who}. Each has a draft message the student sends themselves; Keystone never sends it. ${g.remainingToday} of ${GUIDES_DAILY_LIMIT} drafts left today.`;
  },
});

// ---------- registry ----------

/** All 13 canonical Keystone tools, in the order of AGENT-PRINCIPLES.md. */
export const TOOLS: AnyTool[] = [
  getStudentSnapshot, getBridgeMap, getWeekPlan, explainRecommendation, findPod, getMyPod, startPodProjectTool,
  reviewMyPr, recordMergedPr, findStudentsLikeMe, getMomentum, askForHelp, findGuidesTool,
  // Keystone Labs features plug in here (lib/agents/tools/extra/*), so the Coach and MCP see them too.
  ...EXTRA_TOOLS,
];

/** Tools that are safe to repeat with the same arguments (MCP `idempotentHint`). */
export const IDEMPOTENT_TOOLS: ReadonlySet<string> = new Set([
  ...TOOLS.filter((t) => t.effect === "read" && t.name !== "find_guides").map((t) => t.name),
  "start_pod_project", // an existing repo is returned as-is
  "record_merged_pr", // idempotent per (podId, issueIndex)
]);

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): AnyTool | undefined {
  return BY_NAME.get(name);
}

/** "kind: Invalid option; message: Too small" */
export function formatIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

/**
 * Validates `args` against the tool's schema, enforces the human checkpoint, runs it and summarises the result.
 * Always throws ToolError (unknown_tool · invalid_input · needs_approval · the tool's own · failed).
 */
export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<{ tool: AnyTool; output: unknown; observation: string }> {
  const tool = getTool(name);
  if (!tool) throw new ToolError(`Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`, "unknown_tool");
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) throw new ToolError(`Invalid arguments for ${name}: ${formatIssues(parsed.error)}.`, "invalid_input");
  try {
    const output = await tool.run(parsed.data, ctx);
    return { tool, output, observation: tool.summarize(output) };
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError(`${tool.title} failed unexpectedly. Try again in a moment; if it keeps failing, tell the student and suggest the Community help feed.`, "failed");
  }
}
