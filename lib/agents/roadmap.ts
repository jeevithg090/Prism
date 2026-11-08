// Roadmap Agent (P2 Task 6): a degree-aware weekly plan with a receipt for every week.
// Deterministic first: ranking, skips, hours, receipts and proofs are rules. The LLM only rewords tasks and
// suggests free resources, and its output is post-validated; any failure keeps the template tasks.
import "server-only";
import { z } from "zod";
import { emit } from "@/lib/agents/events";
import { llmJSON } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { readData, SAFE_ID, skillMeta } from "@/lib/graph/data";
import { lowerName, moduleName, planRoadmap, teachingModule, type Plan, type PlanWeek, type RankedSkill } from "@/lib/graph/plan";
import { computeReadiness, projectNodes, round2, shiftReadiness } from "@/lib/graph/readiness";
import { roleName } from "@/lib/graph/roles";
import { RoadmapZ } from "@/lib/graph/schemas";
import { addDays, isoDate } from "@/lib/graph/terms";
import type {
  BridgeMap, BridgeNode, Pod, ProjectIssue, Profile, Programme, Receipt, RoadmapTask, RoadmapWeek, Roadmap, RoleDemand,
  SkillId, TrendSeries,
} from "@/lib/types";

// ---------- resources (free first) ----------
export const FREE_HOSTS = [
  "docs.docker.com", "pytorch.org", "freecodecamp.org", "ocw.mit.edu", "kaggle.com", "youtube.com",
  "developer.mozilla.org", "learn.microsoft.com", "aws.amazon.com/training", "aws.amazon.com/getting-started",
  "scikit-learn.org", "huggingface.co", "github.com", "w3schools.com", "fast.ai", "kubernetes.io", "docs.python.org",
  "git-scm.com", "numpy.org", "pandas.pydata.org", "tensorflow.org", "react.dev", "typescriptlang.org", "nodejs.org",
  "postgresql.org", "docs.pytest.org", "owasp.org", "ubuntu.com", "dev.java", "learncpp.com", "fastapi.tiangolo.com",
  "github.io",
];

