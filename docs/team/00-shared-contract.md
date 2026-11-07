# Keystone: shared team contract (all 5 people and their coding agents read this first)

> **This file is the single source of truth.** P1–P5 each have their own file (`P1-…md` to `P5-…md`) with step-by-step tasks. Your file tells you *what* to build; this file tells you *how we build together*: repo, types, APIs, Git and PR rules, tests and design system.
> Product spec: `Keystone-Reply-GUH-2026.md`. **Copy this whole `team/` folder into the repo at `docs/team/`** so every coding agent can read it.

---

## 1. Roles at a glance

| Person | Role | Owns (summary) | Review buddy (reviews your PRs) |
|---|---|---|---|
| **P1** | Data agents | Firecrawl Syllabus Agent, Market Agent (Adzuna/Reed), skill taxonomy + Skill Mapper, HN Trend Forecaster, `lib/cache.ts`, **Industry Radar page** (`/market`), Lecturer Insights (could) | **P2** |
| **P2** | Brain | `lib/llm.ts`, `lib/store.ts`, agent events + SSE, Orchestrator, Evidence Agent (GitHub/LeetCode), Bridge Map builder + readiness, Roadmap Agent | **P1** |
| **P3** | Frontend lead + UX + repo admin | Scaffold, CI, PR template, design system, app shell, landing, onboarding wizard, dashboard, **Bridge Map** + **Roadmap** pages, Agent Activity panel, Skill Passport, e2e demo test, Vercel deploy | **P4** |
| **P4** | Voice, automation, story | ElevenLabs (mock interview, voice onboarding, text-to-speech), n8n W1–W6 + Discord, briefing API, `/interview` + `/launch` pages, pitch, video, Devpost, README | **P5** |
| **P5** | Community | Matchmaker, Project Architect (GitHub repo + issues), AI Tech Lead webhook, Trajectories, badges + newcomer mode, Momentum + Build Log, Guides, seed data, **Pods / Trajectories / Community pages** | **P3** |

Anyone can be a backup reviewer if your buddy is busy for more than 10 minutes.

---

## 2. Revised timeline (it's 14:15; submissions close at 18:00)

