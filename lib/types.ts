// lib/types.ts. Shared contract. Change ONLY via a PR titled "contract: …" approved by P2 AND P3.

// ---------- Skills ----------
export type SkillId = string; // kebab-case id from data/skills.json, e.g. "python", "docker"
export type SkillCategory =
  | "language" | "framework" | "data" | "ml-ai" | "cloud-devops"
  | "cs-fundamentals" | "practice" | "professional";
export interface Skill {
  id: SkillId; name: string; category: SkillCategory;
  aliases: string[]; prereqs: SkillId[]; isEmerging?: boolean;
}
export type Level = 0 | 1 | 2 | 3; // 0 none · 1 aware · 2 apply · 3 build

// ---------- Degree ----------
export interface ModuleSkill { skillId: SkillId; level: Level }
export interface Module {
  code: string; title: string; year: 1 | 2 | 3 | 4;
  semester: "1" | "2" | "full-year"; credits?: number; compulsory: boolean;
  topics: string[]; learningOutcomes: string[]; assessment?: string;
  skills: ModuleSkill[]; industryNote?: string; // "Used in route planning, search ranking…"
}
export interface Programme {
  id: string; university: string; name: string; url: string;
  modules: Module[]; extractedAt: string; source: "firecrawl" | "cache" | "manual";
}

// ---------- Industry ----------
export type TrendLabel = "rising" | "stable" | "declining";
export interface RoleSkillDemand { skillId: SkillId; share: number /* 0..1 of ads */; trend?: TrendLabel }
export interface RoleDemand {
  roleId: string; roleName: string; location: string; adsAnalysed: number;
  skills: RoleSkillDemand[]; // sorted by share desc
  salary?: { p25: number; median: number; p75: number; currency: "GBP" };
  topCompanies: { name: string; count: number }[];
  sampleAds: { title: string; company: string; url: string }[];
  snapshotAt: string; source: "adzuna" | "reed" | "cache";
}
export interface TrendPoint { month: string /* YYYY-MM */; share: number }
export interface TrendSeries {
  skillId: SkillId; history: TrendPoint[];
  projection: { month: string; share: number; low: number; high: number }[];
  growthPerYear: number; // 0.12 = +12%/yr
  label: TrendLabel; source: "hn-whoishiring";
}
export interface Role { id: string; name: string } // catalogue: ml-engineer, software-engineer, data-analyst (+ more later)

// ---------- Student ----------
export type EvidenceSource =
  | "github" | "leetcode" | "codeforces" | "stackoverflow" | "kaggle" | "linkedin-pdf"
  | "certificate" | "keystone-pod" | "keystone-interview" | "micro-challenge";
export interface EvidenceItem {
  id: string; userId: string; skillId: SkillId; level: Level; confidence: number /* 0..1 */;
  source: EvidenceSource; url: string; quote?: string; createdAt: string;
}
export interface LearningDNA {
  targetRoles: string[]; // role ids, max 2, first = primary
  timelineLabel: string; // "Placement applications Sept 2027"
  targetDate: string; // ISO date
  hoursPerWeek: number; // 1..40
  theoryPractice: number; // 0 = all theory … 100 = all practice
  formats: ("video" | "docs" | "projects" | "pair")[];
  budget: "free" | "paid-ok";
  constraints: string[]; // "part-time job", "caring", "commuting"
  accessibility: ("dyslexia-friendly" | "audio-first" | "high-contrast" | "reduced-motion")[];
  language: string; // BCP-47, e.g. "en", "ur"
}
export type BadgeId =
  | "new-to-uni" | "international" | "first-gen" | "career-changer"
  | "helper" | "shipped" | "interview-ready";
export interface Profile {
  id: string; name: string; avatarUrl?: string;
  githubLogin?: string; leetcodeUser?: string;
  programmeId: string; year: 1 | 2 | 3 | 4; startedAt: string; // ISO, start at uni
  dna: LearningDNA; badges: BadgeId[];
  interests: string[]; availability: string[]; // "mon-eve", "sat-am"
  isDemo?: boolean;
}