/** True when the URL is on a host we know is free (subdomains count; path-scoped entries match by prefix). */
export function isFreeUrl(url?: string): boolean {
  if (!url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.replace(/^www\./, "");
  const full = `${host}${u.pathname}`;
  return FREE_HOSTS.some((h) => (h.includes("/") ? full.startsWith(h) : host === h || host.endsWith(`.${h}`)));
}

type Tpl = { learn: string; url?: string; practice: string; build: string; proof?: string };
/** `{repo}` becomes "your pod repo (VisionAid)". */
export const SKILL_TASKS: Record<SkillId, Tpl> = {
  docker: { learn: "Docker's Get Started guide: images, containers and volumes", url: "https://docs.docker.com/get-started/", practice: "Run, inspect and stop three containers from Docker Hub", build: "Write a Dockerfile so anyone can run {repo} with one command", proof: "Merge a PR that adds a Dockerfile to {repo}" },
  pytorch: { learn: "PyTorch's Learn the Basics tutorial: tensors, datasets and training loops", url: "https://pytorch.org/tutorials/beginner/basics/intro.html", practice: "Train a small image classifier on FashionMNIST", build: "Add batch inference with PyTorch to {repo}", proof: "Merge a PR that adds PyTorch batch inference to {repo}" },
  sql: { learn: "Kaggle's Intro to SQL course", url: "https://www.kaggle.com/learn/intro-to-sql", practice: "Write five SELECT, JOIN and GROUP BY queries on a public dataset", build: "Add a SQL table and three queries for the data in {repo}", proof: "Merge a PR with a SQL schema and three queries to {repo}" },
  aws: { learn: "AWS hands-on tutorials: launch and secure your first service", url: "https://aws.amazon.com/getting-started/hands-on/", practice: "Store and fetch files in S3 from a Python script", build: "Deploy {repo} to AWS on the free tier", proof: "Merge a PR that documents and scripts the AWS deploy of {repo}" },
  mlops: { learn: "MLOps Zoomcamp, module 1: experiment tracking", url: "https://github.com/DataTalksClub/mlops-zoomcamp", practice: "Track three training runs and compare them", build: "Add model versioning and a health check to {repo}", proof: "Merge a PR that adds model versioning to {repo}" },
  "llm-apps": { learn: "Hugging Face LLM course, chapters 1 and 2", url: "https://huggingface.co/learn/llm-course", practice: "Call an open model from Python and handle its errors", build: "Add an LLM-written description endpoint to {repo}", proof: "Merge a PR that adds an LLM endpoint to {repo}" },
  "ci-cd": { learn: "GitHub Actions quickstart", url: "https://docs.github.com/en/actions", practice: "Write a workflow that runs the tests on every push", build: "Add a CI workflow that tests every PR in {repo}", proof: "Merge a PR that adds a GitHub Actions workflow to {repo}" },
  kubernetes: { learn: "Kubernetes basics tutorial", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/", practice: "Run a deployment and a service in a local cluster", build: "Write a Kubernetes manifest for {repo}", proof: "Merge a PR that adds a Kubernetes manifest to {repo}" },
  "machine-learning": { learn: "Kaggle's Intro to Machine Learning", url: "https://www.kaggle.com/learn/intro-to-machine-learning", practice: "Train and validate a decision tree on a Kaggle dataset", build: "Add a baseline model and its accuracy to {repo}", proof: "Push a notebook training a baseline model to {repo} and share the results with your pod" },
  "deep-learning": { learn: "fast.ai Practical Deep Learning, lesson 1", url: "https://course.fast.ai/", practice: "Fine-tune a pretrained image model on 100 of your own photos", build: "Compare two pretrained models for {repo}", proof: "Push a notebook comparing two pretrained models to {repo} and share the results with your pod" },
  tensorflow: { learn: "TensorFlow beginner tutorials", url: "https://www.tensorflow.org/tutorials", practice: "Rebuild one PyTorch exercise in Keras", build: "Port one model step in {repo} to Keras to compare", proof: "Push a notebook with a Keras model to {repo}" },
  "vector-databases": { learn: "Hugging Face cookbook: retrieval and embeddings", url: "https://huggingface.co/learn/cookbook", practice: "Embed 200 captions and search them by meaning", build: "Add caption search with embeddings to {repo}", proof: "Merge a PR that adds embedding search to {repo}" },
  "llm-evaluation": { learn: "Hugging Face cookbook: evaluating LLM output", url: "https://huggingface.co/learn/cookbook", practice: "Score 20 model answers against a rubric", build: "Add an evaluation script for generated text to {repo}", proof: "Merge a PR that adds an evaluation report to {repo}" },
  pandas: { learn: "Kaggle's pandas course", url: "https://www.kaggle.com/learn/pandas", practice: "Clean and summarise a messy CSV", build: "Add a pandas report of request data to {repo}", proof: "Merge a PR with a pandas report to {repo}" },
  numpy: { learn: "NumPy: the absolute basics for beginners", url: "https://numpy.org/doc/stable/user/absolute_beginners.html", practice: "Rewrite three Python loops as NumPy operations", build: "Vectorise the image preprocessing in {repo}", proof: "Merge a PR that vectorises a step in {repo} with NumPy" },
  "scikit-learn": { learn: "scikit-learn getting started", url: "https://scikit-learn.org/stable/getting_started.html", practice: "Fit, score and cross-validate two models", build: "Add a scikit-learn baseline to {repo}", proof: "Push a notebook with a scikit-learn baseline to {repo}" },
  statistics: { learn: "MIT 18.05 Probability and Statistics, unit 1", url: "https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2014/", practice: "Compute means, variance and a confidence interval by hand", build: "Add summary statistics for model latency to {repo}" },
  "linear-algebra": { learn: "MIT 18.06 Linear Algebra, lectures 1 and 2", url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/", practice: "Multiply and invert small matrices with NumPy", build: "Explain one tensor shape change in {repo}'s README" },
  testing: { learn: "pytest getting started", url: "https://docs.pytest.org/en/stable/getting-started.html", practice: "Write five unit tests for a function you wrote", build: "Add tests for the API in {repo}", proof: "Merge a PR that adds tests to {repo}" },
  databases: { learn: "PostgreSQL tutorial, chapters 1 to 3", url: "https://www.postgresql.org/docs/current/tutorial.html", practice: "Design a three-table schema on paper, then build it", build: "Add a database table for {repo}", proof: "Merge a PR with a database migration to {repo}" },
  "system-design": { learn: "The System Design Primer: start here", url: "https://github.com/donnemartin/system-design-primer", practice: "Sketch the architecture of an app you use", build: "Draw and commit an architecture diagram for {repo}", proof: "Merge a PR with an architecture diagram for {repo}" },
  "rest-apis": { learn: "FastAPI tutorial: first steps", url: "https://fastapi.tiangolo.com/tutorial/", practice: "Build a three-endpoint API with validation", build: "Add an endpoint with input validation to {repo}", proof: "Merge a PR that adds an endpoint to {repo}" },
  git: { learn: "Pro Git, chapters 2 and 3", url: "https://git-scm.com/book/en/v2", practice: "Branch, rebase and resolve a merge conflict", build: "Open a small PR in {repo} and respond to the review", proof: "Merge a reviewed PR in {repo}" },
  react: { learn: "React: Quick Start", url: "https://react.dev/learn", practice: "Build a small form with state and validation", build: "Add an accessible upload page to {repo}", proof: "Merge a PR with a React page to {repo}" },
  typescript: { learn: "The TypeScript Handbook: the basics", url: "https://www.typescriptlang.org/docs/handbook/intro.html", practice: "Type a small JavaScript file you wrote", build: "Add types to one module in {repo}", proof: "Merge a PR that adds TypeScript types to {repo}" },
  linux: { learn: "The Linux command line for beginners", url: "https://ubuntu.com/tutorials/command-line-for-beginners", practice: "Navigate, grep and script a folder of files", build: "Add a setup script to {repo}", proof: "Merge a PR with a setup script to {repo}" },
};

const ML_PROOF = "Push a notebook training a model with {name} to {repo} and share the results with your pod";
const DEFAULT_PROOF = "Merge a PR in {repo} that uses {name}";

export const repoLabel = (pod?: Pod | null) => {
  const name = pod?.project?.title?.split(":")[0]?.trim();
  return name ? `your pod repo (${name})` : "your pod repo";
};
const fill = (s: string, name: string, repo: string) => s.replaceAll("{repo}", repo).replaceAll("{name}", name);

export function proofFor(node: Pick<BridgeNode, "skillId" | "name" | "category">, pod?: Pod | null, issue?: ProjectIssue): string {
  const repo = repoLabel(pod);
  const tpl = SKILL_TASKS[node.skillId]?.proof;
  if (tpl) return fill(tpl, node.name, repo);
  if (issue) return `Merge your PR for "${issue.title}" in ${repo}`;
  return fill(node.category === "ml-ai" ? ML_PROOF : DEFAULT_PROOF, node.name, repo);
}

/** Learn hours = round(h × (1 − theoryPractice/100)); the rest is practice and build. */
export function hoursSplit(hours: number, theoryPractice: number): { learn: number; build: number } {
  const learn = Math.min(hours, Math.max(0, Math.round(hours * (1 - theoryPractice / 100))));
  return { learn, build: hours - learn };
}

const pctOf = (x: number) => Math.round(x * 100);

export function receiptFor(rs: RankedSkill, roleId: string, trends?: TrendSeries[] | null, roleLabel?: string): Receipt {
  const n = rs.node;
  const series = trends?.find((t) => t.skillId === n.skillId);
  const trend = n.trend ?? series?.label;
  const growth = series?.growthPerYear;
  const demandPct = pctOf(n.demand);
  const trendBit = growth && growth > 0 ? ` (up ${pctOf(growth)}% a year)` : trend === "rising" ? " (and rising)" : "";
  const base = `${demandPct}% of ${roleLabel ?? roleName(roleId)} ads ask for ${n.name}${trendBit}`;
  const receipt: Receipt = {
    demandPct,
    coveredByDegree: rs.coveredLater ? "upcoming" : "no",
    reason: rs.coveredLater
      ? `${base}. Your degree teaches it in ${n.upcomingLabel ?? "a later year"}, after your target date, so this week is a head start.`
      : `${base}, and none of your modules teach it.`,
  };
  if (trend) receipt.trend = trend;
  if (typeof growth === "number") receipt.growthPerYear = growth;
  if (rs.coveredLater && rs.module) receipt.moduleCode = rs.module.code;
  if (n.evidenceIds?.length) receipt.evidenceIds = [...n.evidenceIds];
  return receipt;
}

function degreeLinkFor(rs: RankedSkill, map: BridgeMap, startedAt: string, programme?: Programme | null): string | undefined {
  if (rs.coveredLater && rs.module) return `Your degree goes deeper in ${moduleName(rs.module)}, ${rs.node.upcomingLabel ?? "later in your degree"}.`;
  const byId = new Map(map.nodes.map((n) => [n.skillId, n]));
  for (const e of map.edges) {
    if (e.kind !== "prereq" || e.to !== rs.node.skillId) continue;
    const pre = byId.get(e.from);
    if (pre?.status !== "degree-done") continue;
    const mod = teachingModule(pre, startedAt, programme);
    if (mod) return `Builds on what you learned about ${lowerName(pre.name)} in ${moduleName(mod)}.`;
  }
  return undefined;
}

type PrimerSlot = { weekIndex: number; moduleCode: string; title: string; skills: string[]; url?: string; starts: Date };

function primerSlots(plan: Plan, start0: Date, weeks: number): PrimerSlot[] {
  const byModule = new Map<string, PrimerSlot>();
  for (const s of plan.skipped) {
    if (!s.termStart) continue;
    const idx = Math.floor((addDays(s.termStart, -7).getTime() - start0.getTime()) / (7 * 86_400_000));
    if (idx < 0 || idx >= weeks) continue;
    const slot = byModule.get(s.module.code) ?? { weekIndex: idx, moduleCode: s.module.code, title: moduleName(s.module), skills: [], url: SKILL_TASKS[s.skillId]?.url, starts: s.termStart };
    slot.skills.push(s.name);
    byModule.set(s.module.code, slot);
  }
  return [...byModule.values()];
}

const DAY_MONTH = (d: Date) => `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function weekTasks(w: PlanWeek, hours: number, theoryPractice: number, pod: Pod | null, issue: (ProjectIssue & { n: number }) | undefined, primer?: PrimerSlot): RoadmapTask[] {
  const n = w.focus.node;
  const tpl = SKILL_TASKS[n.skillId];
  const repo = repoLabel(pod);
  const primerH = primer && hours >= 2 ? Math.min(2, hours - 1) : 0;
  const { learn, build } = hoursSplit(hours - primerH, theoryPractice);
  const again = w.repeat ? "Go deeper: " : "";
  const tasks: Omit<RoadmapTask, "id">[] = [];
  if (learn > 0) {
    tasks.push({ type: "learn", title: again + (tpl?.learn ?? `Read the official ${n.name} getting-started guide`), ...(tpl?.url ? { resourceUrl: tpl.url } : {}), free: true, hours: learn });
  }
  const buildTitle = issue && !w.repeat
    ? `${issue.title} (pod issue #${issue.n})`
    : again + fill(tpl?.build ?? `Use ${n.name} in a small PR to {repo}`, n.name, repo);
  const buildTask = { type: "build" as const, title: buildTitle, ...(issue?.githubIssueUrl && !w.repeat ? { resourceUrl: issue.githubIssueUrl } : {}), free: true };
  if (build >= 3) {
    const practice = Math.max(1, Math.round(build / 3));
    tasks.push({ type: "practice", title: again + (tpl?.practice ?? `Practise ${n.name} on a small exercise`), free: true, hours: practice });
    tasks.push({ ...buildTask, hours: build - practice });
  } else if (build > 0) {
    tasks.push({ ...buildTask, hours: build });
  }
  if (primer && primerH > 0) {
    tasks.push({
      type: "primer",
      title: `Primer: preview ${joinAnd(primer.skills.map(lowerName))} before ${primer.title} starts on ${DAY_MONTH(primer.starts)}`,
      ...(primer.url ? { resourceUrl: primer.url } : {}), free: true, hours: primerH,
    });
  }
  return tasks.map((t, idx) => ({ ...t, id: `t_${w.week}_${idx + 1}` }));
}

export interface GenerateInput {
  profile: Profile; map: BridgeMap; programme?: Programme | null; roleDemand?: RoleDemand | null;
  trends?: TrendSeries[] | null; pod?: Pod | null; previous?: Roadmap | null; runId?: string; now?: Date;
  /** Skip the LLM wording pass (DEMO_MODE and tests). */
  polish?: boolean;
  /** DEMO_MODE: curated weeks and skips to use instead of the template wording (the plan still narrates). */
  template?: Roadmap | null;
}

/** The deterministic roadmap: no LLM, no store, no events. */
export function buildRoadmap(i: GenerateInput): { roadmap: Roadmap; plan: Plan } {
  const now = i.now ?? new Date();
  const userId = i.profile.id;
  const roleId = i.map.roleId;
  const myIssues = (i.pod?.project?.issues ?? []).map((iss, idx) => ({ ...iss, n: Number(iss.githubIssueUrl?.match(/\/issues\/(\d+)/)?.[1] ?? idx + 1) })).filter((iss) => iss.assigneeUserId === userId);
  const plan = planRoadmap({
    nodes: i.map.nodes, edges: i.map.edges, startedAt: i.profile.startedAt, targetDate: i.profile.dna.targetDate,
    programme: i.programme, trends: i.trends, podLearns: i.pod?.members.find((m) => m.userId === userId)?.learns, now,
  });
  const hoursPerWeek = Math.max(1, Math.round(i.profile.dna.hoursPerWeek || 8));
  const tp = i.profile.dna.theoryPractice ?? 50;
  const start0 = plan.weeks[0]?.start ?? now;
  const primers = primerSlots(plan, start0, plan.weeks.length);

  const weeks: RoadmapWeek[] = plan.weeks.map((w) => {
    const hours = w.isExamWeek ? Math.max(1, Math.round(hoursPerWeek * 0.5)) : hoursPerWeek;
    const issue = myIssues.find((iss) => iss.skillId === w.focus.node.skillId);
    const primer = primers.find((p) => p.weekIndex === w.week - 1);
    const week: RoadmapWeek = {
      week: w.week, startDate: isoDate(w.start), focusSkillId: w.focus.node.skillId, isExamWeek: w.isExamWeek,
      tasks: weekTasks(w, hours, tp, i.pod ?? null, issue, primer),
      proof: proofFor(w.focus.node, i.pod, issue),
      receipt: receiptFor(w.focus, roleId, i.trends),
    };
    const link = degreeLinkFor(w.focus, i.map, i.profile.startedAt, i.programme);
    if (link) week.degreeLink = link;
    return week;
  });

  // Keep what you've already ticked when the same week keeps the same focus.
  const prev = i.previous;
  if (prev?.weeks?.length) {
    for (const wk of weeks) {
      const old = prev.weeks.find((p) => p.week === wk.week && p.focusSkillId === wk.focusSkillId);
      if (!old) continue;
      wk.tasks = wk.tasks.map((t, idx) => (old.tasks[idx]?.done ? { ...t, done: true } : t));
    }
  }

  const projectedNodes = projectNodes(i.map.nodes, plan.planned, plan.upcomingByTarget);
  const computed = shiftReadiness(i.map.readinessNow ?? computeReadiness(i.map.nodes), i.map.nodes, projectedNodes);
  const roadmap: Roadmap = {
    userId, roleId, version: (prev?.version ?? 0) + 1,
    readinessNow: round2(i.map.readinessNow ?? computeReadiness(i.map.nodes)),
    readinessProjected: round2(typeof i.map.readinessProjected === "number" && i.map.readinessProjected > 0 ? i.map.readinessProjected : computed),
    weeks,
    skipped: plan.skipped.map((s) => ({ skillId: s.skillId, moduleCode: s.module.code, message: s.message })),
    generatedAt: now.toISOString(),
  };
  return { roadmap, plan };
}

// ---------- LLM wording pass ----------
const PolishZ = z.object({
  weeks: z.array(z.object({
    week: z.number(),
    tasks: z.array(z.object({ type: z.enum(["learn", "practice", "build", "primer"]), title: z.string().min(3).max(160), resourceUrl: z.string().url().optional(), hours: z.number() })),
  })),
});
const SYSTEM = "You write concise, motivating study tasks for a university student. For each week you get a focus skill, hours for learning and for building, the student's preferred formats and budget. Return 2-4 tasks per week whose hours sum exactly to the given total. Prefer FREE high-quality resources (official docs, freeCodeCamp, MIT OpenCourseWare, Kaggle Learn, reputable YouTube). Give a real URL for learn tasks. Build tasks must extend the student's pod project or coursework (never share solutions to assessed work).";

/** Applies the LLM's tasks to weeks where they validate; hours are fixed on the last task, URLs checked. Pure. */
export function applyPolish(weeks: RoadmapWeek[], polished: z.infer<typeof PolishZ>, budget: Profile["dna"]["budget"]): RoadmapWeek[] {
  return weeks.map((wk) => {
    const p = polished.weeks.find((x) => x.week === wk.week);
    if (!p || p.tasks.length < 2 || p.tasks.length > 4) return wk;
    const total = wk.tasks.reduce((s, t) => s + t.hours, 0);
    const tasks = p.tasks.map((t) => ({ ...t, hours: Math.max(0, Math.round(t.hours)) }));
    const others = tasks.slice(0, -1).reduce((s, t) => s + t.hours, 0);
    const last = total - others;
    if (last < 1) return wk;
    tasks[tasks.length - 1].hours = last;
    const done = new Map(wk.tasks.map((t, idx) => [idx, t.done]));
    return {
      ...wk,
      tasks: tasks.map((t, idx) => {
        const free = isFreeUrl(t.resourceUrl);
        const keepUrl = t.resourceUrl && (free || budget !== "free");
        const task: RoadmapTask = { id: `t_${wk.week}_${idx + 1}`, type: t.type, title: t.title.trim(), free: keepUrl ? free : true, hours: t.hours };
        if (keepUrl) task.resourceUrl = t.resourceUrl;
        if (done.get(idx)) task.done = true;
        return task;
      }),
    };
  });
}

async function polishTasks(roadmap: Roadmap, profile: Profile, pod: Pod | null, runId?: string): Promise<{ weeks: RoadmapWeek[]; polished: boolean }> {
  const input = roadmap.weeks.map((w) => {
    const learnHours = w.tasks.filter((t) => t.type === "learn").reduce((s, t) => s + t.hours, 0);
    const total = w.tasks.reduce((s, t) => s + t.hours, 0);
    return { week: w.week, skill: w.focusSkillId, learnHours, buildHours: total - learnHours, formats: profile.dna.formats, budget: profile.dna.budget, podProjectTitle: pod?.project?.title };
  });
  try {
    const out = await llmJSON({
      agent: "roadmap", runId, system: SYSTEM, user: JSON.stringify(input), schema: PolishZ, schemaName: "roadmap_tasks",
      cacheKey: `roadmap:${roadmap.userId}:${roadmap.roleId}:${roadmap.weeks.map((w) => w.focusSkillId).join(",")}`,
    });
    return { weeks: applyPolish(roadmap.weeks, out, profile.dna.budget), polished: true };
  } catch {
    return { weeks: roadmap.weeks, polished: false };
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Curated demo weeks with today's readiness and version, keeping the ticks you already made (by task id). */
function fromTemplate(template: Roadmap, built: Roadmap, previous?: Roadmap | null): Roadmap {
  const doneIds = new Set((previous?.weeks ?? []).flatMap((w) => w.tasks.filter((t) => t.done).map((t) => t.id)));
  return {
    ...template,
    userId: built.userId, roleId: built.roleId, version: built.version,
    readinessNow: built.readinessNow, readinessProjected: built.readinessProjected, generatedAt: built.generatedAt,
    weeks: template.weeks.map((w) => ({ ...w, tasks: w.tasks.map((t) => ({ ...t, done: doneIds.has(t.id) })) })),
  };
}

/** Plans, words, saves (store `roadmaps/<userId>`) and narrates (roadmap agent events with real numbers). */
export async function generateRoadmap(i: GenerateInput): Promise<Roadmap> {
  const { runId } = i;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "roadmap", status, message, data });
  };
  say("started", "Roadmap Agent: planning your next 12 weeks");
  const built = buildRoadmap(i);
  const { plan } = built;
  const roadmap = i.template ? fromTemplate(i.template, built.roadmap, i.previous) : built.roadmap;
  say("progress", `ranked ${plan.candidates} gaps by demand, trend and prerequisites`, { ranked: plan.candidates });
  say("progress", `skipped ${plan.skipped.length} ${plan.skipped.length === 1 ? "skill" : "skills"} your degree covers`, { skipped: plan.skipped.length, skills: plan.skipped.map((s) => s.skillId) });
  const first = roadmap.weeks[0];
  const exams = roadmap.weeks.filter((w) => w.isExamWeek).length;
  say("progress", `planned ${roadmap.weeks.length} weeks${first ? ` · week 1: ${plan.weeks[0].focus.node.name} (${first.receipt.demandPct}% of ads)` : ""}${exams ? ` · ${exams} lighter exam ${exams === 1 ? "week" : "weeks"}` : ""}`, { weeks: roadmap.weeks.length, examWeeks: exams, firstFocus: first?.focusSkillId });

  let final = roadmap;
  if (i.polish !== false && !i.template && roadmap.weeks.length) {
    const { weeks, polished } = await polishTasks(roadmap, i.profile, i.pod ?? null, runId);
    if (polished) say("progress", `worded tasks for ${weeks.length} weeks with free resources`);
    else say("progress", "kept the template tasks (wording step unavailable)");
    final = { ...roadmap, weeks };
  }
  await getStore().upsert<Roadmap & { id?: string }>("roadmaps", final.userId, final, final.userId);
  say("done", `Roadmap v${final.version} ready: readiness ${pct(final.readinessNow)} → ${pct(final.readinessProjected)}`, {
    version: final.version, readinessNow: final.readinessNow, readinessProjected: final.readinessProjected,
  });
  return final;
}

// ---------- reading and ticking ----------
export function roadmapFixture(userId: string, roleId = "ml-engineer"): Roadmap | null {
  if (!SAFE_ID.test(userId) || !SAFE_ID.test(roleId)) return null;
  const parsed = RoadmapZ.safeParse(readData(`data/fixtures/roadmap.${userId}.${roleId}.json`));
  return parsed.success ? (parsed.data as Roadmap) : null;
}

/** The stored roadmap, or the user's fixture (copied into the store so ticks and the proof loop persist). */
export async function loadRoadmap(userId: string, roleId?: string): Promise<Roadmap | null> {
  const store = getStore();
  try {
    const stored = await store.get<Roadmap>("roadmaps", userId);
    if (stored && Array.isArray(stored.weeks) && stored.weeks.length) return stored;
  } catch { /* fall through to the fixture */ }
  const fx = roadmapFixture(userId, roleId);
  if (!fx) return null;
  try { await store.upsert<Roadmap & { id?: string }>("roadmaps", userId, fx, userId); } catch { /* read-only is fine */ }
  return fx;
}

export class TaskNotFoundError extends Error {}

/** Ticks a task. When it completes the week, records a `roadmap-milestone` momentum event (once per week). */
export async function setTaskDone(userId: string, taskId: string, done: boolean, now = new Date()): Promise<{ task: RoadmapTask; weekComplete: boolean } | null> {
  const roadmap = await loadRoadmap(userId);
  if (!roadmap) return null;
  const week = roadmap.weeks.find((w) => w.tasks.some((t) => t.id === taskId));
  if (!week) throw new TaskNotFoundError(`No task ${taskId}`);
  const tasks = week.tasks.map((t) => (t.id === taskId ? { ...t, done } : t));
  const updated: Roadmap = { ...roadmap, weeks: roadmap.weeks.map((w) => (w === week ? { ...w, tasks } : w)) };
  const store = getStore();
  await store.upsert<Roadmap & { id?: string }>("roadmaps", userId, updated, userId);
  const weekComplete = done && tasks.every((t) => t.done);
  if (weekComplete) {
    const id = `roadmap-milestone-${userId}-v${roadmap.version}-w${week.week}`;
    const name = skillMeta(week.focusSkillId).name;
    await store.upsert("momentum_events", id, { id, userId, kind: "roadmap-milestone", ts: now.toISOString(), label: `Finished roadmap week ${week.week}: ${name}`, url: `/roadmap#skill-${week.focusSkillId}` }, userId);
  }
  return { task: tasks.find((t) => t.id === taskId)!, weekComplete };
}