| Time | Everyone | Notes |
|---|---|---|
| **14:20–14:35** | **P3** creates the repo and pushes the scaffold commit (§4). Everyone else sets up their accounts and keys (their file, step 0) | The only direct push to `main` ever. Branch protection is switched on straight after |
| **14:35–15:00** | **Fixtures first:** each person opens PR #1 with their **fixture JSON + stub API routes that return those fixtures** (§7) | Unblocks every UI right away |
| **15:00–15:45** | Reply workshop: **P4** attends and pitches in 60 seconds. Everyone else builds MUST features | P4 posts the feedback in Discord |
| **15:00–16:15** | Real implementations of MUST features, in small PRs every 30–45 minutes | |
| **16:15** | ✅ **Integration checkpoint:** onboard Aisha → Bridge Map → Roadmap → Pod works end to end on `main` (preview URL) | P3 runs the e2e demo test |
| **16:15–16:50** | SHOULD features + polish | |
| **16:50–17:05** | 🐞 **Bug bash:** each person tests their buddy's pages against the §10 checklist | Fix PRs only |
| **17:05** | 🔒 **FEATURE FREEZE.** Only `fix:` PRs from now on (still reviewed) | |
| **17:05–17:40** | P4: video + Devpost. P3: final deploy. Everyone: README section for their area | |
| **17:40–17:50** | **Submit** (Devpost + Reply's own process) | Don't wait until 17:59 |
| 18:00–18:30 | Rehearse the demo twice | Judging 18:30 |

**If you're behind:** cut COULD, then SHOULD, from your own file. **Never cut the demo spine:** Syllabus → Bridge Map → Roadmap → Pods.

---

## 3. Stack and versions (all deps are installed in the scaffold to avoid `package.json` conflicts)

- **Node 22**, **npm** (no pnpm or yarn), **Next.js `@latest` (App Router) + TypeScript (strict)**, **Tailwind CSS v4**, **shadcn/ui**, **lucide-react**
- Runtime deps (P3 installs all of them in the scaffold):
  `zod openai @mendable/firecrawl-js octokit @supabase/supabase-js @tanstack/react-query motion recharts react-force-graph-2d sonner nanoid date-fns @elevenlabs/elevenlabs-js @elevenlabs/react pdf-parse clsx tailwind-merge class-variance-authority cmdk`
- Dev deps:
  `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright tsx wait-on prettier`
- If you need a new dependency, add it in a **separate tiny PR** titled `chore(deps): add <pkg>` so `package.json` conflicts stay trivial.
- `react-force-graph-2d` and anything that uses `window` must be imported with `next/dynamic` and `{ ssr: false }`.

**npm scripts** (P3 sets these up):
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint || eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "warm-cache": "tsx scripts/warm-cache.ts",
  "hn-backfill": "tsx scripts/hn-backfill.ts",
  "seed": "tsx scripts/seed.ts"
}
```

---

## 4. Repository layout and file ownership

**Only edit files you own.** To change someone else's file, ask them, or open a PR and request their review.

```
keystone/
├─ app/
│  ├─ layout.tsx, globals.css, page.tsx (landing), providers.tsx ......... P3
│  ├─ (app)/layout.tsx (app shell: sidebar, top bar, activity panel) .... P3
│  ├─ (app)/onboard/page.tsx ............................................. P3
│  ├─ (app)/dashboard/page.tsx ........................................... P3
│  ├─ (app)/map/page.tsx ................................................. P3
│  ├─ (app)/roadmap/page.tsx ............................................. P3
│  ├─ (app)/profile/[id]/page.tsx (Skill Passport) ....................... P3
│  ├─ (app)/market/page.tsx (Industry Radar) ............................. P1
│  ├─ (app)/lecturer/page.tsx (could) .................................... P1
│  ├─ (app)/pods/page.tsx, (app)/pods/[podId]/page.tsx ................... P5
│  ├─ (app)/trajectories/page.tsx ........................................ P5
│  ├─ (app)/community/page.tsx (help feed, guides) ....................... P5
│  ├─ (app)/interview/page.tsx ........................................... P4
│  ├─ launch/page.tsx (campaign landing) ................................. P4
│  └─ api/… (see §6; each route is owned by its feature owner)
├─ components/
│  ├─ ui/ (shadcn generated) ............................................. P3
│  ├─ shell/ (Sidebar, TopBar, ActivityPanel, PersonaSwitcher) ........... P3
│  ├─ keystone/ (shared domain components, §9.6) ......................... P3 (everyone uses them)
│  ├─ onboarding/ map/ roadmap/ passport/ ................................ P3
│  ├─ market/ lecturer/ .................................................. P1
│  ├─ pods/ trajectories/ community/ momentum/ ........................... P5
│  └─ voice/ ............................................................. P4
├─ lib/
│  ├─ types.ts (THE CONTRACT, §5) ........................................ P3 creates in scaffold; changes need P2 + P3 approval
│  ├─ env.ts, session.ts, utils.ts, fetcher.ts ........................... P3
│  ├─ llm.ts, store.ts, agents/events.ts, agents/orchestrator.ts ......... P2
│  ├─ cache.ts ........................................................... P1
│  ├─ connectors/firecrawl.ts adzuna.ts reed.ts hn.ts .................... P1
│  ├─ connectors/github.ts leetcode.ts codeforces.ts stackexchange.ts linkedinPdf.ts … P2
│  ├─ agents/syllabus.ts skillmap.ts market.ts trends.ts lecturer.ts ..... P1
│  ├─ agents/evidence.ts roadmap.ts, graph/build.ts graph/readiness.ts ... P2
│  ├─ agents/matchmaker.ts architect.ts techlead.ts trajectories.ts guides.ts, momentum.ts, badges.ts … P5
│  ├─ voice/*.ts, briefing.ts, n8n.ts .................................... P4
│  └─ schemas/<area>.ts (zod schemas for your API boundary) .............. each owner
├─ data/
│  ├─ skills.json (taxonomy) ............................................. P1
│  ├─ fixtures/ (§7) ..................................................... each owner, for their outputs
│  ├─ cache/ (warm-cache output, committed) .............................. P1 (+ P2 for evidence)
│  └─ seed/students.json, seed/trajectories.json ......................... P5
├─ n8n/*.json (exported workflows) ....................................... P4
├─ scripts/warm-cache.ts hn-backfill.ts .................................. P1   · scripts/seed.ts … P5
├─ supabase/schema.sql ................................................... P2
├─ e2e/demo.spec.ts (P3) · e2e/market.spec.ts (P1) · e2e/pods.spec.ts (P5) · e2e/interview.spec.ts (P4)
├─ .github/workflows/ci.yml, pull_request_template.md, CODEOWNERS ........ P3
├─ docs/team/ (these 6 files) ............................................ P3 copies them in
└─ README.md ............................ P4 owns the structure; each person writes their section
```

Unit tests sit next to the code they test: `lib/agents/roadmap.ts` → `lib/agents/roadmap.test.ts`.

---

## 5. `lib/types.ts`: THE CONTRACT (copy exactly; P3 commits this in the scaffold)

```ts
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
```

**Fixed IDs that every fixture and seed must use:**
- Demo user `aisha` (1st-year international CS student, 🌱 new-to-uni).
- Programme `uom-bsc-cs`.
- Roles `ml-engineer`, `software-engineer`, `data-analyst`.
- **Core skill IDs:** P1's `data/skills.json` must contain at least these, and fixtures may only use these until it's merged:

`python java javascript typescript c cpp sql html-css react nodejs rest-apis git linux docker kubernetes aws cloud-computing ci-cd testing data-structures algorithms databases postgresql system-design security-basics statistics linear-algebra machine-learning deep-learning pytorch tensorflow scikit-learn pandas numpy data-visualisation llm-apps llm-evaluation vector-databases mlops code-review communication teamwork agile`

---

## 6. API contract (all routes return the `ApiResult<T>` envelope; errors use HTTP 4xx/5xx + `{ok:false}`)

| Route | Method | Owner | Request | Response `data` |
|---|---|---|---|---|
| `/api/skills` | GET | P1 | — | `Skill[]` |
| `/api/roles` | GET | P1 | — | `Role[]` |
| `/api/syllabus/extract` | POST | P1 | `{ url: string; programmeId?: string }` | `Programme` |
| `/api/programmes/[id]` | GET | P1 | — | `Programme` |
| `/api/market/[roleId]` | GET | P1 | `?location=uk` | `RoleDemand` |
| `/api/trends` | GET | P1 | `?skills=docker,python` | `TrendSeries[]` |
| `/api/lecturer/insights` | GET | P1 (could) | `?programmeId=` | `{ gaps: {skillId:SkillId; demandPct:number; studentsTargeting:number}[]; labIdeas: string[] }` |
| `/api/profile` | POST | P2 | `Profile` (without `id` → created) | `Profile` |
| `/api/profile/[id]` | GET / PUT | P2 | — / `Partial<Profile>` | `Profile` |
| `/api/onboard/run` | POST | P2 | `{ userId: string }` | `{ runId: string }` (runs the full pipeline asynchronously) |
| `/api/agents/stream` | GET (SSE) | P2 | `?runId=` (add `&poll=1` to get `AgentEvent[]` as JSON instead, the fallback when SSE is flaky) | stream of `AgentEvent` (`event: agent`, `data: JSON`); ends with an orchestrator `done` |
| `/api/evidence/sync` | POST | P2 | `{ userId; githubLogin?; leetcodeUser? }` | `EvidenceItem[]` |
| `/api/evidence/[userId]` | GET | P2 | — | `EvidenceItem[]` |
| `/api/graph/[userId]` | GET | P2 | `?roleId=` | `BridgeMap` |
| `/api/roadmap/generate` | POST | P2 | `{ userId; roleId }` | `Roadmap` |
| `/api/roadmap/[userId]` | GET | P2 | — | `Roadmap` |
| `/api/roadmap/[userId]/tasks/[taskId]` | PATCH | P2 | `{ done: boolean }` | `RoadmapTask` |
| `/api/pods/match` | POST | P5 | `{ userId }` | `Pod` |
| `/api/pods/[podId]` | GET | P5 | — | `Pod` |
| `/api/pods` | GET | P5 | `?userId=` | `Pod[]` |
| `/api/projects/create` | POST | P5 | `{ podId }` | `ProjectBrief` (with `repoUrl` and issue URLs) |
| `/api/webhooks/github` | POST | P5 | GitHub `pull_request` event (HMAC-verified) | `{ reviewed: boolean }` |
| `/api/trajectories` | GET | P5 | `?programmeId=` | `Trajectory[]` |
| `/api/trajectories/similar` | GET | P5 | `?userId=&limit=5` | `{ trajectory: Trajectory; similarity: number }[]` |
| `/api/help` | GET / POST | P5 | — / `Omit<HelpRequest,"id"\|"status"\|"createdAt">` | `HelpRequest[]` / `HelpRequest` |
| `/api/guides/find` | POST | P5 | `{ userId }` | `GuideSuggestion[]` |
| `/api/momentum/[userId]` | GET | P5 | — | `MomentumWeek[]` (latest last) |
| `/api/badges/[userId]` | GET | P5 | — | `BadgeId[]` |
| `/api/interview/config` | GET | P4 | `?userId=&roleId=` | `{ agentId: string; signedUrl?: string; dynamicVariables: Record<string,string> }` |
| `/api/interview/feedback` | POST | P4 | `{ userId; roleId; transcript: string; durationSec: number }` | `InterviewFeedback` |
| `/api/voice/tools/[tool]` | POST | P4 | ElevenLabs tool call (header `x-keystone-secret`) | tool-specific JSON |
| `/api/tts` | POST | P4 | `{ text: string; voiceId?: string }` | `audio/mpeg` body (not the envelope) |
| `/api/briefing/[userId]` | GET | P4 | header `x-keystone-secret` | `Briefing` |
| `/api/n8n/trigger/[workflow]` | POST | P4 | `{ payload }` | `{ triggered: boolean }` |
| `/api/n8n/callback` | POST | P4 | header `x-keystone-secret` + `{ workflow; result }` | `{ ok: true }` |

**Route rules:**
- Validate the input with zod (`lib/schemas/<area>.ts`) and return `400 {ok:false, error:{code:"bad_request"}}` on failure.
- Wrap the handler body in try/catch and return `500 {ok:false, error:{code:"internal"}}`. Never leak stack traces or keys.
- **Honour `DEMO_MODE`:** when `process.env.DEMO_MODE === "true"`, return cached or fixture data instantly through `withCache` (§8).
- Server-only modules (connectors, `llm.ts`, `store.ts`) start with `import "server-only";`.

---

## 7. Fixtures first (PR #1 for everyone, due 15:00)

Each owner commits realistic fixture JSON for **their outputs** to `data/fixtures/`, plus **stub routes** that return them. The UI builds against fixtures from minute one.

| File | Type | Owner |
|---|---|---|
| `programme.uom-bsc-cs.json` | `Programme` (≥ 12 modules across years 1–3, real-looking topics; use placeholder codes like `COMP1xxxx` until Firecrawl gives real ones) | P1 |
| `market.ml-engineer.json`, `market.software-engineer.json`, `market.data-analyst.json` | `RoleDemand` | P1 |
| `trends.json` | `TrendSeries[]` (≥ 12 skills, 36 months of history + 12 of projection) | P1 |
| `skills.json` *(lives at `data/skills.json`)* | `Skill[]` | P1 |
| `profile.aisha.json` | `Profile` | P2 |
| `evidence.aisha.json` | `EvidenceItem[]` | P2 |
| `bridgemap.aisha.ml-engineer.json` | `BridgeMap` (≥ 30 nodes, a mix of all 4 statuses) | P2 |
| `roadmap.aisha.ml-engineer.json` | `Roadmap` (12 weeks, ≥ 2 skipped items, ≥ 1 exam week) | P2 |
| `agent-events.sample.json` | `AgentEvent[]` (a full onboarding run, about 20 events) | P2 |
| `students.json` *(at `data/seed/students.json`)* | `Profile[]` (12 students, years 1–3, varied skills, ≥ 3 with 🌱) | P5 |
| `pod.aisha.json` | `Pod` with `project` | P5 |
| `trajectories.json` *(at `data/seed/trajectories.json`)* | `Trajectory[]` (40, `isDemo: true`) | P5 |
| `momentum.aisha.json` | `MomentumWeek[]` (6 weeks) | P5 |
| `help.json` | `HelpRequest[]` (8) | P5 |
| `guides.aisha.json` | `GuideSuggestion[]` (4) | P5 |
| `interview.feedback.aisha.json` | `InterviewFeedback` | P4 |
| `briefing.aisha.json` | `Briefing` | P4 |

---

## 8. Shared infrastructure (who ships it, and when)

**`lib/cache.ts` (P1, by 15:00)**
```ts
export async function withCache<T>(key: string, fn: () => Promise<T>, opts?: { ttlSec?: number; fixture?: string }): Promise<T>
```
- In demo mode it returns `data/cache/<key>.json`, else `data/fixtures/<opts.fixture>`, else calls `fn()`.
- Otherwise it uses an in-memory TTL map, and in dev (not production) also writes `data/cache/<key>.json`.
- Keys are kebab-case, for example `syllabus-uom-bsc-cs` or `market-ml-engineer-uk`.

**`lib/llm.ts` (P2, by 15:00; until then mock it with `vi.mock` or a local stub)**
```ts
export async function llmJSON<T>(o: { agent: AgentName; runId?: string; system: string; user: string;
  schema: z.ZodType<T>; schemaName: string; model?: string; temperature?: number; cacheKey?: string }): Promise<T>
export async function llmText(o: { agent: AgentName; runId?: string; system: string; user: string; model?: string }): Promise<string>
```
- Uses the OpenAI SDK with structured outputs (`zodResponseFormat`). If that's unavailable, it falls back to JSON mode + zod parse + 1 retry.
- Model comes from `LLM_MODEL` (and `LLM_MODEL_FAST` for bulk extraction).
- Emits `progress` agent events, and caches by `cacheKey`.

**`lib/store.ts` (P2, by 15:00): a document store everyone uses (no per-person migrations)**
```ts
export interface Store {
  get<T>(collection: string, id: string): Promise<T | null>;
  list<T>(collection: string, filter?: { userId?: string }): Promise<T[]>;
  upsert<T extends { id?: string }>(collection: string, id: string, doc: T, userId?: string): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
}
export function getStore(): Store // Supabase if SUPABASE env set and not DEMO_MODE; else in-memory seeded from fixtures
```
- Supabase table (P2's `supabase/schema.sql`): `docs(collection text, id text, user_id text, data jsonb, created_at timestamptz default now(), updated_at timestamptz, primary key(collection,id))`.
- **Collection names:** `profiles`, `evidence`, `roadmaps`, `maps` (cached BridgeMaps, id `<userId>:<roleId>`), `pods`, `help`, `momentum_events`, `interviews`, `briefings`, `trajectories`, `agent_events` (SSE poll fallback), `waitlist`, `guides_usage`.

**`lib/agents/events.ts` (P2, by 15:00)**
```ts
export function emit(e: Omit<AgentEvent, "ts">): void           // in-memory pub/sub keyed by runId (+ last 200 kept)
export function subscribe(runId: string, cb: (e: AgentEvent) => void): () => void
export function newRunId(): string
```
Every agent, whoever owns it, calls `emit()` at start, at meaningful progress points (with numbers, for example "crawled 32 pages") and at the end.

**`lib/session.ts` (P3):** the current user id lives in cookie `ks_uid`, and `?demo=1` sets `aisha`. Full authentication is out of scope; Supabase GitHub OAuth is a COULD.

**`lib/env.ts` (P3):** zod-validated env; every key is optional when `DEMO_MODE=true`.

**`.env.example`** (P3 commits it; real values go in `.env.local`, which is git-ignored, and in Vercel env settings):
```
DEMO_MODE=false
OPENAI_API_KEY=            # from Reply's desk
LLM_MODEL=                 # the model Reply's key supports (ask at the desk)
LLM_MODEL_FAST=
FIRECRAWL_API_KEY=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
REED_API_KEY=
GITHUB_TOKEN=              # fine-grained PAT: read public data + create repos/issues in GITHUB_ORG
GITHUB_ORG=keystone-demo
GITHUB_WEBHOOK_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_INTERVIEW_AGENT_ID=
ELEVENLABS_ONBOARD_AGENT_ID=
ELEVENLABS_VOICE_ID=
N8N_WEBHOOK_BASE_URL=
KEYSTONE_SHARED_SECRET=    # n8n + ElevenLabs tool webhooks send this in x-keystone-secret
DISCORD_WEBHOOK_URL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Never commit secrets.** CI fails if it finds a key-shaped string (§12).

---

## 9. Design system and UX rules (excellent UI is a judging factor; P3 implements it, everyone follows it)

### 9.1 Principles
1. **One clear job per screen.** The headline answers "what should I do next?"
2. **Show the agents working.** Every long operation streams to the Agent Activity panel. Never show a dead spinner.
3. **Every number has context:** "41% of ML engineer ads", not "0.41".
4. **Explain, don't dictate.** Every recommendation has a **Why?** receipt.
5. **Kind, plain English.** Second person, encouraging, no jargon. *"You're 38% of the way there. Here's this week."*
6. **Built for the projector.** Base font 16px, key numbers ≥ 32px, strong contrast, no text under 13px.

### 9.2 Tokens (Tailwind v4 CSS variables in `app/globals.css`; light is the default for projectors, dark mode via a `.dark` class)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAFAF9` | `#0B0B0F` | page |
| `--card` | `#FFFFFF` | `#14141A` | surfaces |
| `--foreground` | `#0F172A` | `#F4F4F5` | text |
| `--muted-foreground` | `#64748B` | `#A1A1AA` | secondary text |
| `--border` | `#E7E5E4` | `#27272A` | 1px borders |
| `--primary` | `#4F46E5` (indigo-600) | `#818CF8` | primary actions, brand |
| `--primary-foreground` | `#FFFFFF` | `#0B0B0F` | |
| `--ring` | `#6366F1` | `#A5B4FC` | focus rings |
| **`--status-proven`** | `#059669` | `#34D399` | ✓ proven skill |
| **`--status-degree`** | `#2563EB` | `#60A5FA` | 🎓 degree covers it (done = filled, upcoming = dashed outline) |
| **`--status-gap`** | `#E11D48` | `#FB7185` | ◎ gap |
| **`--status-rising`** | `#D97706` | `#FBBF24` | 📈 rising trend accent |

**Never use colour alone.** Each status always pairs a **colour + icon + text label**: proven `CheckCircle2`, degree `GraduationCap`, gap `Target`, rising `TrendingUp`, declining `TrendingDown`.

### 9.3 Typography, spacing, shape and motion
- **Font:** Geist Sans for UI and Geist Mono for numbers and code (`next/font`). Use `tabular-nums` for stats.
- **Type scale:** display 48/56 semibold · h1 36/44 · h2 28/36 · h3 20/28 · body 16/26 · small 14/20 · caption 13/18.
- **Spacing:** 4px grid. Cards use `p-6`, sections `gap-6`/`gap-8`, max content width `max-w-7xl`.
- **Shape:** cards `rounded-2xl border bg-card shadow-sm`; inputs and buttons `rounded-xl`; pills `rounded-full`.
- **Motion** (the `motion` package, `motion/react`):
  - 150–250ms ease-out, with list items staggered 40ms.
  - Number count-up on the readiness ring.
  - Graph nodes fade and scale in.
  - **Respect `prefers-reduced-motion`** and the `reduced-motion` accessibility setting in Learning DNA.

### 9.4 Layout and navigation
- **App shell (P3):**
  - **Left sidebar** (icons + labels): Dashboard · Bridge Map · Roadmap · Industry Radar · Pods · Trajectories · Community · Interview · Passport.
  - **Top bar:** persona switcher (avatar + name + badges), readiness pill ("ML engineer · 38%"), theme toggle, **Agents** button (opens the right-hand Activity panel; it pulses while a run is live).
- **Mobile (< 768px):** the sidebar becomes a bottom tab bar with 5 primary items plus "More". No horizontal page scroll; 16px side gutters.
- **Page header pattern:** `PageHeader` with title, a one-line subtitle explaining the page, and the primary action on the right.

### 9.5 Every data view has 4 states (a PR is not done without them)
| State | Pattern |
|---|---|
| Loading | `Skeleton` blocks shaped like the real content (no generic spinner); if an agent is running, a "Watch the agents →" link |
| Empty | `EmptyState`: lucide icon in a soft circle + one-line explanation + **one** primary action |
| Error | `ErrorState`: what happened in plain words + **Retry** + "Use demo data" (switches to fixtures) |
| Success | Content + `sonner` toast for actions ("Pod created · repo is live ↗") |

### 9.6 Shared domain components (P3 builds them in `components/keystone/` by 15:30; others use them, never fork them)
| Component | Props (summary) | Notes |
|---|---|---|
| `PageHeader` | `title, subtitle, actions?` | |
| `StatusBadge` | `status: SkillStatus \| TrendLabel, size?` | colour + icon + label |
| `SkillChip` | `skillId, name, status?, level?, onClick?` | Shows level as 3 small dots |
| `ReadinessRing` | `value: number (0..1), projected?: number, label` | Animated radial ring; the projected value is a ghost arc |
| `ReceiptDrawer` | `receipt: Receipt, title` | A shadcn `Sheet` with a "Why am I seeing this?" layout |
| `EmptyState` / `ErrorState` / `LoadingSkeleton` | — | §9.5 |
| `BadgePill` | `badge: BadgeId` | 🌱 New to UoM · 🌍 International · 🧭 First-gen · 🔁 Career changer · 🤝 Helper · 🛠️ Shipped · 🎤 Interview-ready; tooltip explains it |
| `StatCard` | `label, value, delta?, hint?` | Big number + small context line |
| `AgentAvatar` | `agent: AgentName` | Icon + colour per agent (below) |
| `SectionCard` | `title, description?, children, actions?` | Standard card |
| `DemoDataNote` | — | Small "Demo data" tag for seeded content (honesty) |

**Agent identities (used by the Activity panel and anywhere agents are mentioned):**
orchestrator `Workflow` slate · syllabus `BookOpen` blue · skillmap `Network` violet · market `Briefcase` amber · trends `TrendingUp` orange · evidence `Github` zinc · roadmap `Route` indigo · matchmaker `Users` pink · architect `Hammer` teal · techlead `GitPullRequest` emerald · trajectories `Milestone` cyan · guides `Compass` lime · voice `Mic` rose · n8n `Zap` red

### 9.7 Accessibility (WCAG 2.2 AA)
- Text contrast ≥ 4.5:1.
- Visible focus ring on everything (`focus-visible:ring-2 ring-ring`).
- Everything works with the keyboard.
- Inputs have labels.
- Icon-only buttons have an `aria-label`.
- The Activity panel uses `aria-live="polite"`.
- **The Bridge Map graph has a "View as list" table alternative.**
- Charts have a text summary.
- Axe e2e checks must show **0 serious or critical violations** on your pages.

### 9.8 Data fetching on the client
- Use `@tanstack/react-query` (provider in `app/providers.tsx`, owned by P3) with the helper `lib/fetcher.ts` (`apiGet<T>(url)`, `apiPost<T>(url, body)`), which unwraps `ApiResult<T>` and throws on `ok:false`.
- Query keys: `["graph", userId, roleId]`, `["roadmap", userId]`, and so on.

---

## 10. Git and PR workflow (mandatory: nobody pushes to `main`)

**Setup (P3, once):** public repo `keystone` (public is required for free branch protection, and Devpost needs it public anyway). Add all members as collaborators. Push the scaffold, then turn on protection:
```bash
gh api -X PUT repos/<OWNER>/keystone/branches/main/protection --input - <<'JSON'
{ "required_status_checks": { "strict": false, "contexts": ["ci"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }
JSON
```
Connect **Vercel** to the repo, so **every PR gets a preview URL** for reviewers to click.

**Every feature, every time:**
```bash
git switch main && git pull --ff-only
git switch -c p2/roadmap-agent              # branch name: p<N>/<short-feature>
# … implement + write tests …
npm run typecheck && npm run lint && npm test   # all green before pushing
git add -A && git commit -m "feat(roadmap): degree-aware weekly plan with receipts"
git push -u origin p2/roadmap-agent
gh pr create --base main --title "feat(roadmap): degree-aware weekly plan with receipts" \
  --body-file .github/pull_request_template.md --reviewer <buddy-github-handle>
```
- **Commits:** Conventional Commits (`feat(area):`, `fix(area):`, `test(area):`, `chore:`, `docs:`, `contract:`).
- **Keep PRs small** (aim for under 400 lines changed) and open one every 30–45 minutes. **Draft PRs** are welcome for early feedback.
- **Reviewer** (target: within 10 minutes):
  ```bash
  gh pr checkout <N> && npm test
  ```
  Open the Vercel preview. For UI PRs, check the §9.5 states and keyboard navigation. Then approve or request changes:
  ```bash
  gh pr review <N> --approve
  gh pr review <N> --request-changes -b "…"
  ```
- **Merge:** the author merges once approved and CI is green:
  ```bash
  gh pr merge <N> --squash --delete-branch
  ```
- **Conflicts:**
  ```bash
  git fetch origin && git rebase origin/main
  ```
  Resolve the conflicts, then `git push --force-with-lease`. **Only force-push to your own branch.**
- **After 17:05**, only `fix:` PRs, still reviewed (a 1-minute review is fine).

**PR template** (`.github/pull_request_template.md`, P3):
```md
## What
## Why (which feature in docs/team/P?.md)
## How to test (commands + what you should see)
## Screenshots / recording (UI PRs: required, light + mobile)
## Checklist
- [ ] Tests added/updated and passing locally (`npm test`), output pasted below
- [ ] `npm run typecheck` and `npm run lint` pass
- [ ] Works with DEMO_MODE=true (fixtures/cache)
- [ ] UI: loading / empty / error / success states; keyboard + focus; axe clean
- [ ] Only touched files I own (or requested the owner's review)
- [ ] No secrets, no console.log noise
```

**CODEOWNERS** (P3 fills in the GitHub handles): map each path in §4 to its owner, so reviews are requested automatically.

---

## 11. Testing standard ("test before you ship")

| Layer | Tool | What | Where |
|---|---|---|---|
| Unit | **Vitest** | Pure logic: maths, ranking, parsing, prompt builders, zod schemas | `*.test.ts` next to the file |
| Integration (API) | Vitest | Import the route handler and call it with `new Request(…)`; assert status + envelope + zod-valid body; external HTTP and LLM **mocked** | `app/api/**/route.test.ts` |
| Component | Vitest + Testing Library (jsdom) | Rendering, states, interactions, aria | `components/**/X.test.tsx` |
| End to end | **Playwright** (DEMO_MODE) + **axe** | Your page's happy path + 0 serious/critical a11y issues | `e2e/<area>.spec.ts` |

**Rules:**
- **No real network in unit or integration tests.**
  - Mock `fetch` with `vi.spyOn(globalThis, "fetch")`, returning recorded samples from `tests/http/<service>/*.json`.
  - Mock the LLM: `vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(async () => fixture) }))`.
- **Every PR that adds logic adds tests.** Your file lists the **required test cases** for each feature; implement all of them.
- **A feature ships only when** its tests pass locally **and** in CI, and for UI features the reviewer has clicked through the preview.
- Name tests by behaviour: `it("skips skills a future module covers, unless primer week")`.
- **Config** (P3, in the scaffold):
  - `vitest.config.ts`: `environment: "node"` by default, with `// @vitest-environment jsdom` per component test; path alias `@/`; setup file `tests/setup.ts` importing `@testing-library/jest-dom/vitest`.
  - `playwright.config.ts`: `webServer: { command: "npm run build && npm run start", env: { DEMO_MODE: "true" } }`, baseURL `http://localhost:3000`, projects for desktop and `Pixel 7` (mobile).

**Axe helper** (P3 puts it in `e2e/utils.ts`; everyone uses it):
```ts
import AxeBuilder from "@axe-core/playwright";
export async function expectNoA11yViolations(page) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""));
  if (bad.length) throw new Error(bad.map(v => v.id).join(", "));
}
```

---

## 12. CI (`.github/workflows/ci.yml`, P3): the job **must be named `ci`**

Steps:
1. Checkout.
2. Node 22 with npm cache.
3. `npm ci`
4. Secret scan: fail the job if `git grep -nE "(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_|xi-api-key)" -- ':!*.md'` finds anything.
5. `npm run typecheck`
6. `npm run lint`
7. `npm test`
8. `npm run build` with `DEMO_MODE=true`.

A second, non-required job `e2e` runs `npx playwright install --with-deps chromium && npm run test:e2e`.

---

## 13. Definition of Done (for every feature)
1. The code follows the contract types and uses shared components and tokens.
2. The required tests from your file are written and green locally and in CI.
3. It works in `DEMO_MODE=true` (fixtures and cache) **and** live.
4. UI: all 4 states, keyboard access, focus rings, axe clean, mobile layout checked, no layout shift.
5. Agents emit `AgentEvent`s with real numbers.
6. The PR is reviewed by your buddy, with screenshots for UI, then squash-merged.
7. Your fixture is updated if the output shape gained fields.

---

## 14. Communication
- Discord channel `#keystone-dev`. Post `PR #N ready: <title> (@buddy)`, and `BLOCKED: <what> (@who)` the moment you're blocked for more than 5 minutes.
- **Contract change protocol:** if you need a new field, open a tiny `contract:` PR that changes `lib/types.ts` (and the fixture), and tag P2 and P3. Additive changes only (new optional fields). Never rename or remove fields after 15:00.

---

## 15. Instructions for every coding agent (paste this, then your P-file, into Claude Code or Cursor)
> You are the coding agent for **P<N>** on the Keystone hackathon project. Read `docs/team/00-shared-contract.md` fully, then `docs/team/P<N>-*.md`. Rules:
> 1. Only create or edit files listed as owned by P<N>. If you need another owner's file changed, stop and tell me.
> 2. Use the exact types from `lib/types.ts` and the routes in §6. Return the `ApiResult` envelope.
> 3. Work task by task in the order of my P-file. For each task: create the branch → write the tests listed for that task → implement → run `npm run typecheck && npm run lint && npm test` → commit → push → `gh pr create` with the template filled (paste the test output) → tell me the PR URL. **Never push to `main`.**
> 4. Fixtures first: my first PR is fixtures + stub routes.
> 5. UI work must follow §9: shared components from `components/keystone/`, the tokens, all 4 states, accessibility, mobile.
> 6. Mock all network and LLM calls in tests. Never commit secrets. Honour `DEMO_MODE`.
> 7. If something in my P-file conflicts with this contract, the contract wins. Tell me about the conflict.
