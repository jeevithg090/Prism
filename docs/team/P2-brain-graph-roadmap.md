# P2: Brain (LLM, store and events infra · Evidence · Bridge Map · Roadmap · Orchestrator)

**Mission:** You own the core of Keystone. You build the **shared infrastructure everyone imports** (`llm.ts`, `store.ts`, `events.ts` and the live agent stream). Then you build the three pieces the demo depends on:
- the **Evidence Agent** (proof from GitHub),
- the **Bridge Map** (the knowledge graph and readiness score),
- the **Roadmap Agent** (a degree-aware weekly plan with receipts).

The **Orchestrator** runs the whole onboarding pipeline that judges watch in the Activity panel.

**Your infrastructure blocks everyone: ship PR1 by 14:55.**

**You own:**
- `lib/llm.ts`, `lib/store.ts`, `lib/agents/events.ts`, `lib/agents/orchestrator.ts`
- `lib/connectors/{github,leetcode,codeforces,stackexchange,linkedinPdf}.ts`
- `lib/agents/{evidence,roadmap}.ts`, `lib/graph/{build,readiness}.ts`, `lib/schemas/brain.ts`
- `supabase/schema.sql`
- `app/api/agents/stream`, `app/api/profile`, `app/api/profile/[id]`, `app/api/onboard/run`, `app/api/evidence/sync`, `app/api/evidence/[userId]`, `app/api/graph/[userId]`, `app/api/roadmap/generate`, `app/api/roadmap/[userId]`, `app/api/roadmap/[userId]/tasks/[taskId]`
- Fixtures `profile.aisha.json`, `evidence.aisha.json`, `bridgemap.aisha.ml-engineer.json`, `roadmap.aisha.ml-engineer.json`, `agent-events.sample.json`
- `data/cache/evidence-*.json`

**Review buddy:** P1 reviews your PRs, and you review P1's. You have **no UI pages**: P3 builds the Bridge Map and Roadmap screens from your APIs, and you pair with P3 at 15:45.

Read `docs/team/00-shared-contract.md` first. The contract wins.

---

## At a glance

| # | Deliverable | Priority | Due | Unblocks |
|---|---|---|---|---|
| PR1 | `llm.ts` + `store.ts` + `events.ts` + SSE route + `schema.sql` | **MUST** | **14:55** | **everyone** |
| PR2 | Fixtures + stub routes | MUST | 15:00 | P3 (map, roadmap, dashboard), P5 (matching), P4 (briefing) |
| PR3 | Profile routes (real) | MUST | 15:15 | P3 onboarding |
| PR4 | Evidence Agent (GitHub + LeetCode) | MUST | 15:40 | Bridge Map |
| PR5 | Bridge Map builder + readiness + `/api/graph` | MUST | 16:00 | P3 `/map`, P1 `/market`, P5 matching |
| PR6 | Roadmap Agent + routes | MUST | 16:15 | P3 `/roadmap`, dashboard; P4 briefing |
| PR7 | Orchestrator + `/api/onboard/run` (+ DEMO replay) | MUST | **16:15** | Integration checkpoint |
| PR8 | Codeforces, Stack Exchange, LinkedIn PDF | COULD | if time | — |

Order note: build **PR7's DEMO_MODE replay first**, right after PR2 (about 10 minutes), so P3's Activity panel can be developed against real events early. Do the real pipeline later.

**You consume (from P1):** `extractProgramme`, `getRoleDemand`, `getTrends`, `mapTextToSkills`, `getSkills`, `fcSearch`, `withCache`. Until they're merged, read fixtures directly through `withCache(..., {fixture})` or a local stub. Your tests mock these modules.

**You provide (exact signatures):**
```ts
// lib/llm.ts
export class LLMError extends Error { constructor(msg: string, public cause?: unknown) { super(msg) } }
export async function llmJSON<T>(o: { agent: AgentName; runId?: string; system: string; user: string; schema: z.ZodType<T>; schemaName: string; model?: string; temperature?: number; cacheKey?: string }): Promise<T>;
export async function llmText(o: { agent: AgentName; runId?: string; system: string; user: string; model?: string }): Promise<string>;
export async function embed(texts: string[]): Promise<number[][]>;
// lib/store.ts
export interface Store { get<T>(c: string, id: string): Promise<T | null>; list<T>(c: string, f?: { userId?: string }): Promise<T[]>; upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string): Promise<T>; remove(c: string, id: string): Promise<void> }
export function getStore(): Store;
// lib/agents/events.ts
export function emit(e: Omit<AgentEvent, "ts">): void;
export function subscribe(runId: string, cb: (e: AgentEvent) => void): () => void;
export function newRunId(): string;
// lib/agents/evidence.ts
export async function syncEvidence(i: { userId: string; githubLogin?: string; leetcodeUser?: string; runId?: string }): Promise<EvidenceItem[]>;
// lib/graph/build.ts
export function buildBridgeMap(i: { profile: Profile; programme: Programme; roleDemand: RoleDemand; evidence: EvidenceItem[]; trends: TrendSeries[]; now?: Date }): BridgeMap;
// lib/graph/readiness.ts
export function readiness(nodes: BridgeNode[]): number;
export function projectedReadiness(nodes: BridgeNode[], plannedSkillIds: SkillId[], upcomingByTarget: SkillId[]): number;
// lib/agents/roadmap.ts
export async function generateRoadmap(i: { profile: Profile; map: BridgeMap; programme: Programme; roleDemand: RoleDemand; trends: TrendSeries[]; runId?: string; now?: Date }): Promise<Roadmap>;
// lib/agents/orchestrator.ts
export async function runOnboarding(userId: string): Promise<{ runId: string }>;
```

