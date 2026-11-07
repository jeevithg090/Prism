import "server-only";
import { z } from "zod";
import { llmJSON } from "@/lib/llm";
import { emitIf } from "@/lib/agents/events";
import { getStore } from "@/lib/store";
import { getSkills } from "@/lib/agents/skillmap";
import { termEnd, termStart } from "@/lib/graph/build";
import type { BridgeMap, BridgeNode, Module, Profile, Programme, Roadmap, RoadmapTask, RoadmapWeek, RoleDemand, SkillId, TrendSeries } from "@/lib/types";

const LLMWeeks = z.object({ weeks: z.array(z.object({ week: z.number(), tasks: z.array(z.object({ type: z.enum(["learn", "practice", "build", "primer"]), title: z.string(), resourceUrl: z.string().url().optional(), hours: z.number() })) })) });
const FREE_HOSTS = ["docs.docker.com", "pytorch.org", "freecodecamp.org", "ocw.mit.edu", "kaggle.com", "youtube.com", "developer.mozilla.org", "learn.microsoft.com", "aws.amazon.com", "scikit-learn.org", "huggingface.co", "github.com", "w3schools.com", "fast.ai"];
const LEARN_URLS: Record<string, string> = {
  docker: "https://docs.docker.com/get-started/", pytorch: "https://pytorch.org/tutorials/",
  python: "https://docs.python.org/3/tutorial/", sql: "https://www.freecodecamp.org/learn/relational-database/",
  javascript: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
  typescript: "https://www.typescriptlang.org/docs/", react: "https://react.dev/learn",
  pandas: "https://pandas.pydata.org/docs/getting_started/", "machine-learning": "https://scikit-learn.org/stable/tutorial/",
};
const mondayAfter = (date: Date) => { const next = new Date(date); const delta = (8 - next.getDay()) % 7 || 7; next.setDate(next.getDate() + delta); next.setHours(0, 0, 0, 0); return next; };
const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const overlaps = (a: Date, b: Date, start: Date, end: Date) => a <= end && b >= start;

