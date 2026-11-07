// P5 · Project Architect: designs a 3-week pod project, then opens a real GitHub repo with issues.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Octokit } from "octokit";
import { customAlphabet } from "nanoid";
import { llmJSON } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { emit, newRunId } from "@/lib/agents/events";
import { triggerWorkflow } from "@/lib/n8n";
import { ProjectBriefDraftZ, skillName } from "@/lib/schemas/community";
import type { Pod, PodMember, Profile, ProjectBrief, ProjectIssue, Roadmap, RoadmapWeek, SkillId } from "@/lib/types";

export const DEMO_REPO_URL = "https://github.com/keystone-demo/pod-vision-demo";
export const DEFAULT_MILESTONES = ["Week 1: Foundations", "Week 2: Build", "Week 3: Ship & demo"] as const;
export const MAX_ISSUES = 8;
const LABEL_COLOR = "6366F1";
const repoSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 4);

export const SYSTEM_PROMPT =
  "You design a 3-week student team project that makes every member practise the skills they want to learn, reviewed by a teammate who already has that skill. Realistic, portfolio-worthy, achievable in ~6 hours/week each. Never reuse university coursework.";

type Draft = Omit<ProjectBrief, "repoUrl" | "issues"> & { issues: Omit<ProjectIssue, "githubIssueUrl">[] };
type MemberInfo = PodMember & { name: string; interests: string[]; githubLogin?: string; isDemo?: boolean; targetRole?: string };

/** One member's current roadmap week, as answered by the Roadmap Agent (or a deterministic fallback). */
export interface RoadmapFocus {
  week: number;
  skillId: SkillId;
  proof: string;
  source: "roadmap" | "fixture" | "fallback";
}
export type FocusMap = Map<string, RoadmapFocus>;

const isDemo = () => process.env.DEMO_MODE === "true";
const capitalise = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id);

async function loadMembers(pod: Pod): Promise<MemberInfo[]> {
  const store = getStore();
  return Promise.all(
    pod.members.map(async (m) => {
      let p: Profile | null = null;
      try { p = await store.get<Profile>("profiles", m.userId); } catch { p = null; }
      return {
        ...m, name: p?.name ?? capitalise(m.userId), interests: Array.isArray(p?.interests) ? p.interests : [],
        githubLogin: p?.githubLogin, isDemo: p?.isDemo, targetRole: p?.dna?.targetRoles?.[0],
      };
    }),
  );
}

export function buildUserPrompt(members: MemberInfo[], focus?: FocusMap): string {
  const lines = members.map((m) => {
    const f = focus?.get(m.userId);
    const week = f ? `; current roadmap focus: ${f.skillId} (Week ${f.week})` : "";
    return `${m.name} (userId ${m.userId}): learns ${m.learns.join(", ")}; teaches ${m.teaches.join(", ")}; interests ${m.interests.join(", ") || "none listed"}${week}`;
  });
  const rule = focus?.size
    ? "\n\nEach member's FIRST issue must practise their current roadmap focus skill (use that skillId): merging it is their roadmap proof for the week."
    : "";
  return `MEMBERS:\n${lines.join("\n")}${rule}\n\nReturn a title, a one-sentence pitch, exactly 3 milestones, and 6-8 issues. Each issue: title, body (with acceptance criteria as a checklist), assigneeUserId, reviewerUserId, skillId, milestone (one of the milestones).`;
}

// ---------- Roadmap Agent handoff ----------

const isSkillId = (x: unknown): x is SkillId => typeof x === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(x);
const firstName = (name: string) => name.split(" ")[0] || name;