---

## Step 0 (14:20–14:35)
1. **Supabase:** go to supabase.com, create a new project (region EU West / London), and copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (server only). Open the SQL editor and run the SQL below. Commit the same SQL as `supabase/schema.sql`.
   ```sql
   create table if not exists docs (
     collection text not null, id text not null, user_id text,
     data jsonb not null, created_at timestamptz default now(), updated_at timestamptz default now(),
     primary key (collection, id));
   create index if not exists docs_user_idx on docs (collection, user_id);
   alter table docs enable row level security; -- server uses the service role key; no public policies
   ```
2. **OpenAI:** get your key and the model name from P4, who collects them at Reply's desk. Set `OPENAI_API_KEY`, `LLM_MODEL` and `LLM_MODEL_FAST`.
3. **GitHub:** `GITHUB_TOKEN` will come from P5 (the org PAT). Until then, use your own fine-grained token with public read access only.
4. When the repo is ready: `gh repo clone <owner>/keystone && cd keystone && npm ci && cp .env.example .env.local`, fill in your keys, then `npm run dev`.

---

## Task 1 (PR1, MUST, due 14:55): infra (`llm`, `store`, `events`, SSE)
**Branch:** `p2/infra` · **Files:** `lib/llm.ts`, `lib/store.ts`, `lib/agents/events.ts`, `app/api/agents/stream/route.ts`, `supabase/schema.sql`, plus tests for each.

### `lib/agents/events.ts`
```ts
import "server-only"; import { EventEmitter } from "node:events"; import { nanoid } from "nanoid";
const g = globalThis as unknown as { __ksBus?: EventEmitter; __ksLog?: Map<string, AgentEvent[]> };
const bus = (g.__ksBus ??= new EventEmitter().setMaxListeners(100));
const log = (g.__ksLog ??= new Map());
export const newRunId = () => `run_${nanoid(10)}`;
export function emit(e: Omit<AgentEvent, "ts">) {
  const ev: AgentEvent = { ...e, ts: new Date().toISOString() };
  const arr = log.get(e.runId) ?? []; arr.push(ev); if (arr.length > 200) arr.shift(); log.set(e.runId, arr);
  bus.emit(e.runId, ev);
}
export function subscribe(runId: string, cb: (e: AgentEvent) => void) {
  (log.get(runId) ?? []).forEach(cb);           // replay for late subscribers
  bus.on(runId, cb); return () => { bus.off(runId, cb); };
}
```
If `runId` is undefined, agents should skip `emit()`. Export the helper `emitIf(runId, agent, status, message, data?)` for this.

### `app/api/agents/stream/route.ts` (server-sent events)
- Add `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.
- `GET(req)` reads `runId`, returning 400 if it's missing. Create a `ReadableStream` that:
  - subscribes and enqueues `event: agent\ndata: ${JSON.stringify(ev)}\n\n` for each event,
  - sends a heartbeat `: ping\n\n` every 15 seconds,
  - **closes** after an event with `agent==="orchestrator"` and `status` of `done` or `error`,
  - unsubscribes on `req.signal` abort.
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`.

### `lib/store.ts`
- **`MemoryStore`:** a `Map<collection, Map<id, {doc, userId}>>`. It's lazily seeded on first use:
  - `profiles` ← `data/fixtures/profile.aisha.json` + `data/seed/students.json` (if present)
  - `evidence` ← `evidence.aisha.json` (one doc per item, id = item.id)
  - `roadmaps` ← `roadmap.aisha.ml-engineer.json` (id `aisha`)
  - `pods` ← `pod.aisha.json` (if present)
  - `trajectories` ← `data/seed/trajectories.json` (if present)
  - `help` ← `help.json` (if present)
  - Missing files are skipped silently.
  - `list(c, {userId})` filters by `userId` when given.
  - Keep the instance on `globalThis` so it survives hot reload.
- **`SupabaseStore`:** uses `createClient(url, serviceRoleKey, { auth: { persistSession: false } })`.
  - `get` → `select data from docs where collection, id`.
  - `list` → `select data where collection (and user_id)`, ordered by `created_at`.
  - `upsert` → `upsert({collection, id, user_id, data, updated_at: now})`.
  - `remove` → `delete`.
- **`getStore()`:** returns `MemoryStore` if `DEMO_MODE==="true"` or the Supabase env vars are missing; otherwise `SupabaseStore`. **If a Supabase call throws, log a warning once and fall back to memory** so the demo never dies.

