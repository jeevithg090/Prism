import "server-only";
// Story Mode Director (Keystone Labs "story"). Keystone presents itself: one governed agent run reads every
// existing Keystone module for one student (Aisha in the demo) and compiles the first six weeks into beats.
// Each beat names the agent that acted, its receipt, the human checkpoint (quoted from the agent registry),
// the handoff to the next agent, the real screen and the API that serves the numbers. The narration is
// generated from those numbers and then fact-checked with the Coach's grounding check, so the script can
// only say what the live data says. A beat whose data is missing is skipped with a reason, never faked.
import { runAgent, type AgentCtx, type Guardrail } from "@/lib/agents/harness";
import { noOutboundMessaging } from "@/lib/agents/guardrails";
import { newRunId } from "@/lib/agents/events";
import { AGENT_REGISTRY, CHECKPOINT_LABELS } from "@/lib/agents/registry";
import { getProgramme } from "@/lib/agents/syllabus";
import { getRoleDemand } from "@/lib/agents/market";
import { loadGraph } from "@/lib/graph/build";
import { getProfile, listEvidence } from "@/lib/graph/data";
import { COVERAGE, clamp01, round2 } from "@/lib/graph/readiness";
import { monthYear, roleName } from "@/lib/graph/roles";
import { loadRoadmap } from "@/lib/agents/roadmap";
import { DEMO_FIXTURE_POD_ID, listPodsForUser } from "@/lib/agents/matchmaker";
import { PEER_APPROVAL } from "@/lib/agents/architect";
import { DEMO_HINTS, REVIEW_CHECKPOINT, SAMPLE_PR } from "@/lib/agents/techlead";
import { MAX_CODE_LINES } from "@/lib/agents/guardrails";
import { loadPod, PR_MERGED_POINTS, readinessFormula } from "@/lib/agents/proof";
import { getProofLadder } from "@/lib/agents/ladder";
import { RUNG_MEANING, type RungNumber } from "@/components/ladder/model";
import { computeLecturerGaps, loadLecturerContext, templateLabIdeas } from "@/lib/agents/lecturer";
import { countPods, loadCohort } from "@/lib/agents/cohort";
import { ANONYMITY_MIN, computePodInsights } from "@/lib/agents/peerInsights";
import { loadTrajectories } from "@/lib/agents/trajectories";
import { ProofResultZ } from "@/lib/schemas/studio";
import { skillName } from "@/lib/schemas/community";
import { getStore } from "@/lib/store";
import { neutralize, scanForInjection } from "@/lib/agents/safety/injection";
import type { AgentName, BridgeMap, EvidenceItem, Pod, Profile, Programme, Roadmap, RoleDemand } from "@/lib/types";
import { StoryZ, type Story, type StoryBeat, type StoryCheckpoint, type StoryFact } from "./schema";
import { groundNarration, listJoin, pct, secondsFor, splitHint } from "./pure";

export const STORY_PURPOSE = "Present Keystone through one student's first six weeks, using only live data";
export const DEFAULT_SUBJECT = "aisha";
/** A presenter's checkpoint: Story Mode itself never approves, merges or sends anything. */
export const STORY_CHECKPOINT = {
  kind: "student-approval" as const,
  who: "the presenter",
  note: "Story Mode pauses at every human checkpoint and only the presenter moves it on; it never approves, merges or sends",
};

// ---------- what the Director reads once ----------
export interface Subject {
  userId: string;
  first: string;
  profile: Profile;
  roleId: string;
  role: string;
  programme: Programme | null;
  market: RoleDemand | null;
  evidence: EvidenceItem[];
  map: BridgeMap | null;
  roadmap: Roadmap | null;
  pod: Pod | null;
  names: Record<string, string>;
  /** Untrusted strings (pod, project, roadmap text from the store) withheld by the injection shield. */
  shielded: number;
}

type Draft = Omit<StoryBeat, "index" | "grounding" | "seconds">;
type Builder = { id: string; build: (s: Subject) => Promise<Draft | null> | Draft | null; missing: string };

const fact = (key: string, label: string, value: number | string, display: string, source: string): StoryFact => ({ key, label, value, display, source });
const first = (p: Profile | null | undefined, id: string) => p?.name?.split(" ")[0] || id.charAt(0).toUpperCase() + id.slice(1);

/** The registry's human checkpoint for an agent ("You decide"), quoted, not paraphrased. */
export function registryCheckpoint(agent: AgentName): StoryCheckpoint | null {
  const e = AGENT_REGISTRY.find((r) => r.agent === agent);
  if (!e?.humanCheckpoint || !e.checkpointKind) return null;
  return { kind: e.checkpointKind, label: CHECKPOINT_LABELS[e.checkpointKind], note: e.humanCheckpoint };
}

const issueNumber = (url: string | undefined, idx: number) => Number(url?.match(/\/issues\/(\d+)/)?.[1] ?? idx + 1);