/** First week whose tasks aren't all done, as a RoadmapFocus (null if the roadmap is unusable or finished). */
export function currentWeek(roadmap: unknown, source: RoadmapFocus["source"]): RoadmapFocus | null {
  const weeks = (roadmap as Partial<Roadmap> | null)?.weeks;
  if (!Array.isArray(weeks)) return null;
  const open = weeks.find((w: RoadmapWeek) => {
    const tasks = Array.isArray(w?.tasks) ? w.tasks : [];
    return !(tasks.length > 0 && tasks.every((t) => t?.done));
  });
  if (!open || !isSkillId(open.focusSkillId)) return null;
  const week = Number.isFinite(open.week) ? open.week : 1;
  const proof = typeof open.proof === "string" && open.proof.trim() ? open.proof.trim() : fallbackProof(open.focusSkillId);
  return { week, skillId: open.focusSkillId, proof, source };
}

const fallbackProof = (skill: SkillId) => `Merge a PR that adds ${skillName(skill)} to your pod repo`;

async function readRoadmapFixture(userId: string, role?: string): Promise<unknown> {
  if (!role || !/^[a-z0-9-]+$/.test(userId) || !/^[a-z0-9-]+$/.test(role)) return null;
  try {
    // async read on purpose: keeps the sync fixture reads below independent of this lookup
    const raw = await fs.promises.readFile(path.join(process.cwd(), `data/fixtures/roadmap.${userId}.${role}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Architect → Roadmap Agent: each member's current week focus (store → P2 fixture → first `learns` skill). */
export async function askRoadmapAgent(members: MemberInfo[], runId: string): Promise<FocusMap> {
  const n = members.length;
  emit({ runId, agent: "architect", status: "progress", message: `asked Roadmap Agent for ${n} ${n === 1 ? "member's" : "members'"} current week` });
  const store = getStore();
  const out: FocusMap = new Map();
  for (const m of members) {
    let f: RoadmapFocus | null = null;
    try { f = currentWeek(await store.get<Roadmap>("roadmaps", m.userId), "roadmap"); } catch { f = null; }
    if (!f) f = currentWeek(await readRoadmapFixture(m.userId, m.targetRole), "fixture");
    if (!f && m.learns[0]) f = { week: 1, skillId: m.learns[0], proof: fallbackProof(m.learns[0]), source: "fallback" };
    if (!f) continue;
    out.set(m.userId, f);
    emit({
      runId, agent: "roadmap", status: "done",
      message: `${firstName(m.name)} · Week ${f.week} focus: ${skillName(f.skillId)}`,
      data: { userId: m.userId, week: f.week, skillId: f.skillId, source: f.source },
    });
  }
  return out;
}

const ROADMAP_LINE = /^\*\*Roadmap:\*\*.*$/gm;
export const roadmapLine = (f: Pick<RoadmapFocus, "week" | "proof">) => `**Roadmap:** Week ${f.week} proof · ${f.proof}`;

// ---------- deterministic repair ----------

function templateIssueBody(skill: string): string {
  const s = skillName(skill);
  return [
    `Use ${s} for one small, real part of the project so you get hands-on practice.`,
    "",
    "### Acceptance criteria",
    `- [ ] Pick one feature where ${s} fits and describe it in this issue`,
    "- [ ] Build it on a branch and open a pull request",
    `- [ ] Add a short README note on how the project uses ${s}`,
    "- [ ] Your reviewer approves the pull request and you merge it",
  ].join("\n");
}

function normaliseMilestones(ms: string[]): string[] {
  const out: string[] = [];
  for (const m of ms) {
    const t = m.trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length === 3) break;
  }
  for (const d of DEFAULT_MILESTONES) if (out.length < 3 && !out.includes(d)) out.push(d);
  return out;
}

/**
 * Applies the P5 repair rules: 3 milestones, every member learns something, valid reviewers, ≤ 8 issues.
 * With `focus` (the Roadmap Agent's answer), each member gets an issue for their current focus skill,
 * and that issue's body ends with their roadmap proof line.
 */
export function repairBrief(draft: Draft, members: PodMember[], focus?: FocusMap): Draft {
  const ids = new Set(members.map((m) => m.userId));
  const byId = new Map(members.map((m) => [m.userId, m]));
  const milestones = normaliseMilestones(draft.milestones ?? []);

  // Drop issues assigned to people outside the pod; fix milestones.
  let issues = (draft.issues ?? [])
    .filter((i) => ids.has(i.assigneeUserId))
    .map((i) => ({ ...i, milestone: milestones.includes(i.milestone) ? i.milestone : milestones[0] }));

  // Every member gets ≥ 1 issue whose skill is one they want to learn (their roadmap focus skill, if known).
  const focusOf = (m: PodMember) => focus?.get(m.userId)?.skillId;
  const covers = (i: { assigneeUserId: string; skillId: SkillId }, m: PodMember) => {
    if (i.assigneeUserId !== m.userId) return false;
    const f = focusOf(m);
    return f ? i.skillId === f : m.learns.includes(i.skillId);
  };
  for (const m of members) {
    const f = focusOf(m);
    if ((!f && !m.learns.length) || issues.some((i) => covers(i, m))) continue;
    const skill = f ?? m.learns[0];
    issues.push({
      title: `Add ${skillName(skill)} to the project`,
      body: templateIssueBody(skill),
      assigneeUserId: m.userId,
      reviewerUserId: "",
      skillId: skill,
      milestone: f ? milestones[0] : milestones[Math.min(1, milestones.length - 1)],
    });
  }

  // Cap at 8, never dropping a member's only learning issue.
  if (issues.length > MAX_ISSUES) {
    const keep = new Set<number>();
    for (const m of members) {
      const idx = issues.findIndex((i) => covers(i, m));
      if (idx >= 0) keep.add(idx);
    }
    for (let i = 0; i < issues.length && keep.size < MAX_ISSUES; i++) keep.add(i);
    issues = issues.filter((_, i) => keep.has(i));
  }

  // Reviewer ≠ assignee and teaches the skill; else any teacher; else the other member who teaches most.
  const load = new Map(members.map((m) => [m.userId, 0]));
  issues = issues.map((i) => {
    const r = byId.get(i.reviewerUserId);
    let reviewer = i.reviewerUserId;
    if (!r || r.userId === i.assigneeUserId || !r.teaches.includes(i.skillId)) {
      const others = members.filter((m) => m.userId !== i.assigneeUserId);
      const teachers = others.filter((m) => m.teaches.includes(i.skillId));
      if (teachers.length) {
        reviewer = teachers.reduce((best, m) => ((load.get(m.userId) ?? 0) < (load.get(best.userId) ?? 0) ? m : best)).userId;
      } else if (others.length) {
        reviewer = others.reduce((best, m) => (m.teaches.length > best.teaches.length ? m : best)).userId;
      } else {
        reviewer = i.assigneeUserId; // single-member pod: nobody else can review
      }
    }
    load.set(reviewer, (load.get(reviewer) ?? 0) + 1);
    return { ...i, reviewerUserId: reviewer };
  });

  // Roadmap handoff: each member's focus issue is their roadmap proof for the week.
  if (focus?.size) {
    const marked = new Set<string>();
    issues = issues.map((i) => {
      const f = focus.get(i.assigneeUserId);
      const body = i.body.replace(ROADMAP_LINE, "").trimEnd();
      if (!f || i.skillId !== f.skillId || marked.has(i.assigneeUserId)) return body === i.body ? i : { ...i, body };
      marked.add(i.assigneeUserId);
      return { ...i, body: `${body}\n\n${roadmapLine(f)}` };
    });
  }

  return { title: draft.title.trim() || "Pod project", pitch: draft.pitch.trim() || "A 3-week peer-learning project.", milestones, issues };
}

// ---------- fallbacks ----------

/** The seeded VisionAid brief, if this pod has exactly the seeded members (read at runtime; may not exist). */
function fixtureBriefFor(pod: Pod): Draft | null {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data/fixtures/pod.aisha.json"), "utf8");
    const fx = JSON.parse(raw) as Pod;
    if (!fx.project) return null;
    const a = new Set(fx.members.map((m) => m.userId));
    const b = new Set(pod.members.map((m) => m.userId));
    if (a.size !== b.size || [...a].some((id) => !b.has(id))) return null;
    return {
      title: fx.project.title,
      pitch: fx.project.pitch,
      milestones: [...fx.project.milestones],
      issues: fx.project.issues.map((i) => ({
        title: i.title, body: i.body, assigneeUserId: i.assigneeUserId,
        reviewerUserId: i.reviewerUserId, skillId: i.skillId, milestone: i.milestone,
      })),
    };
  } catch {
    return null;
  }
}

const SKILL_TASKS: Record<string, string> = {
  python: "Build the core pipeline in Python",
  pytorch: "Train a baseline model with PyTorch",
  "machine-learning": "Evaluate a first machine-learning baseline",
  "deep-learning": "Fine-tune a small deep-learning model",
  docker: "Containerise the app with Docker",
  sql: "Design the database schema in SQL",
  postgresql: "Store results in PostgreSQL",
  aws: "Deploy the API to AWS",
  react: "Build the React front end",
  typescript: "Type the API client with TypeScript",
  "ci-cd": "Set up CI with GitHub Actions",
  testing: "Add automated tests for the core flow",
  "rest-apis": "Expose a small REST API",
  mlops: "Track experiments and model versions",
  "llm-apps": "Add an LLM-powered feature",
  "data-visualisation": "Chart the results for the demo",
};

const FILLERS: { skillId: SkillId; title: string }[] = [
  { skillId: "testing", title: "Add automated tests for the core flow" },
  { skillId: "ci-cd", title: "Set up CI with GitHub Actions" },
  { skillId: "communication", title: "Write the README and a 2-minute demo script" },
  { skillId: "code-review", title: "Run a review session on each other's pull requests" },
];

function templateBrief(pod: Pod, members: MemberInfo[]): Draft {
  const milestones = [...DEFAULT_MILESTONES];
  const pairs: { m: MemberInfo; skill: SkillId }[] = [];
  const maxRounds = Math.max(0, ...members.map((m) => m.learns.length));
  for (let r = 0; r < maxRounds && pairs.length < MAX_ISSUES; r++) {
    for (const m of members) if (m.learns[r] && pairs.length < MAX_ISSUES) pairs.push({ m, skill: m.learns[r] });
  }
  const drafts: { title: string; skillId: SkillId; assigneeUserId: string }[] = pairs.map(({ m, skill }) => ({
    title: SKILL_TASKS[skill] ?? `Add ${skillName(skill)} to the project`,
    skillId: skill,
    assigneeUserId: m.userId,
  }));
  for (let f = 0; drafts.length < 6 && f < FILLERS.length && members.length; f++) {
    drafts.push({ ...FILLERS[f], assigneeUserId: members[drafts.length % members.length].userId });
  }
  const seen = new Map<string, number>();
  const n = drafts.length;
  const issues = drafts.map((d, i) => {
    const count = (seen.get(d.title) ?? 0) + 1;
    seen.set(d.title, count);
    return {
      title: count > 1 ? `${d.title} (part ${count})` : d.title,
      body: templateIssueBody(d.skillId),
      assigneeUserId: d.assigneeUserId,
      reviewerUserId: "",
      skillId: d.skillId,
      milestone: milestones[Math.min(2, Math.floor((i * 3) / Math.max(1, n)))],
    };
  });
  const skills = [...new Set(members.flatMap((m) => m.learns))].slice(0, 3).map(skillName);
  const skillText = skills.length > 1 ? `${skills.slice(0, -1).join(", ")} & ${skills[skills.length - 1]}` : skills[0] ?? "Teamwork";
  const podName = pod.name.replace(/^pod\s+/i, "").trim() || pod.id;
  const names = members.map((m) => m.name.split(" ")[0]);
  const nameText = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "your pod";
  return {
    title: `Pod ${podName} Lab: ${skillText}`,
    pitch: `A 3-week portfolio project where ${nameText} each practise a skill they want to learn and get it reviewed by a teammate who already knows it.`,
    milestones,
    issues,
  };
}

// ---------- public API ----------

export async function designProject(pod: Pod, runId?: string): Promise<ProjectBrief> {
  const rid = runId ?? newRunId();
  emit({ runId: rid, agent: "architect", status: "started", message: `Designing a 3-week project for ${pod.name} (${pod.members.length} members)` });
  const members = await loadMembers(pod);
  const focus = await askRoadmapAgent(members, rid);

  let draft: Draft | null = null;
  if (!isDemo()) {
    try {
      draft = await llmJSON({
        agent: "architect", runId: rid, system: SYSTEM_PROMPT, user: buildUserPrompt(members, focus),
        schema: ProjectBriefDraftZ, schemaName: "project_brief", temperature: 0.4, cacheKey: `architect-${pod.id}`,
      });
      emit({ runId: rid, agent: "architect", status: "progress", message: `Drafted "${draft.title}" with ${draft.issues.length} issues` });
    } catch {
      draft = null;
    }
  }
  if (!draft) {
    draft = fixtureBriefFor(pod) ?? templateBrief(pod, members);
    emit({ runId: rid, agent: "architect", status: "progress", message: `Using a ready-made plan: "${draft.title}"` });
  }

  const repaired = repairBrief(draft, pod.members, focus);
  emit({
    runId: rid, agent: "architect", status: "done",
    message: `Designed "${repaired.title}": ${repaired.issues.length} issues across ${repaired.milestones.length} milestones`,
    data: { issues: repaired.issues.length, milestones: repaired.milestones.length },
  });
  return repaired;
}

export function slug(s: string, max = 30): string {
  const out = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
  return out || "project";
}

export function demoResult(brief: ProjectBrief): ProjectBrief {
  return {
    ...brief,
    repoUrl: DEMO_REPO_URL,
    issues: brief.issues.map((i, idx) => ({ ...i, githubIssueUrl: `${DEMO_REPO_URL}/issues/${idx + 1}` })),
  };
}

export function buildReadme(brief: ProjectBrief, members: MemberInfo[]): string {
  const list = (xs: string[]) => xs.map(skillName).join(", ") || "-";
  return [
    `# ${brief.title}`,
    "",
    brief.pitch,
    "",
    "## Team",
    "",
    "| Member | Learning | Teaching |",
    "| --- | --- | --- |",
    ...members.map((m) => `| ${m.name} | ${list(m.learns)} | ${list(m.teaches)} |`),
    "",
    "## Milestones",
    "",
    ...brief.milestones.map((m, i) => `${i + 1}. ${m}`),
    "",
    "Every issue is assigned to someone who wants to learn the skill and reviewed by a teammate who already knows it.",
    "",
    "---",
    "Made with Keystone",
    "",
  ].join("\n");
}

/** Adds the people line to an issue body, keeping the roadmap proof line last. */
export function githubIssueBody(body: string, people: string): string {
  const m = body.match(/\n*(\*\*Roadmap:\*\*[^\n]*)\s*$/);
  if (!m || m.index === undefined) return `${body}\n\n${people}`;
  return `${body.slice(0, m.index).trimEnd()}\n\n${people}\n\n${m[1]}`;
}

const statusOf = (e: unknown) => (typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : 0);

export async function createRepoAndIssues(pod: Pod, brief: ProjectBrief, runId?: string): Promise<ProjectBrief> {
  const rid = runId ?? newRunId();
  const members = await loadMembers(pod);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? capitalise(id);
  const token = process.env.GITHUB_TOKEN;
  const org = process.env.GITHUB_ORG;
  emit({ runId: rid, agent: "architect", status: "started", message: `Setting up the GitHub repo for "${brief.title}"` });

  let result: ProjectBrief;
  if (isDemo() || !token || !org) {
    result = demoResult(brief);
    emit({
      runId: rid, agent: "architect", status: "progress",
      message: `Demo mode: linked ${result.issues.length} issues across ${brief.milestones.length} milestones in keystone-demo/pod-vision-demo`,
    });
  } else {
    try {
      const octokit = new Octokit({ auth: token });
      const name = `pod-${slug(brief.title)}-${repoSuffix()}`;
      const repo = await octokit.request("POST /orgs/{org}/repos", {
        org, name, description: brief.pitch.slice(0, 350), private: false, auto_init: true,
      });
      const owner = repo.data.owner?.login ?? org;
      const repoName = repo.data.name ?? name;
      emit({ runId: rid, agent: "architect", status: "progress", message: `created repo ${repoName}`, data: { url: repo.data.html_url } });

      let sha: string | undefined;
      try {
        const cur = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo: repoName, path: "README.md" });
        sha = (cur.data as { sha?: string }).sha;
      } catch (e) {
        if (statusOf(e) !== 404) throw e; // auto_init README not there yet: create instead of update
      }
      await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner, repo: repoName, path: "README.md", message: "docs: project brief from Keystone",
        content: Buffer.from(buildReadme(brief, members), "utf8").toString("base64"), ...(sha ? { sha } : {}),
      });

      for (const skill of [...new Set(brief.issues.map((i) => i.skillId))]) {
        try {
          await octokit.request("POST /repos/{owner}/{repo}/labels", { owner, repo: repoName, name: skill, color: LABEL_COLOR, description: skillName(skill) });
        } catch (e) {
          if (statusOf(e) !== 422) throw e; // label already exists
        }
      }

      const numbers = new Map<string, number>();
      for (const title of brief.milestones) {
        const ms = await octokit.request("POST /repos/{owner}/{repo}/milestones", { owner, repo: repoName, title });
        numbers.set(title, ms.data.number);
      }

      const issues: ProjectIssue[] = [];
      for (const i of brief.issues) {
        const assignee = members.find((m) => m.userId === i.assigneeUserId);
        const login = assignee?.githubLogin && !assignee.isDemo ? assignee.githubLogin : undefined;
        const params = {
          owner, repo: repoName, title: i.title,
          body: githubIssueBody(i.body, `**Assignee:** ${nameOf(i.assigneeUserId)} · **Reviewer:** ${nameOf(i.reviewerUserId)} · **Skill:** ${skillName(i.skillId)}`),
          labels: [i.skillId],
          milestone: numbers.get(i.milestone) ?? numbers.get(brief.milestones[0]),
        };
        let created;
        try {
          created = await octokit.request("POST /repos/{owner}/{repo}/issues", login ? { ...params, assignees: [login] } : params);
        } catch (e) {
          if (!login || statusOf(e) !== 422) throw e;
          created = await octokit.request("POST /repos/{owner}/{repo}/issues", params); // login isn't assignable here
        }
        issues.push({ ...i, githubIssueUrl: created.data.html_url });
      }
      emit({
        runId: rid, agent: "architect", status: "progress",
        message: `opened ${issues.length} issues across ${numbers.size} milestones`,
        data: { issues: issues.length, milestones: numbers.size },
      });
      result = { ...brief, repoUrl: repo.data.html_url, issues };
    } catch (e) {
      emit({ runId: rid, agent: "architect", status: "error", message: "GitHub failed: using demo repo", data: { status: statusOf(e) || undefined } });
      result = demoResult(brief);
    }
  }

  try {
    await triggerWorkflow("pod-kickoff", {
      podId: pod.id, podName: pod.name, repoUrl: result.repoUrl,
      members: members.map((m) => m.name), title: result.title, pitch: result.pitch,
    });
  } catch {
    // kickoff is best-effort; the project is already usable
  }
  emit({ runId: rid, agent: "architect", status: "done", message: `Project ready: ${result.repoUrl}`, data: { repoUrl: result.repoUrl } });
  return result;
}