### `lib/llm.ts`
- `import OpenAI from "openai"; import { zodResponseFormat } from "openai/helpers/zod";`
- **`llmJSON`:**
  1. If `cacheKey` is set and memoised, return the cached value.
  2. `emitIf(runId, agent, "progress", "thinking…")`.
  3. Try `client.chat.completions.parse({ model: o.model ?? process.env.LLM_MODEL, temperature: o.temperature ?? 0.2, messages:[{role:"system",content:o.system},{role:"user",content:o.user}], response_format: zodResponseFormat(o.schema, o.schemaName) })` and read `choices[0].message.parsed`.
  4. **If `parse` or the helper is unavailable or throws:** call `chat.completions.create` with `response_format:{type:"json_object"}`, add the system suffix "Respond with JSON only matching the requested fields.", then `JSON.parse` and `o.schema.parse`. On a zod failure, **retry once** with the error message appended. If that also fails, throw `LLMError`.
  5. Store the result under `cacheKey` and return it.
- **`llmText`:** a plain completion that returns trimmed content.
- **`embed(texts)`:** if there's a key and not DEMO_MODE, call `client.embeddings.create({ model: "text-embedding-3-small", input: texts })` (verify the model name with Reply's key). Otherwise use a **deterministic fallback**: tokenise (lowercase words), hash each token into 256 buckets (FNV-1a), count, then L2-normalise. Also export `cosine(a,b)`.
- If there's no `OPENAI_API_KEY`, `llmJSON` throws `LLMError("no_key")`, and callers catch it and use their deterministic fallback.

### Required tests (mock `openai` with `vi.mock("openai")`; no network)
1. **events:** a subscriber added *after* 2 emits receives both (replay), then new ones. Unsubscribe stops delivery.
2. **events:** the run log is capped at 200.
3. **SSE route:** with a mocked `subscribe` emitting 2 events then orchestrator `done`, the response body contains 3 `event: agent` blocks and the stream closes. A missing `runId` returns 400.
4. **store (memory):** upsert, then get returns the doc; `list` with `{userId}` filters; `remove` deletes; it's seeded with `profiles/aisha`.
5. **store:** `getStore()` returns MemoryStore when `DEMO_MODE=true`.
6. **llm:** `parse` returning a valid object resolves to it. With `parse` throwing and the fallback returning invalid JSON first and valid JSON second, it resolves after 1 retry. Invalid twice throws `LLMError`.
7. **llm:** the same `cacheKey` calls the client once.
8. **embed fallback:** deterministic (same input gives the same vector), unit length, and the cosine of a text with itself is 1.

**Ship it:**
```bash
npm run typecheck && npm run lint && npm test
git add -A && git commit -m "feat(infra): llm wrapper, document store, agent events + SSE"
git push -u origin p2/infra
gh pr create --base main --title "feat(infra): llm wrapper, document store, agent events + SSE" --body-file .github/pull_request_template.md --reviewer <P1-handle>
```
Then post in Discord: "**Infra PR #N: please review fast**, everyone imports it." After it merges, announce: "llm/store/events on main."

---

## Task 2 (PR2, MUST, due 15:00): fixtures + stub routes
**Branch:** `p2/fixtures-stubs`

### Fixtures (`data/fixtures/`)
1. **`profile.aisha.json`:**
   ```json
   {"id":"aisha","name":"Aisha Rahman","githubLogin":"<a teammate's real GitHub login>","programmeId":"uom-bsc-cs","year":1,"startedAt":"2026-09-21","badges":["new-to-uni","international"],"interests":["computer vision","healthcare AI","open source"],"availability":["tue-eve","sat-am"],"isDemo":true,
    "dna":{"targetRoles":["ml-engineer"],"timelineLabel":"Summer internship applications, Sept 2027","targetDate":"2027-09-01","hoursPerWeek":8,"theoryPractice":70,"formats":["projects","video"],"budget":"free","constraints":["part-time job"],"accessibility":[],"language":"en"}}
   ```
2. **`evidence.aisha.json`:** about 10 items. Proven: python level 2 from GitHub, git level 2, html-css level 2, data-structures level 1 from LeetCode. Each has a real-looking `url` and a `quote` such as `"train.py:42 uses pandas groupby"`.
3. **`bridgemap.aisha.ml-engineer.json`:** ≥ 30 nodes.
   - proven: python, git, html-css
   - degree-done: data-structures (Year 1 · Semester 1)
   - degree-upcoming: statistics, linear-algebra, machine-learning, databases, algorithms, with `upcomingLabel`
   - gaps: docker (demand 0.41), aws, mlops, pytorch, llm-apps, llm-evaluation, vector-databases, kubernetes, ci-cd, sql
   - trends are set on the rising ones; edges come from prereqs
   - `readinessNow: 0.38`, `readinessProjected: 0.84`
4. **`roadmap.aisha.ml-engineer.json`:** 12 weeks starting next Monday.
   - Week 1 focus is docker, with receipt `{demandPct:41, trend:"stable", growthPerYear:0.12, coveredByDegree:"no", reason:"41% of ML engineer ads ask for Docker and none of your modules teach it."}`.
   - Week 2 is pytorch, week 3 sql…
   - One week has `isExamWeek: true` with half the hours.
   - Tasks are split about 70% build/practice and 30% learn.
   - All resources are free (official docs, freeCodeCamp, YouTube).
   - Proof lines are written as PR goals.
   - `skipped` has statistics ("Don't pay for a statistics course: your Year 1 Semester 2 maths module covers it.") and machine-learning.