// ---------- Bridge Map ----------
export type SkillStatus = "proven" | "degree-done" | "degree-upcoming" | "gap";
export interface BridgeNode {
  skillId: SkillId; name: string; category: SkillCategory; status: SkillStatus;
  demand: number; // 0..1 weight for primary target role
  trend?: TrendLabel; level: Level;
  evidenceIds: string[]; moduleCodes: string[];
  upcomingLabel?: string; // "Year 1 · Semester 2"
}
export interface BridgeEdge { from: SkillId; to: SkillId; kind: "prereq" | "co-occurs" }
export interface BridgeMap {
  userId: string; roleId: string; nodes: BridgeNode[]; edges: BridgeEdge[];
  readinessNow: number; readinessProjected: number; // 0..1
  generatedAt: string;
}

// ---------- Roadmap ----------
export interface Receipt {
  demandPct: number; // 41 = 41% of ads
  trend?: TrendLabel; growthPerYear?: number;
  coveredByDegree: "no" | "done" | "upcoming"; moduleCode?: string;
  evidenceIds?: string[]; reason: string; // one plain-English sentence
}
export interface RoadmapTask {
  id: string; type: "learn" | "practice" | "build" | "primer";
  title: string; resourceUrl?: string; free: boolean; hours: number; done?: boolean;
}
export interface RoadmapWeek {
  week: number; startDate: string; focusSkillId: SkillId; isExamWeek: boolean;
  tasks: RoadmapTask[]; proof: string; degreeLink?: string; receipt: Receipt;
}
export interface SkippedItem { skillId: SkillId; moduleCode: string; message: string }
export interface Roadmap {
  userId: string; roleId: string; version: number;
  readinessNow: number; readinessProjected: number;
  weeks: RoadmapWeek[]; skipped: SkippedItem[]; generatedAt: string;
}

// ---------- Community ----------
export interface PodMember { userId: string; learns: SkillId[]; teaches: SkillId[]; role: string }
export interface MatchExplanation { fromUserId: string; toUserId: string; text: string }
export interface ProjectIssue {
  title: string; body: string; assigneeUserId: string; reviewerUserId: string;
  skillId: SkillId; milestone: string; githubIssueUrl?: string;
}
export interface ProjectBrief { title: string; pitch: string; milestones: string[]; issues: ProjectIssue[]; repoUrl?: string }
export interface Pod {
  id: string; name: string; members: PodMember[]; explanations: MatchExplanation[];
  score: number; project?: ProjectBrief; discordChannelUrl?: string; createdAt: string;
}
export interface TrajectoryStep {
  year: 1 | 2 | 3 | 4 | 5;
  kind: "module-choice" | "project" | "society" | "hackathon" | "internship" | "placement" | "first-role";
  label: string;
}
export interface Trajectory {
  id: string; userId: string; name: string; programmeId: string;
  steps: TrajectoryStep[]; outcomeRole: string; advice: string;
  isDemo: boolean; openToChat: boolean;
}
export interface MomentumWeek {
  userId: string; week: string; // ISO week "2026-W45"
  score: number; baseline: number; changePct: number;
  breakdown: { kind: string; points: number; count: number }[];
}
export interface HelpRequest {
  id: string; fromUserId: string; toUserId?: string; // undefined = open to all helpers
  kind: "question" | "chat-15" | "code-review"; message: string;
  status: "open" | "accepted" | "done"; createdAt: string;
}
export interface GuideSuggestion {
  name: string; whyRelevant: string; publicUrl: string; source: "github" | "web";
  suggestedQuestion: string; draftMessage: string;
}

// ---------- Voice & automation ----------
export interface InterviewFeedback {
  userId: string; roleId: string;
  scores: { content: number; structure: number; clarity: number; confidence: number }; // 1..5
  fillerWordsPerMin: number; strengths: string[]; improvements: string[];
  transcript?: string; createdAt: string;
}
export interface Briefing {
  userId: string; weekOf: string; script: string; audioUrl?: string;
  topTasks: string[]; marketMoves: string[];
}

// ---------- Agents ----------
export type AgentName =
  | "orchestrator" | "syllabus" | "skillmap" | "market" | "trends" | "evidence" | "roadmap"
  | "matchmaker" | "architect" | "techlead" | "trajectories" | "guides" | "voice" | "n8n";
export interface AgentEvent {
  runId: string; agent: AgentName; status: "started" | "progress" | "done" | "error";
  message: string; ts: string; data?: Record<string, unknown>;
}

// ---------- API envelope ----------
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;