export async function generateRoadmap(input: { profile: Profile; map: BridgeMap; programme: Programme; roleDemand: RoleDemand; trends: TrendSeries[]; runId?: string; now?: Date }): Promise<Roadmap> {
  const { profile, map, programme, roleDemand, trends, runId } = input;
  const now = input.now ?? new Date();
  const target = new Date(`${profile.dna.targetDate}T23:59:59`);
  const skills = new Map(getSkills().map((skill) => [skill.id, skill]));
  const nodes = new Map(map.nodes.map((node) => [node.skillId, node]));
  const demand = new Map(roleDemand.skills.map((item) => [item.skillId, item.share]));
  const trend = new Map(trends.map((item) => [item.skillId, item]));
  const moduleFor = (id: SkillId) => programme.modules.filter((module) => module.skills.some((s) => s.skillId === id)).sort((a, b) => termEnd(a, profile.startedAt).getTime() - termEnd(b, profile.startedAt).getTime());
  const coveredLater = (node: BridgeNode) => node.status === "degree-upcoming" && moduleFor(node.skillId).some((module) => termEnd(module, profile.startedAt) < target);
  const skipped = map.nodes.filter((node) => node.demand > 0 && coveredLater(node)).map((node) => {
    const module = moduleFor(node.skillId).find((m) => termEnd(m, profile.startedAt) < target)!;
    return { skillId: node.skillId, moduleCode: module.code, message: `Don't pay for a ${node.name} course: ${module.title} (${module.code}) covers it in ${node.upcomingLabel ?? `Year ${module.year}`}.` };
  });
  const gapNodes = map.nodes.filter((node) => node.demand > 0 && (node.status === "gap" || (node.status === "degree-upcoming" && !coveredLater(node))));
  const scheduled = new Set<SkillId>();
  const priority = (node: BridgeNode) => {
    const prereqs = skills.get(node.skillId)?.prereqs ?? [];
    const prereqReady = prereqs.every((id) => ["proven", "degree-done"].includes(nodes.get(id)?.status ?? "gap") || scheduled.has(id)) ? 1 : 0.6;
    const covered = coveredLater(node);
    return node.demand * (1 + Math.max(trend.get(node.skillId)?.growthPerYear ?? 0, 0)) * prereqReady * (covered ? 0.3 : 1);
  };
  gapNodes.sort((a, b) => priority(b) - priority(a));
  emitIf(runId, "roadmap", "progress", `ranked ${gapNodes.length} gaps`);
  emitIf(runId, "roadmap", "progress", `skipped ${skipped.length} skills your degree covers`);

  const firstMonday = mondayAfter(now);
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(firstMonday); start.setDate(start.getDate() + index * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const exam = overlaps(start, end, new Date(start.getFullYear(), 0, 11), new Date(start.getFullYear(), 0, 24))
      || overlaps(start, end, new Date(start.getFullYear(), 4, 18), new Date(start.getFullYear(), 5, 5));
    const hours = Math.max(1, Math.round(profile.dna.hoursPerWeek * (exam ? 0.5 : 1)));
    const node = gapNodes[Math.min(index, Math.max(0, gapNodes.length - 1))] ?? map.nodes.find((item) => item.demand > 0) ?? map.nodes[0];
    if (node) scheduled.add(node.skillId);
    return { start, end, hours, exam, node };
  });

  const llmInput = weeks.map(({ hours, node }, index) => {
    const learnHours = Math.round(hours * (1 - profile.dna.theoryPractice / 100));
    return { week: index + 1, skill: node?.name ?? "your target skill", learnHours, buildHours: hours - learnHours, hours, formats: profile.dna.formats, budget: profile.dna.budget };
  });
  let generated: z.infer<typeof LLMWeeks> | undefined;
  try {
    generated = await llmJSON({
      agent: "roadmap", runId,
      system: "You write concise, motivating study tasks for a university student. For each week return 2-4 tasks whose hours sum exactly to the given total. Prefer free high-quality resources (official docs, freeCodeCamp, MIT OpenCourseWare, Kaggle Learn, reputable YouTube). Give a real URL for learn tasks. Build tasks must extend the student's pod project or coursework, never share solutions to assessed work.",
      user: JSON.stringify(llmInput), schema: LLMWeeks, schemaName: "weekly roadmap tasks",
    });
  } catch { /* deterministic templates keep the roadmap available without an LLM */ }

  const roadmapWeeks: RoadmapWeek[] = weeks.map(({ start, hours, exam, node }, index) => {
    const focus = node ?? map.nodes[0];
    const skillName = focus?.name ?? "your next skill";
    const learnHours = Math.round(hours * (1 - profile.dna.theoryPractice / 100));
    let tasks: RoadmapTask[] = generated?.weeks.find((item) => item.week === index + 1)?.tasks.map((task, taskIndex) => {
      const free = !!task.resourceUrl && FREE_HOSTS.some((host) => { try { const urlHost = new URL(task.resourceUrl!).hostname; return urlHost === host || urlHost.endsWith(`.${host}`); } catch { return false; } });
      return { id: `t_${index + 1}_${taskIndex + 1}`, type: task.type, title: task.title, ...(task.resourceUrl && (profile.dna.budget !== "free" || free) ? { resourceUrl: task.resourceUrl } : {}), free, hours: task.hours };
    }) ?? [];
    if (!tasks.length) {
      const buildHours = hours - learnHours;
      tasks = [];
      if (learnHours > 0) tasks.push({ id: `t_${index + 1}_1`, type: "learn", title: `Learn ${skillName} fundamentals`, ...(LEARN_URLS[focus?.skillId ?? ""] ? { resourceUrl: LEARN_URLS[focus?.skillId ?? ""] } : {}), free: true, hours: learnHours });
      if (buildHours > 0) tasks.push({ id: `t_${index + 1}_${tasks.length + 1}`, type: profile.dna.theoryPractice > 75 ? "build" : "practice", title: `Apply ${skillName} in a small pod project change`, free: true, hours: buildHours });
      if (tasks.length === 1) tasks.push({ id: `t_${index + 1}_2`, type: "practice", title: `Write up what you learned about ${skillName}`, free: true, hours: 0 });
    }
    const sum = tasks.reduce((total, task) => total + task.hours, 0);
    if (tasks.length) tasks[tasks.length - 1].hours = Math.max(0, tasks[tasks.length - 1].hours + hours - sum);
    const prerequisites = new Set(skills.get(focus?.skillId ?? "")?.prereqs ?? []);
    const degreeModule = programme.modules.find((module) => module.skills.some((s) => prerequisites.has(s.skillId)) && termEnd(module, profile.startedAt) < now);
    const t = focus ? trend.get(focus.skillId) : undefined;
    const demandPct = Math.round((demand.get(focus?.skillId ?? "") ?? focus?.demand ?? 0) * 100);
    const coveredByDegree: RoadmapWeek["receipt"]["coveredByDegree"] = focus?.status === "degree-done" ? "done" : focus?.status === "degree-upcoming" ? "upcoming" : "no";
    const reason = `${demandPct}% of ${roleDemand.roleName} ads ask for ${skillName}${t?.label === "rising" ? `, and demand is up ${Math.round(t.growthPerYear * 100)}% a year` : ""}${coveredByDegree === "no" ? " — none of your modules teach it." : "."}`;
    const category = focus ? skills.get(focus.skillId)?.category : undefined;
    const proof = category === "cloud-devops" ? "Merge a PR that adds a Dockerfile to your pod repo" : category === "ml-ai" ? "Push a notebook training a model and share the results in your pod" : `Merge a PR in your pod repo that uses ${skillName}`;
    return {
      week: index + 1, startDate: start.toISOString().slice(0, 10), focusSkillId: focus?.skillId ?? "python", isExamWeek: exam, tasks, proof,
      ...(degreeModule ? { degreeLink: `Builds on what you learned in ${degreeModule.title}` } : {}),
      receipt: { demandPct, ...(focus?.trend ? { trend: focus.trend } : {}), ...(t ? { growthPerYear: t.growthPerYear } : {}), coveredByDegree, ...(coveredByDegree !== "no" && degreeModule ? { moduleCode: degreeModule.code } : {}), ...(focus?.evidenceIds.length ? { evidenceIds: focus.evidenceIds } : {}), reason },
    };
  });

  // Place a short primer in the week immediately before an upcoming module starts.
  for (const item of skipped) {
    const module = programme.modules.find((candidate) => candidate.code === item.moduleCode);
    if (!module) continue;
    const begins = termStart(module, profile.startedAt);
    const targetWeek = weeks.findIndex(({ start, end }) => start < begins && end < begins && begins.getTime() - end.getTime() <= 7 * 86400000);
    if (targetWeek < 0) continue;
    const week = roadmapWeeks[targetWeek];
    const primer: RoadmapTask = { id: `t_${targetWeek + 1}_primer_${item.skillId}`, type: "primer", title: `Preview ${nodes.get(item.skillId)?.name ?? item.skillId} before ${module.title}`, free: true, hours: 2 };
    let remaining = 2;
    for (const task of week.tasks) {
      const reduction = Math.min(task.hours, remaining);
      task.hours -= reduction;
      remaining -= reduction;
      if (!remaining) break;
    }
    if (!remaining) week.tasks.push(primer);
  }

  const store = getStore();
  const previous = await store.get<Roadmap>("roadmaps", profile.id);
  const roadmap: Roadmap = { userId: profile.id, roleId: map.roleId, version: (previous?.version ?? 0) + 1, readinessNow: map.readinessNow, readinessProjected: map.readinessProjected, weeks: roadmapWeeks, skipped, generatedAt: now.toISOString() };
  await store.upsert("roadmaps", profile.id, roadmap as Roadmap & { id?: string }, profile.id);
  emitIf(runId, "roadmap", "progress", `planned ${roadmap.weeks.length} weeks`);
  emitIf(runId, "roadmap", "done", "Roadmap ready");
  return roadmap;
}