5. **`agent-events.sample.json`:** about 20 events for `runId: "run_demo"`, in order:
   - orchestrator started "Building Aisha's bridge"
   - syllabus: started → "crawled 32 pages" → "extracted 41 course units" → done
   - skillmap: "mapped 87 skills across 41 modules"
   - market: "found 231 ads" → "analysed 214 ads · top skill python 86%" → done
   - trends: "forecast 40 skills · 6 rising"
   - evidence: "read 8 repos, 5 files, 23 commits" → "proved 4 skills" → done
   - roadmap: "ranked 14 gaps" → "skipped 2 skills your degree covers" → "planned 12 weeks" → done
   - orchestrator done with `data: {readinessNow:0.38, readinessProjected:0.84}`

### Stub routes (all return the envelope from fixtures or the store, with zod input validation from `lib/schemas/brain.ts`)
`POST /api/profile`, `GET|PUT /api/profile/[id]`, `POST /api/onboard/run` (returns `{runId:"run_demo"}` and replays the events, see Task 7), `POST /api/evidence/sync`, `GET /api/evidence/[userId]`, `GET /api/graph/[userId]`, `POST /api/roadmap/generate`, `GET /api/roadmap/[userId]`, `PATCH /api/roadmap/[userId]/tasks/[taskId]`.

### Required tests
1. Each fixture passes its zod schema (`ProfileZ`, `EvidenceItemZ[]`, `BridgeMapZ`, `RoadmapZ`, `AgentEventZ[]`).
2. The bridgemap fixture has all 4 statuses, and every edge endpoint exists in the nodes.
3. The roadmap fixture has 12 weeks, ≥ 1 exam week and ≥ 2 skipped items, and every `focusSkillId` exists in the bridgemap.
4. `GET /api/graph/aisha` returns 200 with `ok:true`. `GET /api/roadmap/nobody` returns 404 with `ok:false`.
5. `POST /api/profile` with an invalid body returns 400.

**Ship it:** commit `feat(brain): fixtures + stub routes`, then open the PR with `--reviewer <P1-handle>`.

---

## Task 3 (PR3, MUST, 15:00–15:15): profile routes (real)
**Branch:** `p2/profile`
- `POST /api/profile`: validate with `ProfileZ.omit({id:true}).extend({id: z.string().optional()})`. Set `id = body.id ?? nanoid(8)`, then `store.upsert("profiles", id, profile, id)`, and **set the cookie** `ks_uid=<id>` (httpOnly false so the client can read it; sameSite lax; path /). Return the profile.
- `GET /api/profile/[id]`: return it from the store, or 404.
- `PUT /api/profile/[id]`: merge a partial update (deep-merge `dna`), upsert and return it. Also add `export const PATCH = PUT;` so the frontend's `apiPatch` works.
- Also export `loadGraph(userId, roleId)` from `lib/graph/build.ts` (Task 5). P5 and P4 import it to get a user's BridgeMap.

**Tests:** create then get the same profile; PUT merges `dna.theoryPractice` without wiping other dna fields; the cookie header is set on POST; unknown id returns 404.
**Ship it:** commit `feat(profile): profile CRUD on store`.

---

## Task 4 (PR4, MUST, 15:15–15:40): Evidence Agent
**Branch:** `p2/evidence` · **Files:** `lib/connectors/github.ts`, `lib/connectors/leetcode.ts`, `lib/agents/evidence.ts` (+ tests), real routes, `data/cache/evidence-<login>.json`

### GitHub connector (`octokit`, auth `GITHUB_TOKEN`)
`getGithubProfile(login)` returns `{ user, repos, languages, readmes, files, commits }`:
1. `GET /users/{login}`
2. `GET /users/{login}/repos?sort=pushed&per_page=30` → drop forks, keep the top 8 by `pushed_at`.
3. For each repo: `GET /repos/{o}/{r}/languages` (bytes per language), and the README (`GET /repos/{o}/{r}/readme`, base64-decoded, first 3000 characters).
4. **Representative files:** for the top 3 repos, `GET /repos/{o}/{r}/git/trees/{default_branch}?recursive=1`. Pick up to 5 source files total (extensions `.py .ts .tsx .js .java .ipynb .sql .go .rs .c .cpp`, under 30KB, preferring names like main/app/model/train/index), fetch the contents, and keep the first 200 lines.
5. **Commits:** `GET /repos/{o}/{r}/commits?author={login}&per_page=5` on the top 2 repos. For each, `GET /repos/{o}/{r}/commits/{sha}` and keep `files[].patch` truncated to 1500 characters.
6. **Rate limits:** if `x-ratelimit-remaining < 20`, skip the commits and files steps and emit "GitHub rate limit low: using languages + READMEs".

### LeetCode connector (unofficial, so cache it and tolerate failure)
`POST https://leetcode.com/graphql` with the body:
```json
{"query":"query($u:String!){ matchedUser(username:$u){ submitStatsGlobal{ acSubmissionNum{ difficulty count } } tagProblemCounts{ advanced{ tagName problemsSolved } intermediate{ tagName problemsSolved } fundamental{ tagName problemsSolved } } } }","variables":{"u":"<user>"}}
```
Send the headers `Content-Type: application/json` and `Referer: https://leetcode.com`. On any error, return null (verify in docs; the endpoint may change).