// ---------- the beats ----------
const onboard: Builder = {
  id: "onboard",
  missing: "No programme or job-market data for this student yet",
  build(s) {
    if (!s.programme || !s.market) return null;
    const modules = s.programme.modules.length;
    const ads = s.market.adsAnalysed;
    const ev = s.evidence.length;
    const repos = [...new Set(s.evidence.map((e) => e.url.match(/github\.com\/[^/]+\/([^/#?]+)/)?.[1]).filter((r): r is string => !!r))].slice(0, 4);
    const src = { prog: `GET /api/programmes/${s.programme.id}`, market: `GET /api/market/${s.roleId}`, ev: `GET /api/evidence/${s.userId}` };
    return {
      id: "onboard", when: "Week 0", title: `${s.first} connects a programme and GitHub`,
      agent: "orchestrator", with: ["syllabus", "market", "evidence"],
      narration:
        `${s.first} starts with a programme page and a GitHub account. The Syllabus Agent reads ${modules} modules, ` +
        `the Market Agent reads ${ads} ${s.role} job ads, and the Evidence Agent finds ${ev ? `${ev} pieces of proof` : "no proof yet"} in ${s.first}'s repos.`,
      why: "Three specialist agents run in parallel, so everything after this rests on the syllabus, the job market and real evidence instead of a self-assessment.",
      checkpoint: registryCheckpoint("evidence"),
      handoff: { toAgent: "skillmap", carries: `${modules} modules, ${ads} ads and ${ev} proofs` },
      screen: { href: "/onboard", label: "Onboarding" },
      api: src.market,
      verify: { path: `/api/market/${s.roleId}?demo=1`, pick: "adsAnalysed", expect: ads, label: `${s.role} job ads analysed`, format: "int" },
      facts: [
        fact("modules", "Modules read", modules, String(modules), src.prog),
        fact("ads", "Job ads analysed", ads, String(ads), src.market),
        fact("evidence", "Pieces of proof found", ev, String(ev), src.ev),
      ],
      visual: { kind: "sources", programme: `${s.programme.name}, ${s.programme.university}`, modules, role: s.role, ads, evidence: ev, repos },
    };
  },
};

const bridgeMap: Builder = {
  id: "map",
  missing: "No Bridge Map yet: onboarding has not finished",
  build(s) {
    const m = s.map;
    if (!m?.nodes.length) return null;
    const now = pct(m.readinessNow);
    const projected = pct(m.readinessProjected);
    const by = monthYear(s.profile.dna?.targetDate) ?? "the target date";
    const ranked = [...m.nodes].sort((a, b) => b.demand - a.demand);
    const gap = ranked.find((n) => n.status === "gap");
    const src = `GET /api/graph/${s.userId}`;
    const gapLine = gap
      ? ` The biggest gap is ${gap.name}: ${pct(gap.demand)}% of ads ask for it, and no module covers it.`
      : " Every high-demand skill is already covered by proof or a module.";
    return {
      id: "map", when: "Week 0", title: "The Bridge Map: degree plus market plus proof",
      agent: "skillmap", with: ["syllabus", "market", "trends", "evidence"],
      narration: `The Skill Mapper joins all three into ${s.first}'s Bridge Map: ${now}% ready for ${s.role} roles today, and ${projected}% by ${by} with the plan.${gapLine}`,
      why: `Readiness is the share of the role's demand already covered: a proven skill counts in full, a finished module ${pct(COVERAGE["degree-done"])}%, an upcoming module ${pct(COVERAGE["degree-upcoming"])}% and a gap nothing.`,
      checkpoint: null,
      handoff: { toAgent: "roadmap", carries: gap ? `${gap.name} gap, ${pct(gap.demand)}% of ads` : "no open gaps" },
      screen: { href: "/map", label: "Bridge Map" },
      api: src,
      verify: { path: `/api/graph/${s.userId}?roleId=${s.roleId}`, pick: "readinessNow", expect: m.readinessNow, label: "Readiness today", format: "pct" },
      facts: [
        fact("now", "Ready today", m.readinessNow, `${now}%`, src),
        fact("projected", "Projected", m.readinessProjected, `${projected}%`, src),
        fact("by", "Target", by, by, "GET /api/profile"),
        fact("skills", "Skills on the map", m.nodes.length, String(m.nodes.length), src),
        ...(gap ? [fact("gapDemand", `${gap.name} demand`, gap.demand, `${pct(gap.demand)}%`, src)] : []),
        fact("degreeDone", "Finished module weight", COVERAGE["degree-done"], `${pct(COVERAGE["degree-done"])}%`, "Readiness formula"),
        fact("degreeUpcoming", "Upcoming module weight", COVERAGE["degree-upcoming"], `${pct(COVERAGE["degree-upcoming"])}%`, "Readiness formula"),
      ],
      visual: {
        kind: "map", now: m.readinessNow, projected: m.readinessProjected, skills: m.nodes.length, byLabel: by,
        gaps: ranked.slice(0, 5).map((n) => ({ name: n.name, demandPct: pct(n.demand), status: n.status, ...(n.trend ? { trend: n.trend } : {}) })),
      },
    };
  },
};

const roadmap: Builder = {
  id: "roadmap",
  missing: "No roadmap yet: build one from the Bridge Map",
  build(s) {
    const r = s.roadmap;
    const w = r?.weeks?.[0];
    if (!r || !w) return null;
    const focus = skillName(w.focusSkillId);
    const skip = r.skipped?.[0];
    const src = `GET /api/roadmap/${s.userId}`;
    return {
      id: "roadmap", when: "Week 0", title: `A ${r.weeks.length}-week plan with a receipt for every week`,
      agent: "roadmap", with: ["skillmap", "trends"],
      narration:
        `The Roadmap Agent plans ${r.weeks.length} weeks and starts with ${focus}. Its receipt: ${w.receipt.reason}` +
        (skip ? ` It also says what to skip. ${skip.message}` : ""),
      why: "Every week shows its working: how many ads ask for the skill, whether demand is rising, and whether a module already teaches it, so the student can check the reasoning before following it.",
      checkpoint: registryCheckpoint("roadmap"),
      handoff: { toAgent: "matchmaker", carries: `learns ${focus} in week ${w.week}` },
      screen: { href: "/roadmap", label: "Roadmap" },
      api: src,
      verify: { path: `/api/roadmap/${s.userId}`, pick: "weeks.0.receipt.demandPct", expect: w.receipt.demandPct, label: `${focus} demand in the receipt`, format: "int" },
      facts: [
        fact("weeks", "Weeks planned", r.weeks.length, String(r.weeks.length), src),
        fact("week", "Week", w.week, String(w.week), src),
        fact("demandPct", `${focus} demand`, w.receipt.demandPct, `${w.receipt.demandPct}%`, src),
        fact("reason", "Receipt", w.receipt.reason, w.receipt.reason, src),
        ...(skip ? [fact("skip", "Skip", skip.message, skip.message, src)] : []),
      ],
      visual: {
        kind: "receipt", week: w.week, focus, demandPct: w.receipt.demandPct, reason: w.receipt.reason, proof: w.proof,
        ...(w.receipt.trend ? { trend: w.receipt.trend } : {}),
        tasks: w.tasks.slice(0, 4).map((t) => ({ title: t.title, hours: t.hours, type: t.type })),
        ...(skip ? { skip: { name: skillName(skip.skillId), message: skip.message } } : {}),
      },
    };
  },
};

const podMatch: Builder = {
  id: "pod",
  missing: "Not in a pod yet: the Matchmaker runs from the Pods page",
  build(s) {
    const pod = s.pod;
    if (!pod) return null;
    const n = pod.members.length;
    const score = pct(pod.score);
    const expl = pod.explanations.find((e) => e.fromUserId === s.userId)?.text ?? pod.explanations[0]?.text ?? "";
    const src = `GET /api/pods/${pod.id}`;
    return {
      id: "pod", when: "Week 1", title: `Matched into ${pod.name}`,
      agent: "matchmaker", with: ["skillmap"],
      narration: `The Matchmaker forms ${pod.name}: ${n} students with a fit score of ${score}%. ${expl} It matches on skills, interests and availability, never on demographics.`,
      why: "Complementary skills: everyone learns something a podmate can already teach. The noDemographicSignals guardrail stops badges such as international or first-gen from ever reaching the score.",
      checkpoint: registryCheckpoint("matchmaker"),
      handoff: { toAgent: "architect", carries: `${n} members, who learns and who teaches` },
      screen: { href: "/pods", label: "Pods" },
      api: src,
      verify: { path: `/api/pods/${pod.id}`, pick: "members.length", expect: n, label: "Pod members", format: "int" },
      facts: [
        fact("members", "Members", n, String(n), src),
        fact("score", "Fit score", pod.score, `${score}%`, src),
        fact("explanation", "Why this pod", expl, expl, src),
      ],
      visual: {
        kind: "pod", name: pod.name, scorePct: score, explanation: expl,
        members: pod.members.map((m) => ({ name: s.names[m.userId] ?? m.userId, learns: m.learns.map(skillName), teaches: m.teaches.map(skillName), isSubject: m.userId === s.userId })),
      },
    };
  },
};

function subjectIssue(s: Subject) {
  const issues = s.pod?.project?.issues ?? [];
  const idx = issues.findIndex((i) => i.assigneeUserId === s.userId);
  return idx < 0 ? null : { idx, issue: issues[idx], number: issueNumber(issues[idx].githubIssueUrl, idx) };
}

const project: Builder = {
  id: "project",
  missing: "The pod has no project yet: the Architect starts it when the pod presses Start project",
  build(s) {
    const p = s.pod?.project;
    const mine = subjectIssue(s);
    if (!s.pod || !p || !mine) return null;
    const reviewer = s.names[mine.issue.reviewerUserId] ?? mine.issue.reviewerUserId;
    const week = s.roadmap?.weeks.find((w) => w.focusSkillId === mine.issue.skillId);
    const src = `GET /api/pods/${s.pod.id}`;
    return {
      id: "project", when: "Week 1", title: `A real GitHub project: ${p.title.split(":")[0]}`,
      agent: "architect", with: ["matchmaker", "roadmap", "n8n"],
      narration:
        `The Project Architect turns the pod into a real GitHub project with ${p.issues.length} issues. ` +
        `${s.first}'s issue, ${mine.issue.title}, ${week ? `is the roadmap's week ${week.week} proof` : "practises a roadmap skill"}, and ${reviewer} reviews it.`,
      why: "Each issue is the assignee's roadmap proof for that week, and its reviewer is a podmate who already knows the skill, so building is learning and reviewing is teaching.",
      checkpoint: registryCheckpoint("architect"),
      handoff: { toAgent: "techlead", carries: `issue ${mine.number}: a ${skillName(mine.issue.skillId)} pull request` },
      screen: { href: `/pods/${s.pod.id}`, label: "Pod project" },
      api: src,
      verify: { path: `/api/pods/${s.pod.id}`, pick: "project.issues.length", expect: p.issues.length, label: "Project issues", format: "int" },
      facts: [
        fact("issues", "Issues", p.issues.length, String(p.issues.length), src),
        fact("issueTitle", "Issue", mine.issue.title, mine.issue.title, src),
        ...(week ? [fact("week", "Roadmap week", week.week, String(week.week), `GET /api/roadmap/${s.userId}`)] : []),
      ],
      visual: {
        kind: "project", title: p.title, repoUrl: p.repoUrl ?? "", issues: p.issues.length, milestones: p.milestones.slice(0, 3),
        issue: { number: mine.number, title: mine.issue.title, skill: skillName(mine.issue.skillId), reviewer },
        weekProof: week?.proof ?? "",
      },
    };
  },
};

const lineCount = (diff: string) => (diff ? diff.replace(/\n+$/, "").split("\n").length : 0);

const review: Builder = {
  id: "review",
  missing: "No pull request to show: the live review runs on the pod's GitHub repo",
  build(s) {
    const mine = subjectIssue(s);
    // The Tech Lead's on-demand sample is the Dockerfile PR for issue 1 of the seeded pod; anything else is live-only.
    if (!s.pod || !mine || mine.idx !== 0 || mine.issue.skillId !== "docker") return null;
    const hints = DEMO_HINTS.map(splitHint);
    const lines = lineCount(SAMPLE_PR.diff);
    const firstQ = hints[0]?.question ?? "";
    const src = "POST /api/projects/review";
    return {
      id: "review", when: "Week 2", title: "A Socratic review: questions, never answers",
      agent: "techlead", with: ["architect"],
      narration: `${s.first} opens pull request ${SAMPLE_PR.number}. The AI Tech Lead reads the ${lines}-line diff and replies with ${hints.length} questions instead of answers. The first one: ${firstQ}`,
      why: `The noFullSolutions guardrail strips any code block longer than ${MAX_CODE_LINES} lines, and the injection shield treats the diff as data, so the review guides the student without doing the work.`,
      checkpoint: { kind: REVIEW_CHECKPOINT.kind, label: CHECKPOINT_LABELS[REVIEW_CHECKPOINT.kind], note: registryCheckpoint("techlead")?.note ?? REVIEW_CHECKPOINT.note },
      handoff: { toAgent: "evidence", carries: "the approved, merged pull request" },
      screen: { href: `/pods/${s.pod.id}`, label: "Pod project" },
      api: src,
      verify: { path: `/api/pods/${s.pod.id}`, pick: `project.issues.${mine.idx}.reviewerUserId`, expect: mine.issue.reviewerUserId, label: `Reviewer on issue ${mine.number}`, format: "text" },
      facts: [
        fact("pr", "Pull request", SAMPLE_PR.number, String(SAMPLE_PR.number), src),
        fact("lines", "Diff lines read", lines, String(lines), src),
        fact("hints", "Questions asked", hints.length, String(hints.length), src),
        fact("q1", "First question", firstQ, firstQ, src),
        fact("maxLines", "Longest code block allowed", MAX_CODE_LINES, String(MAX_CODE_LINES), "noFullSolutions guardrail"),
      ],
      visual: { kind: "review", prNumber: SAMPLE_PR.number, prTitle: SAMPLE_PR.title, diffLines: lines, hints: hints.slice(0, 5) },
    };
  },
};

/** The merge: the stored proof if it happened, otherwise the proof engine's own formula applied to the live map. */
export async function proofDelta(s: Subject): Promise<{ before: number; after: number; merged: boolean } | null> {
  const mine = subjectIssue(s);
  if (!s.pod || !mine) return null;
  const stored = ProofResultZ.safeParse(await getStore().get<unknown>("proofs", `${s.pod.id}:${mine.idx}`).catch(() => null));
  if (stored.success) return { before: stored.data.readinessBefore, after: stored.data.readinessAfter, merged: true };
  const m = s.map;
  if (!m?.nodes.length) return null;
  const before = typeof m.readinessNow === "number" ? m.readinessNow : round2(readinessFormula(m.nodes));
  const flipped = m.nodes.map((n) => (n.skillId === mine.issue.skillId ? { ...n, status: "proven" as const } : n));
  const after = round2(clamp01(before + (readinessFormula(flipped) - readinessFormula(m.nodes))));
  return { before, after, merged: false };
}

const proof: Builder = {
  id: "proof",
  missing: "Nothing to merge yet: the student has no pod issue",
  async build(s) {
    const mine = subjectIssue(s);
    const d = await proofDelta(s);
    if (!s.pod || !mine || !d) return null;
    const skill = skillName(mine.issue.skillId);
    const reviewer = s.names[mine.issue.reviewerUserId] ?? mine.issue.reviewerUserId;
    const b = pct(d.before);
    const a = pct(d.after);
    const src = `GET /api/proof/latest/${s.userId}`;
    const narration = d.merged
      ? `${reviewer} approved and the pull request merged, so the proof engine turned it into evidence: ${skill} went green and readiness moved from ${b}% to ${a}%. ${reviewer} earned a code-review proof for teaching, and ${s.first} gained ${PR_MERGED_POINTS} momentum points.`
      : `When ${reviewer} approves and the pull request merges, the proof engine turns it into evidence: ${skill} goes green and readiness moves from ${b}% to ${a}%. ${reviewer} earns a code-review proof for teaching, and ${s.first} gains ${PR_MERGED_POINTS} momentum points.`;
    return {
      id: "proof", when: "Week 2", title: d.merged ? `${skill} proven by a merged pull request` : `What the merge will prove`,
      agent: "evidence", with: ["techlead", "roadmap"],
      narration,
      why: "One merge writes evidence for both people: the learner's skill and the reviewer's code review. It updates the Bridge Map and asks the Roadmap Agent to re-plan the next week, and recording it twice changes nothing.",
      checkpoint: { kind: PEER_APPROVAL.kind, label: CHECKPOINT_LABELS[PEER_APPROVAL.kind], note: PEER_APPROVAL.note },
      handoff: { toAgent: "roadmap", carries: `${skill} proven, re-plan the next week` },
      screen: { href: "/dashboard", label: "Dashboard" },
      api: d.merged ? src : "POST /api/projects/merge",
      verify: { path: `/api/proof/latest/${s.userId}`, pick: "status", expect: d.merged ? "merged" : "in-progress", label: "Pull request status", format: "text" },
      facts: [
        fact("before", "Readiness before", d.before, `${b}%`, `GET /api/graph/${s.userId}`),
        fact("after", "Readiness after", d.after, `${a}%`, d.merged ? src : "Proof engine formula"),
        fact("points", "Momentum points", PR_MERGED_POINTS, String(PR_MERGED_POINTS), "Proof engine"),
      ],
      visual: { kind: "delta", skill, before: d.before, after: d.after, merged: d.merged, points: PR_MERGED_POINTS, reviewer },
    };
  },
};

const ladder: Builder = {
  id: "ladder",
  missing: "No Proof Ladder for this skill yet",
  async build(s) {
    const mine = subjectIssue(s);
    const skillId = mine?.issue.skillId ?? s.roadmap?.weeks[0]?.focusSkillId;
    if (!skillId) return null;
    const l = (await getProofLadder(s.userId, skillId)).skills[0];
    if (!l) return null;
    const done = l.rungs.filter((r) => r.status === "done").map((r) => r.label);
    const src = `GET /api/proof-ladder/${s.userId}?skillId=${skillId}`;
    const rungs = l.rungs.length;
    return {
      id: "ladder", when: "Week 3", title: `${l.skillName} on the Proof Ladder`,
      agent: "evidence", with: ["voice", "techlead"],
      narration:
        `On the Proof Ladder, every skill climbs ${rungs} rungs: tried it, built it, can teach it. ${l.skillName} is on rung ${l.level} of ${rungs}` +
        `${done.length ? `, with ${listJoin(done.map((x) => x.toLowerCase()))} proven` : ""}. The top rung comes from teaching: reviewing a podmate's pull request, or explaining it in the mock interview.`,
      why: "Each rung is proven by a different agent and confirmed by a person, so nobody can self-claim a skill. The mock interview asks about the pull request the student just merged.",
      checkpoint: registryCheckpoint("voice"),
      handoff: { toAgent: "voice", carries: "the merged pull request to ask about" },
      screen: { href: `/profile/${s.userId}`, label: "Skill Passport" },
      api: src,
      verify: { path: `/api/proof-ladder/${s.userId}?skillId=${skillId}`, pick: "skills.0.level", expect: l.level, label: `${l.skillName} rung`, format: "int" },
      facts: [
        fact("rungs", "Rungs", rungs, String(rungs), src),
        fact("level", "Current rung", l.level, String(l.level), src),
      ],
      visual: {
        kind: "ladder", skill: l.skillName, level: l.level,
        rungs: l.rungs.map((r) => ({ rung: r.rung, label: r.label, done: r.status === "done", meaning: RUNG_MEANING[r.rung as RungNumber] ?? "" })),
      },
    };
  },
};

const lecturer: Builder = {
  id: "lecturer",
  missing: `Cohort insights stay hidden until at least ${ANONYMITY_MIN} students on the programme use Keystone`,
  async build(s) {
    const programmeId = s.profile.programmeId;
    const [{ students, demand, coverage }, cohort, pods] = await Promise.all([loadLecturerContext(programmeId), loadCohort(programmeId), countPods()]);
    if (students.length < ANONYMITY_MIN) return null;
    const gaps = computeLecturerGaps({ students, demand, coverage });
    const top = gaps[0];
    if (!top) return null;
    const peer = computePodInsights({ programmeId, profiles: cohort.profiles, skills: cohort.skills, podsCount: pods });
    const teachersOf = (id: string) => peer.peerTeachable.find((p) => p.skillId === id)?.teachers ?? 0;
    const labIdea = templateLabIdeas(gaps, coverage.modules)[0] ?? "";
    const n = students.length;
    const t = teachersOf(top.skillId);
    const src = `GET /api/lecturer/insights?programmeId=${programmeId}`;
    const name = skillName(top.skillId);
    return {
      id: "lecturer", when: "Week 6", title: "The lecturer sees the cohort, never a student",
      agent: "market", with: ["syllabus", "evidence"],
      narration:
        `The lecturer's anonymous view covers ${n} students. ${name} is the top gap no module covers: ${top.demandPct}% of ads, and ${top.studentsTargeting} students need it` +
        `${t ? `, while ${t} can already teach it` : ""}. Keystone suggests a lab inside an existing module.`,
      why: `Only counts leave the cohort view, and only for groups of ${ANONYMITY_MIN} or more, so no student can be identified. The suggested lab is tied to an existing module and its learning outcomes.`,
      checkpoint: { kind: "lecturer-decision", label: CHECKPOINT_LABELS["lecturer-decision"], note: "The lecturer decides whether to add the lab; Keystone only suggests it" },
      handoff: { toAgent: "syllabus", carries: "a lab linked to a learning outcome" },
      screen: { href: `/lecturer?programmeId=${programmeId}`, label: "Lecturer Insights" },
      api: src,
      verify: { path: `/api/lecturer/insights?programmeId=${programmeId}`, pick: "gaps.0.demandPct", expect: top.demandPct, label: `${name} demand in the cohort view`, format: "int" },
      facts: [
        fact("cohort", "Students in the cohort", n, String(n), "GET /api/lecturer/cohort"),
        fact("demandPct", `${name} demand`, top.demandPct, `${top.demandPct}%`, src),
        fact("students", "Students who need it", top.studentsTargeting, String(top.studentsTargeting), src),
        fact("teachers", "Students who can teach it", t, String(t), `GET /api/pods/insights?programmeId=${programmeId}`),
        fact("anonymity", "Smallest group shown", ANONYMITY_MIN, String(ANONYMITY_MIN), "Anonymity guardrail"),
      ],
      visual: {
        kind: "cohort", cohortSize: n, suppressed: false, labIdea,
        gaps: gaps.slice(0, 4).map((g) => ({ name: skillName(g.skillId), demandPct: g.demandPct, students: g.studentsTargeting, teachers: teachersOf(g.skillId) })),
      },
    };
  },
};

const flywheel: Builder = {
  id: "flywheel",
  missing: "No senior trajectories seeded for this programme",
  async build(s) {
    const all = await loadTrajectories({ programmeId: s.profile.programmeId });
    if (!all.length) return null;
    const open = all.filter((t) => t.openToChat).length;
    const src = `GET /api/trajectories?programmeId=${s.profile.programmeId}`;
    return {
      id: "flywheel", when: "Next term", title: "The loop closes",
      agent: "trajectories", with: ["syllabus", "guides"],
      narration:
        `Next term the lab is added, the Syllabus Agent re-reads the module page, and the next cohort's gap shrinks. ` +
        `${s.first}'s path joins ${all.length} senior journeys that guide newcomers, and ${open} of those seniors are open to a short chat.`,
      why: "Every agent's output is another agent's input: proof improves the plan, reviewing earns credit for teaching, and cohort data improves the teaching itself.",
      checkpoint: registryCheckpoint("trajectories"),
      handoff: { toAgent: "orchestrator", carries: "the next student's onboarding" },
      screen: { href: "/trajectories", label: "Trajectories" },
      api: src,
      verify: { path: `/api/trajectories?programmeId=${s.profile.programmeId}`, pick: "length", expect: all.length, label: "Senior journeys", format: "int" },
      facts: [
        fact("trajectories", "Senior journeys", all.length, String(all.length), src),
        fact("open", "Open to a chat", open, String(open), src),
      ],
      visual: { kind: "flywheel", trajectories: all.length, openToChat: open, loop: ["Plan", "Build", "Prove", "Teach", "Improve the teaching"] },
    };
  },
};

export const BUILDERS: readonly Builder[] = [onboard, bridgeMap, roadmap, podMatch, project, review, proof, ladder, lecturer, flywheel];

// ---------- loading the subject ----------
export class SubjectNotFoundError extends Error {
  readonly code = "not_found";
  constructor(id: string) { super(`We couldn't find a student called ${id}.`); this.name = "SubjectNotFoundError"; }
}

async function podFor(userId: string): Promise<Pod | null> {
  const mine = await listPodsForUser(userId).catch(() => [] as Pod[]);
  if (mine[0]) return mine[0];
  // The seeded story pod (Pod Orbit): reachable by id for its members even before the live match claims it.
  const demo = await loadPod(DEMO_FIXTURE_POD_ID).catch(() => null);
  return demo?.members.some((m) => m.userId === userId) ? demo : null;
}

// ---------- the injection shield ----------
export const WITHHELD = "(withheld: this text was addressed to an AI)";

/** Store text is data, never instructions: hidden Unicode and remote images are neutralised, and any string that
 *  tries to instruct an AI is withheld before it can reach the narration, the voice or the Coach. */
function shieldText(text: string, count: { n: number }): string {
  if (!text) return text;
  if (scanForInjection(text).risk === "high") { count.n++; return WITHHELD; }
  return neutralize(text);
}

export function shieldPod(pod: Pod | null, count: { n: number }): Pod | null {
  if (!pod) return pod;
  return {
    ...pod,
    name: shieldText(pod.name, count),
    explanations: pod.explanations.map((e) => ({ ...e, text: shieldText(e.text, count) })),
    ...(pod.project ? {
      project: {
        ...pod.project,
        title: shieldText(pod.project.title, count),
        milestones: pod.project.milestones.map((m) => shieldText(m, count)),
        issues: pod.project.issues.map((i) => ({ ...i, title: shieldText(i.title, count) })),
      },
    } : {}),
  };
}

export function shieldRoadmap(r: Roadmap | null, count: { n: number }): Roadmap | null {
  if (!r) return r;
  return {
    ...r,
    weeks: r.weeks.map((w) => ({ ...w, proof: shieldText(w.proof, count), receipt: { ...w.receipt, reason: shieldText(w.receipt.reason, count) }, tasks: w.tasks.map((t) => ({ ...t, title: shieldText(t.title, count) })) })),
    skipped: (r.skipped ?? []).map((k) => ({ ...k, message: shieldText(k.message, count) })),
  };
}

export async function loadSubject(userId: string, roleIdIn?: string): Promise<Subject> {
  const profile = await getProfile(userId);
  if (!profile) throw new SubjectNotFoundError(userId);
  const roleId = roleIdIn ?? profile.dna?.targetRoles?.[0] ?? "ml-engineer";
  const [programme, market, evidence, map, rawPlan, rawPod] = await Promise.all([
    Promise.resolve(getProgramme(profile.programmeId)),
    getRoleDemand(roleId, { demo: true }).catch(() => null),
    listEvidence(userId).catch(() => [] as EvidenceItem[]),
    loadGraph(userId, roleId).catch(() => null),
    loadRoadmap(userId, roleId).catch(() => null),
    podFor(userId),
  ]);
  const count = { n: 0 };
  const pod = shieldPod(rawPod, count);
  const plan = shieldRoadmap(rawPlan, count);
  const names: Record<string, string> = {};
  for (const m of pod?.members ?? []) names[m.userId] = first(await getProfile(m.userId).catch(() => null), m.userId);
  names[userId] = first(profile, userId);
  return {
    userId, first: names[userId], profile, roleId, role: roleName(roleId),
    programme, market, evidence, map, roadmap: plan, pod, names, shielded: count.n,
  };
}

// ---------- grounding (the evaluator) ----------
/** Output guardrail: every number in every narration and receipt must trace to that beat's facts. */
export function groundedNarration(): Guardrail<Story> {
  return {
    name: "groundedNarration",
    apply(story) {
      let removed = 0;
      let checked = 0;
      const beats = story.beats.map((b) => {
        const n = groundNarration(b.narration, b.facts);
        const w = groundNarration(b.why, b.facts);
        removed += n.removed.length + w.removed.length;
        checked += n.checked.length + w.checked.length;
        return { ...b, narration: n.narration, why: w.narration, grounding: { checked: [...new Set([...n.checked, ...w.checked])], removed: [...n.removed, ...w.removed] } };
      });
      const next = { ...story, beats, grounding: { checked, removed } };
      return removed
        ? { output: next, action: "modified", detail: `rewrote ${removed} untraceable number${removed === 1 ? "" : "s"} out of the script (${checked} checked)` }
        : { output: next, action: "pass", detail: `${checked} numbers checked against live data, none invented` };
    },
  };
}

// ---------- the Director ----------
export interface CompileOptions { studentId?: string; roleId?: string; runId?: string }

export async function compileStory(opts: CompileOptions = {}): Promise<Story> {
  const userId = opts.studentId ?? DEFAULT_SUBJECT;
  const runId = opts.runId ?? newRunId();
  const demo = process.env.DEMO_MODE === "true";
  const { output } = await runAgent<Story>({
    agent: "orchestrator",
    runId,
    purpose: STORY_PURPOSE,
    input: { userId, roleId: opts.roleId ?? null, demo },
    startData: { beats: BUILDERS.length },
    outputSchema: StoryZ,
    guardrails: [groundedNarration(), noOutboundMessaging<Story>()],
    checkpoint: STORY_CHECKPOINT,
    run: (ctx) => direct(ctx, userId, opts.roleId, demo),
  });
  return output;
}

async function direct(ctx: AgentCtx, userId: string, roleId: string | undefined, demo: boolean): Promise<Story> {
  const s = await ctx.step("read the student", () => loadSubject(userId, roleId), (x) => ({
    message: `Director: reading ${x.first}'s Keystone data (${x.programme?.modules.length ?? 0} modules, ${x.evidence.length} proofs, ${x.pod ? x.pod.name : "no pod"})`,
    data: { modules: x.programme?.modules.length ?? 0, evidence: x.evidence.length, pod: x.pod?.id ?? null },
  }));
  ctx.record({
    name: "injectionShield",
    action: s.shielded ? "modified" : "pass",
    detail: s.shielded ? `withheld ${s.shielded} store text${s.shielded === 1 ? "" : "s"} addressed to an AI` : "pod, project and roadmap text scanned: nothing addressed to an AI",
  });
  const beats: StoryBeat[] = [];
  const skipped: Story["skipped"] = [];
  for (const b of BUILDERS) {
    let draft: Draft | null = null;
    let reason = b.missing;
    try {
      draft = await ctx.step(`beat ${b.id}`, () => b.build(s), (d) =>
        d ? { message: `Beat ${beats.length + 1}, ${d.title}: ${d.facts.slice(0, 3).map((f) => `${f.label.toLowerCase()} ${f.display}`).join(", ")}`, data: { beat: b.id, agent: d.agent, facts: d.facts.length } }
          : { message: `Skipped beat "${b.id}": ${b.missing}`, data: { beat: b.id, skipped: true } });
    } catch (e) {
      reason = `${b.missing} (${e instanceof Error ? e.message.slice(0, 80) : "read failed"})`;
      ctx.degraded(`beat ${b.id} could not read its data`);
    }
    if (!draft) { skipped.push({ id: b.id, reason }); continue; }
    beats.push({ ...draft, index: beats.length, grounding: { checked: [], removed: [] }, seconds: secondsFor(draft.narration) });
  }
  const agents = [...new Set(beats.flatMap((b) => [b.agent, ...b.with, b.handoff.toAgent]))];
  const totalSeconds = beats.reduce((a, b) => a + b.seconds, 0);
  ctx.done(`Story ready: ${beats.length} beats, ${agents.length} agents, about ${Math.round(totalSeconds / 60)} minutes`, {
    beats: beats.length, skipped: skipped.length, agents: agents.length, totalSeconds,
  });
  return {
    runId: ctx.runId,
    subject: { userId: s.userId, name: s.profile.name, roleId: s.roleId, roleName: s.role, programmeId: s.profile.programmeId },
    mode: demo ? "demo" : "live",
    beats, skipped, grounding: { checked: 0, removed: 0 }, agents, totalSeconds,
    generatedAt: new Date().toISOString(),
  };
}

/** The tool's compact observation (≤ 400 chars). */
export function summarizeStory(story: Story): string {
  const line = story.beats.map((b) => `${b.when} ${b.title}`).slice(0, 4).join("; ");
  const text =
    `${story.beats.length} beats of ${story.subject.name.split(" ")[0]}'s first weeks across ${story.agents.length} agents (${line}…). ` +
    `${story.grounding.checked} numbers in the script checked against live data, ${story.grounding.removed} removed. ` +
    `${story.skipped.length ? `${story.skipped.length} beats skipped for missing data. ` : ""}Play it at /labs/story.`;
  return text.length <= 400 ? text : `${text.slice(0, 397)}…`;
}