### `syncEvidence({ userId, githubLogin, leetcodeUser, runId })`, wrapped in `withCache(\`evidence-${githubLogin ?? userId}\`, …, {fixture: userId==="aisha" ? "evidence.aisha.json" : undefined})`
1. `emitIf started` "Evidence Agent: reading GitHub".
2. **Language baseline:** for each language with bytes, map it to a skill (Python → python, TypeScript → typescript, Jupyter Notebook → python, HTML/CSS → html-css, …). Use `canonicalize` from P1 where possible. Level: > 50KB total → 2, otherwise 1. Confidence 0.5. The url is the repo URL.
3. **LLM code judgement** (only when files exist), using `llmJSON` with:
   - **system:** "You assess a student's demonstrated skills ONLY from the code shown. Be conservative. For each skill, give level 1 (aware), 2 (applies it correctly), or 3 (builds non-trivial things with it), a confidence 0..1, and a short quote naming file and line. Only use skill ids from the list."
   - **user:** `SKILL IDS: ${ids}\n\nREADMES:\n${readmes}\n\nFILES:\n${files.map(f=>`--- ${f.repo}/${f.path}\n${f.text}`)}\n\nCOMMIT PATCHES:\n${patches}`
   - **schema:** `z.object({ items: z.array(z.object({ skillId: z.string(), level: z.union([z.literal(1),z.literal(2),z.literal(3)]), confidence: z.number().min(0).max(1), quote: z.string(), path: z.string() })) })`
   - Drop unknown IDs. The url is `https://github.com/{o}/{r}/blob/{branch}/{path}`.
4. **Practices:** if commits exist → git level 2. If a test file exists (`test_`, `.test.`, `__tests__`) → testing level 1. If a `Dockerfile` exists → docker level 2. If `.github/workflows` exists → ci-cd level 2. These are deterministic checks from the tree.
5. **LeetCode:** map tags to skills: Array, Hash Table, Linked List, Tree, Stack, Heap and Graph → data-structures; Dynamic Programming, Greedy, Binary Search, Sorting and Backtracking → algorithms; Database → sql. Level: ≥ 50 solved in a group → 2, ≥ 10 → 1. Confidence 0.7. The url is `https://leetcode.com/u/<user>/`.
6. **Merge per skill:** keep the max level, the max confidence and the best quote. Ids are `ev_${skillId}_${source}`, `createdAt` is now, and `userId` is set.
7. Save each item with `store.upsert("evidence", id, item, userId)`. Emit "read N repos, N files, N commits", then "proved N skills (level ≥ 2)", then done.
8. If the LLM fails, keep the deterministic items and emit an error-status progress event "code review skipped: using languages", then continue.

**Routes:** `POST /api/evidence/sync` validates and calls `syncEvidence`. `GET /api/evidence/[userId]` lists from the store.

### Required tests (mock octokit, fetch and llm)
1. Languages `{Python: 80000, HTML: 2000}` give python level 2 and html-css level 1.
2. A tree with a `Dockerfile` and `.github/workflows/ci.yml` gives docker 2 and ci-cd 2.
3. An LLM item with an unknown skillId is dropped; a valid one keeps its quote and builds the blob URL correctly.
4. Merge: python from languages (level 2, 0.5) plus the LLM (level 3, 0.8) gives level 3 with confidence 0.8.
5. LeetCode: 60 Array + 20 Hash Table gives data-structures level 2; a null response contributes nothing and doesn't throw.
6. Rate limit low: no tree or commit calls are made, and the event message contains "rate limit".
7. An LLM throw still returns the deterministic items and emits a progress event mentioning "skipped".
8. The route validates its input (400 when userId is missing).

**Ship it:** commit `feat(evidence): github + leetcode evidence agent`. Run it on Aisha's login and commit `data/cache/evidence-<login>.json`.

---

## Task 5 (PR5, MUST, 15:40–16:00): Bridge Map builder + readiness
**Branch:** `p2/bridge-map` · **Files:** `lib/graph/build.ts`, `lib/graph/readiness.ts` (+ tests), the real `GET /api/graph/[userId]`

### Term timing (University of Manchester)
- Semester 1 runs 22 Sep to 23 Jan, Semester 2 runs 26 Jan to 12 Jun, and full-year runs Sep to Jun.
- A module in `year Y` and semester S starts at `startedAt.year + (Y-1)` in the matching month.
- `termEnd(module, startedAt)` and `termStart(...)` are pure helpers.
- **done** if `termEnd < now`; **upcoming** otherwise.
- `upcomingLabel` = `Year ${Y} · Semester ${S}`, or "Year 2 · Full year".

### `buildBridgeMap`
1. Role skills = `roleDemand.skills` (top 30). `demand[s] = share`.
2. Node set = role skills ∪ every module skill ∪ every evidence skill, capped at 80. Keep all role skills, then the evidence skills, then module skills sorted by level.
3. For each skill:
   - `maxEv` = the evidence with the highest level.
   - **proven** if `maxEv.level ≥ 2 && maxEv.confidence ≥ 0.6`.
   - otherwise, if any module teaches it: **degree-done** if any of those modules is done, else **degree-upcoming** (with the label of the earliest upcoming one).
   - otherwise **gap**.
   - Set `level` = maxEv?.level ?? (degree-done ? module level : 0), `evidenceIds`, `moduleCodes`, `trend` from trends, and `category`/`name` from `getSkills()`.
4. **Edges:** for each node, a `prereq` edge from each prereq that's also in the node set to the node.
5. `readinessNow = readiness(nodes)`. `readinessProjected` = `projectedReadiness(nodes, plannedSkillIds = the gap skills by priority that fit in the hours before targetDate (the roadmap uses the same helper), upcomingByTarget = degree-upcoming skills whose term ends before profile.dna.targetDate)`.

### `readiness(nodes)` (role skills only, those with `demand > 0`)
- `coverage`: proven 1.0, degree-done 0.7, degree-upcoming 0.4, gap 0.
- `Σ demand×coverage / Σ demand`, rounded to 2 decimals. If there are no role nodes, return 0.

### `projectedReadiness`
Copy the nodes, set `planned` to proven and `upcomingByTarget` to degree-done, then call `readiness`.

**Route** `GET /api/graph/[userId]?roleId=`:
1. Load the profile; roleId defaults to `dna.targetRoles[0]`.
2. `programme = await extractProgramme({programmeId: profile.programmeId})` (cache-backed).
3. `roleDemand = await getRoleDemand(roleId)`.
4. `evidence = store.list("evidence", {userId})`.
5. `trends = await getTrends()`.
6. Build the map and save it with `store.upsert("maps", \`${userId}:${roleId}\`, map, userId)`. (`maps` is a cache collection; add it to the contract's collection list in your PR description.)
7. **DEMO_MODE:** for aisha, return the fixture.

### Required tests (pure, no mocks except getSkills)
1. Status precedence: a skill with level-2 evidence at confidence 0.7 that's also taught by an upcoming module is **proven**.
2. Evidence level 2 at confidence 0.5 with no module gives **gap**.
3. Timing: startedAt 2026-09-21, now 2026-11-07: a Year 1 Semester 1 module is upcoming (it ends Jan 2027), and the label is "Year 1 · Semester 1". With now 2027-02-01, it's done.
4. `readiness`: demands {a:0.5 proven, b:0.3 degree-done, c:0.2 gap} give (0.5 + 0.21 + 0)/1.0 = 0.71.
5. `projectedReadiness`: making c planned gives 0.91.
6. Non-role skills don't affect readiness.
7. The node cap is 80, and all role skills are always kept.
8. Edges only connect nodes that exist.
9. Route: aisha in DEMO_MODE returns the fixture; a profile not found returns 404.

**Ship it:** commit `feat(graph): bridge map builder + readiness`, then pair with P3 for 10 minutes on `/map` with real output.

---

## Task 6 (PR6, MUST, 16:00–16:15): Roadmap Agent
**Branch:** `p2/roadmap` · **Files:** `lib/agents/roadmap.ts` (+ test), real routes

### Deterministic planner (do this first; the LLM only words the tasks)
1. **Gaps** = nodes with status `gap` and demand > 0, plus `degree-upcoming` nodes whose term ends **after** `targetDate`.
2. **Priority:** `p = demand × (1 + max(growthPerYear ?? 0, 0)) × prereqReady × (coveredLater ? 0.3 : 1)`.
   - `prereqReady` = 1 if all prereqs are proven, degree-done or already scheduled, otherwise 0.6.
   - `coveredLater` = the skill is degree-upcoming with its term ending before targetDate.
3. **Skipped:** every degree-upcoming role skill whose term ends before targetDate gets the message `Don't pay for a ${name} course: ${moduleTitle} (${moduleCode}) covers it in ${upcomingLabel}.` These are **not** scheduled, except for a 2-hour `primer` task in the week before that module's `termStart` if it falls within the 12 weeks.
4. **Weeks:** 12 weeks starting next Monday (`startDate` ISO).
   - **Exam weeks** are those overlapping 11–24 Jan or 18 May–5 Jun. They get `isExamWeek: true` and `hours = round(hoursPerWeek × 0.5)`.
   - Assign one focus skill per week from the priority queue (repeat the top skill for 2 weeks if its demand is > 0.4 and its level is 0).
5. **Hours split:** `practiceShare = theoryPractice / 100`. Learn hours are `round(h × (1 − practiceShare))` and build/practice hours are the remainder. Each week has 2–4 tasks, and the **sum of task hours equals the week's hours**.
6. **Receipt (deterministic):**
   - `demandPct = round(demand×100)`, plus `trend` and `growthPerYear` from the node and trends.
   - `coveredByDegree`: "no", "done" or "upcoming". `moduleCode` is set when relevant, and `evidenceIds` comes from the node.
   - `reason` (template): `${demandPct}% of ${roleName} ads ask for ${name}` + (trend rising ? `, and demand is up ${pct}% a year` : "") + (covered "no" ? " — none of your modules teach it." : ".")
7. **Proof per week:** a template by skill category. For cloud-devops: "Merge a PR that adds a Dockerfile to your pod repo". For ml-ai: "Push a notebook training a model and share the results in your pod". Default: "Merge a PR in your pod repo that uses ${name}".
8. **`degreeLink`:** if a done module relates to the skill through a prereq, write "Builds on what you learned in ${moduleTitle}".

### LLM wording + resources (one call for all 12 weeks; skip and use templates on failure)
`llmJSON` with:
- **system:** "You write concise, motivating study tasks for a university student. For each week you get a focus skill, hours for learning and for building, the student's preferred formats and budget. Return 2-4 tasks per week whose hours sum exactly to the given total. Prefer FREE high-quality resources (official docs, freeCodeCamp, MIT OpenCourseWare, Kaggle Learn, reputable YouTube). Give a real URL for learn tasks. Build tasks must extend the student's pod project or coursework (never share solutions to assessed work)."
- **user:** the JSON of `[{ week, skill, learnHours, buildHours, formats, budget, podProjectTitle? }]`
- **schema:** `z.object({ weeks: z.array(z.object({ week: z.number(), tasks: z.array(z.object({ type: z.enum(["learn","practice","build","primer"]), title: z.string(), resourceUrl: z.string().url().optional(), hours: z.number() })) })) })`

**Then post-validate:**
- Fix the hour sums by adjusting the last task.
- Set `free = true` only if the URL host is in `FREE_HOSTS = ["docs.docker.com","pytorch.org","freecodecamp.org","ocw.mit.edu","kaggle.com","youtube.com","developer.mozilla.org","learn.microsoft.com","aws.amazon.com/training","scikit-learn.org","huggingface.co","github.com","w3schools.com","fast.ai"]`.
- If `budget === "free"`, drop non-free URLs (keep the task with the title only).
- Ids are `t_${week}_${i}`.

**Assemble the `Roadmap`:**
- `version = (previous?.version ?? 0) + 1`, along with readinessNow, readinessProjected and generatedAt.
- Save with `store.upsert("roadmaps", userId, roadmap, userId)`.
- Emit "ranked N gaps", then "skipped N skills your degree covers", then "planned 12 weeks", then done.

**Routes:**
- `POST /api/roadmap/generate`: loads profile, map (via the graph route logic, a shared function `loadGraph(userId, roleId)` in `lib/graph/build.ts`), programme, roleDemand and trends, then calls `generateRoadmap`.
- `GET /api/roadmap/[userId]`: reads from the store, or 404.
- `PATCH …/tasks/[taskId]`: toggles `done`, saves, and **if all tasks in that week are now done**, upserts a momentum event into `momentum_events`: `{ id: nanoid(), userId, kind: "roadmap-milestone", ts }`. Returns the task.

### Required tests (mock llm; fixed `now = 2026-11-07`)
1. A skill covered by a module ending before targetDate is in `skipped` with the exact message format and is never a focus skill.
2. A primer task appears in the week before that module's termStart, when it falls within the window.
3. Every week's task hours equal the week's hours, and an exam week (Jan) has half the hours with `isExamWeek` true.
4. `theoryPractice: 70` with 10 hours gives learn hours = 3.
5. Priority: docker (0.41, gap) ranks above kubernetes (0.27, gap), and a coveredLater skill ranks lower.
6. Receipt: docker gives `demandPct` 41, `coveredByDegree` "no", and the reason contains "41% of" and "none of your modules".
7. `budget: "free"` with an LLM URL on a non-free host drops the URL; a docs.docker.com URL gives `free: true`.
8. If the LLM throws, the roadmap still has 12 weeks of template tasks.
9. PATCH marking the last open task in a week writes a `roadmap-milestone` momentum event.
10. Version increments on regenerate.

**Ship it:** commit `feat(roadmap): degree-aware roadmap agent with receipts`.

---

## Task 7 (PR7, MUST, by 16:15; build the DEMO replay early): Orchestrator
**Branch:** `p2/orchestrator` · **Files:** `lib/agents/orchestrator.ts` (+ test), real `POST /api/onboard/run`

### DEMO replay (build right after PR2, so P3 can wire the panel by 15:15)
If `DEMO_MODE==="true"` **or** `userId==="aisha" && process.env.DEMO_REPLAY==="true"`:
1. `runId = newRunId()`.
2. Read `agent-events.sample.json` and, without awaiting, re-emit each event with the new runId, sleeping a random 150–400ms between events. Keep it deterministic: use `[200,350,250,…]` by index.
3. Return `{runId}` immediately.

### Real pipeline
```ts
export async function runOnboarding(userId: string) {
  const runId = newRunId();
  void (async () => {
    emit({ runId, agent: "orchestrator", status: "started", message: `Building ${name}'s bridge` });
    const profile = await getStore().get<Profile>("profiles", userId);
    const roleId = profile.dna.targetRoles[0];
    const [programme, roleDemand, evidence, trends] = await Promise.all([
      safe(() => extractProgramme({ programmeId: profile.programmeId, runId }), fixtureProgramme, "syllabus"),
      safe(() => getRoleDemand(roleId, { runId }), fixtureMarket(roleId), "market"),
      safe(() => syncEvidence({ userId, githubLogin: profile.githubLogin, leetcodeUser: profile.leetcodeUser, runId }), [], "evidence"),
      safe(() => getTrends(), fixtureTrends, "trends"),
    ]);
    const map = buildBridgeMap({ profile, programme, roleDemand, evidence, trends });
    await getStore().upsert("maps", `${userId}:${roleId}`, map, userId);
    const roadmap = await generateRoadmap({ profile, map, programme, roleDemand, trends, runId });
    emit({ runId, agent: "orchestrator", status: "done", message: `Bridge ready: ${pct(map.readinessNow)} → ${pct(map.readinessProjected)}`, data: { readinessNow: map.readinessNow, readinessProjected: map.readinessProjected } });
  })().catch(err => emit({ runId, agent: "orchestrator", status: "error", message: "Something went wrong. Showing demo data." }));
  return { runId };
}
```
`safe(fn, fallback, agent)` catches the error, emits `{agent, status:"error", message:"failed: using cached data"}` and returns the fallback. **One agent failing never stops the run.**

**Route:** `POST /api/onboard/run` with body `{userId}` validates the input, checks the profile exists (404 otherwise), and returns `{runId}` immediately (202 is fine, but keep the envelope).

### Required tests (mock P1 modules, evidence, roadmap and emit; use fake timers for replay)
1. The happy path emits orchestrator started first and orchestrator done last, with `data.readinessNow` present.
2. If `getRoleDemand` throws, an error event is emitted for "market", the run still finishes with done, and the fixture was used.
3. All 4 data agents are called in parallel (all invoked before any resolves; check with deferred promises).
4. DEMO replay re-emits every sample event in order under the new runId.
5. The route with an unknown userId returns 404.

**Ship it:** commit `feat(orchestrator): onboarding pipeline + demo replay`. Then post: "Onboarding run is live. P3, hook up the panel to `/api/agents/stream?runId=`."

---

## Task 8 (COULD, only if everything above is merged before 16:45)
- **Codeforces:** `GET https://codeforces.com/api/user.info?handles=` and `user.status` → tags → algorithms or data-structures evidence.
- **Stack Exchange:** `GET https://api.stackexchange.com/2.3/users/{id}/top-tags?site=stackoverflow` → skills at level 2 with "can explain".
- **LinkedIn PDF:** `POST /api/evidence/linkedin` (multipart) → `pdf-parse` → P1's `mapTextToSkills` → evidence with `source:"linkedin-pdf"` and confidence 0.4 (it's self-reported, so low). **This needs a `contract:` PR to add the route.**

---

## 16:15 integration checkpoint (yours to make green)
- [ ] `/onboard` → `POST /api/profile` → `POST /api/onboard/run` → the Activity panel streams → `/dashboard` shows readiness → `/map` shows the real graph → `/roadmap` shows receipts and skipped items.
- [ ] It also works with `DEMO_MODE=true` (replay + fixtures).
- [ ] P5's `/api/pods/match` can read Aisha's map (`store.get("maps","aisha:ml-engineer")`, or `loadGraph`).

## Bug bash (16:50–17:05)
Test **P1's** `/market`: role tabs, the chart, and the "You: gap" markers match `/map`. Then check the APIs with bad inputs return 400 and missing ids return 404.

## Demo role
Drive the laptop during the onboarding beat. If the live run stalls, click **"Replay demo run"** in the Activity panel (DEMO replay). Know the receipt numbers by heart: docker 41%, readiness 38% → 84%.

## Cut list (in this order)
Task 8 → LeetCode → LLM code judgement (keep languages + tree heuristics) → LLM task wording (keep templates) → Supabase (stay on memory). **Never cut:** infra, fixtures, buildBridgeMap, the deterministic roadmap, DEMO replay.

## Risks
- **SSE behind Vercel:** keep `runtime="nodejs"` with heartbeats. If it's flaky, P3 can poll `GET /api/agents/stream?runId=&poll=1`, which returns the JSON array of logged events. Add this poll mode in Task 1, because it's cheap.
- **In-memory events on serverless:** the run and the stream can hit different instances. For the demo, **run locally or set `DEMO_MODE`**, or let the poll mode read events persisted to the store (`store.upsert("agent_events", runId, {events})`). Do this if the preview misbehaves.
- **GitHub rate limits:** use a token, cache, and the low-limit path.

---

## PASTE THIS INTO YOUR CODING AGENT
> You are P2's coding agent on the Keystone hackathon repo. Read `docs/team/00-shared-contract.md` fully, then `docs/team/P2-brain-graph-roadmap.md`. Execute in this order: Task 1 (infra, **urgent**), Task 2, Task 7's DEMO replay, Task 3, Task 4, Task 5, Task 6, then the rest of Task 7. For each task:
> 1. `git switch main && git pull --ff-only && git switch -c <branch>`
> 2. Write the listed tests first. Mock openai, octokit, fetch and P1's modules (`@/lib/agents/syllabus|market|trends|skillmap`). Use fake timers for the replay.
> 3. Implement exactly the signatures in "You provide".
> 4. Run `npm run typecheck && npm run lint && npm test`; all must pass.
> 5. Commit with the given message, then `git push -u origin <branch>`, then `gh pr create --base main --title "<title>" --body-file .github/pull_request_template.md --reviewer <P1-handle>`, with the test output pasted into the body.
> 6. Give me the PR URL and stop.
>
> Never push to `main`. Only edit P2-owned files. Every route returns the `ApiResult` envelope with zod-validated input. Honour `DEMO_MODE` (fixtures, memory store, replay). Agents emit `AgentEvent`s with real numbers, and one failing agent must never crash the run. If something in my file conflicts with the contract, follow the contract and tell me.
