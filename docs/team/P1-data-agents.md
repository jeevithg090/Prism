# P1: Data agents (Syllabus, Industry, Trends) + Industry Radar page

**Mission:** You teach Keystone what the **degree teaches** (the syllabus, read with Firecrawl) and what **industry wants** (job ads plus hiring trends). Everything else (the Bridge Map, the roadmap, pods) is built on your data, so ship fixtures early and cache everything.

**You own:**
- `data/skills.json`, `data/fixtures/programme.*`, `market.*`, `trends.json`, `data/cache/*` (except evidence)
- `lib/cache.ts`, `lib/connectors/{firecrawl,adzuna,reed,hn}.ts`, `lib/agents/{skillmap,syllabus,market,trends,lecturer}.ts`, `lib/schemas/data.ts`
- `app/api/{skills,roles,syllabus/extract,programmes/[id],market/[roleId],trends,lecturer/insights}/route.ts`
- `app/(app)/market/page.tsx`, `app/(app)/lecturer/page.tsx`, `components/market/*`, `components/lecturer/*`
- `scripts/warm-cache.ts`, `scripts/hn-backfill.ts`, `e2e/market.spec.ts`

**Review buddy:** P2 reviews your PRs. You review P2's PRs, and P2's infra PR is urgent, so review it first.

Read `docs/team/00-shared-contract.md` first. The contract wins if anything here disagrees with it.

---

## At a glance

| # | Deliverable | Priority | Due | Unblocks |
|---|---|---|---|---|
| PR1 | `skills.json`, fixtures, `lib/cache.ts`, stub routes | MUST | **15:00** | P2, P3, P5 |
| PR2 | Skill Mapper | MUST | 15:20 | P2 (graph), you (syllabus, market) |
| PR3 | Firecrawl connector + Syllabus Agent + **committed UoM cache** | MUST | 15:45 | P2 orchestrator |
| PR4 | Adzuna connector + Market Agent + cached 3 roles | MUST | 16:10 | P2 receipts, P3 dashboard |
| PR5 | Industry Radar page `/market` | MUST | 16:40 | Demo |
| PR6 | HN backfill + Trend Forecaster (real trends) | SHOULD | 16:50 | Radar chart (fixture covers it until then) |
| PR7 | `scripts/warm-cache.ts` + committed cache | SHOULD | 16:55 | DEMO_MODE with real data |
| PR8 | Lecturer Insights | COULD | after freeze? No: skip if late | — |

**You consume:**
- `llmJSON` from P2 (`lib/llm.ts`, ~15:00). Until it lands, mock it with `vi.mock` in tests and keep your code LLM-optional (`useLLM: false` path).
- Shared components from P3 (~15:15–15:30).
- `GET /api/graph/[userId]` from P2 (fixture route available from 15:00).

**You provide (exact signatures, other people import these):**
```ts
// lib/agents/skillmap.ts
export function getSkills(): Skill[];
export function canonicalize(term: string): SkillId | null;
export async function mapTextToSkills(text: string, opts?: { runId?: string; useLLM?: boolean }): Promise<{ skills: ModuleSkill[]; unknownTerms: string[] }>;
// lib/agents/syllabus.ts
export async function extractProgramme(input: { url?: string; text?: string; programmeId: string; runId?: string }): Promise<Programme>;
// lib/agents/market.ts
export function getRoles(): Role[];
export async function getRoleDemand(roleId: string, opts?: { location?: string; runId?: string; refresh?: boolean }): Promise<RoleDemand>;
// lib/agents/trends.ts
export async function getTrends(skillIds?: SkillId[]): Promise<TrendSeries[]>;
export function forecast(history: TrendPoint[]): Pick<TrendSeries, "projection" | "growthPerYear" | "label">;
// lib/connectors/firecrawl.ts
export async function fcSearch(query: string, limit?: number): Promise<{ url: string; title: string; description?: string }[]>;
export async function fcScrapeMarkdown(url: string): Promise<string>;
export async function fcScrapeJSON<T>(url: string, jsonSchema: object, prompt: string): Promise<T>;
export async function fcCrawl(url: string, opts: { limit: number; includePaths?: string[] }): Promise<{ url: string; markdown: string }[]>;
// lib/cache.ts
export async function withCache<T>(key: string, fn: () => Promise<T>, opts?: { ttlSec?: number; fixture?: string }): Promise<T>;
```

---

## Step 0 (14:20–14:35): accounts and setup

1. **Firecrawl:** sign up at firecrawl.dev and copy the API key into `FIRECRAWL_API_KEY`.
2. **Adzuna:** register at developer.adzuna.com, create an app, then copy `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Test it:
   ```bash
   curl "https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=$ADZUNA_APP_ID&app_key=$ADZUNA_APP_KEY&what=data%20analyst&results_per_page=5"
   ```
3. **Reed** (optional backup): reed.co.uk/developers → `REED_API_KEY`. It uses Basic auth with the key as the username.
4. **HN Algolia** needs no key. Test it:
   ```bash
   curl "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=3"
   ```
5. Once P3 says "repo ready":
   ```bash
   gh repo clone <owner>/keystone && cd keystone && npm ci && cp .env.example .env.local
   ```
   Fill in your keys, then run `npm run dev` and open localhost:3000.

---

## Task 1 (PR1, MUST, due 15:00): skills, fixtures, cache, stub routes
**Branch:** `p1/fixtures-stubs`

### Files
`data/skills.json`, `data/fixtures/programme.uom-bsc-cs.json`, `data/fixtures/market.{ml-engineer,software-engineer,data-analyst}.json`, `data/fixtures/trends.json`, `lib/cache.ts`, `lib/cache.test.ts`, `lib/schemas/data.ts`, and the 6 stub routes.

### Steps
1. **`data/skills.json`:** a `Skill[]` with **≥ 120 skills**, including **every core ID** in contract §5. Each skill has `aliases` (lowercase variants) and `prereqs`. Examples:
   ```json
   {"id":"javascript","name":"JavaScript","category":"language","aliases":["js","javascript","ecmascript","es6"],"prereqs":[]},
   {"id":"nodejs","name":"Node.js","category":"framework","aliases":["node","node.js","nodejs"],"prereqs":["javascript"]},
   {"id":"postgresql","name":"PostgreSQL","category":"data","aliases":["postgres","postgresql","psql"],"prereqs":["sql"]},
   {"id":"kubernetes","name":"Kubernetes","category":"cloud-devops","aliases":["k8s","kubernetes"],"prereqs":["docker","linux"]},
   {"id":"machine-learning","name":"Machine learning","category":"ml-ai","aliases":["ml","machine learning"],"prereqs":["python","statistics","linear-algebra"]},
   {"id":"scikit-learn","name":"scikit-learn","category":"ml-ai","aliases":["sklearn","scikit-learn","scikit learn"],"prereqs":["python","machine-learning"]},
   {"id":"llm-evaluation","name":"LLM evaluation","category":"ml-ai","aliases":["llm evaluation","llm evals","evals","model evaluation"],"prereqs":["llm-apps"]}
   ```
   Then add more: go, rust, kotlin, swift, r, scala, nextjs, vue, angular, django, fastapi, flask, spring, graphql, redis, mongodb, kafka, spark, airflow, dbt, snowflake, tableau, power-bi, excel, gcp, azure, terraform, ansible, prometheus, observability, microservices, distributed-systems, operating-systems, networking, compilers, concurrency, functional-programming, oop, design-patterns, unit-testing, tdd, accessibility, ux-design, figma, computer-vision, nlp, reinforcement-learning, prompt-engineering, rag, langchain, huggingface, transformers, mlflow, feature-engineering, a-b-testing, probability, calculus, discrete-maths, cryptography, cybersecurity, devops, sre, agile, scrum, jira, technical-writing, presentation, problem-solving, leadership, and so on.
2. **`programme.uom-bsc-cs.json`:** a realistic `Programme` (`id: "uom-bsc-cs"`, `university: "University of Manchester"`, `source: "cache"`).
   - At least 12 modules across years 1–3 and both semesters, with placeholder codes `COMP1xxxx`.
   - Example titles: Fundamentals of Computation, Introduction to Programming 1 & 2, Algorithms and Data Structures, Software Engineering, Database Systems, Operating Systems, Machine Learning, AI and Games, Distributed Systems, Third Year Project.
   - Each module has `topics`, `learningOutcomes`, `skills[]` using core IDs, and a one-line `industryNote`.
   - Leave docker, kubernetes, aws, ci-cd, llm-evaluation, vector-databases and mlops **out** of every module. These are the "gaps" in the demo story.
3. **Market fixtures** (one `RoleDemand` per role):
   - `adsAnalysed` around 150–250, `location: "UK"`, `source: "cache"`.
   - The `skills` array is sorted by share. For ml-engineer it must include: python 0.86, machine-learning 0.78, pytorch 0.52, sql 0.48, **docker 0.41**, aws 0.38, mlops 0.33, llm-apps 0.31, kubernetes 0.27, llm-evaluation 0.19, vector-databases 0.17, git 0.45, statistics 0.40, communication 0.36.
   - Add realistic `salary` (GBP), 5 `topCompanies`, and 5 `sampleAds`.
4. **`trends.json`:** a `TrendSeries[]` for ≥ 12 skills, with 36 monthly history points (`2023-11` to `2026-10`) and 12 projection points carrying `low`/`high`.
   - Mark llm-apps, llm-evaluation, vector-databases, rag and mlops as **rising** (growth 0.2–0.6).
   - Mark python, sql and docker as **stable**, with docker at +0.12.
   - Mark jquery-style legacy skills and manual-testing as **declining**.
5. **`lib/cache.ts`:** behaviour exactly as in contract §8.
   ```ts
   import "server-only";
   import fs from "node:fs/promises"; import path from "node:path";
   const mem = new Map<string, { v: unknown; exp: number }>();
   const DEMO = () => process.env.DEMO_MODE === "true";
   export async function withCache<T>(key: string, fn: () => Promise<T>, opts: { ttlSec?: number; fixture?: string } = {}): Promise<T> {
     if (DEMO()) {
       const c = await readJson<T>(path.join(process.cwd(), "data/cache", `${key}.json`)); if (c) return c;
       if (opts.fixture) { const f = await readJson<T>(path.join(process.cwd(), "data/fixtures", opts.fixture)); if (f) return f; }
     }
     const hit = mem.get(key); if (hit && hit.exp > Date.now()) return hit.v as T;
     const v = await fn();
     mem.set(key, { v, exp: Date.now() + (opts.ttlSec ?? 86400) * 1000 });
     if (process.env.NODE_ENV !== "production") await writeJson(path.join(process.cwd(), "data/cache", `${key}.json`), v).catch(() => {});
     return v;
   }
   ```
   Also export `clearMemCache()` for tests. `readJson` returns null when the file is missing.
6. **`lib/schemas/data.ts`:** zod schemas `ProgrammeZ`, `ModuleZ`, `RoleDemandZ`, `TrendSeriesZ`, `SkillZ`, and request schemas `ExtractReqZ = z.object({ url: z.string().url().optional(), text: z.string().min(50).optional(), programmeId: z.string().default("uom-bsc-cs") }).refine(d => d.url || d.text)`.
7. **Stub routes**, each returning `{ ok: true, data }` from the fixture:
   - `GET /api/skills` → skills.json
   - `GET /api/roles` → `[{id:"ml-engineer",name:"ML engineer"},{id:"software-engineer",name:"Software engineer"},{id:"data-analyst",name:"Data analyst"}]`
   - `GET /api/programmes/[id]` → the programme fixture, or 404 `{ok:false,error:{code:"not_found"}}`
   - `GET /api/market/[roleId]` → the market fixture, or 404
   - `GET /api/trends?skills=` → filtered trends
   - `POST /api/syllabus/extract` → validate with `ExtractReqZ` (400 on failure), then return the programme fixture

### Required tests
1. `cache`: in DEMO_MODE it returns `data/cache/<key>.json` when present and does **not** call `fn` (`fn` is a `vi.fn`).
2. `cache`: in DEMO_MODE, with no cache file but `opts.fixture` set, it returns the fixture.
3. `cache`: outside demo mode, a second call within the TTL returns the memoised value and `fn` is called once.
4. `skills.json`: contains every core ID from contract §5, IDs are unique and kebab-case, every prereq exists, and every alias is lowercase.
5. Each fixture parses with its zod schema (`ProgrammeZ`, `RoleDemandZ`, `TrendSeriesZ`).
6. Route `GET /api/market/ml-engineer` returns 200 with `ok:true` and `data.roleId === "ml-engineer"`. Route `GET /api/market/nope` returns 404 with `ok:false`.
7. Route `POST /api/syllabus/extract` with `{}` returns 400; with `{url:"https://example.com"}` it returns 200 and a Programme.

### Ship it
```bash
npm run typecheck && npm run lint && npm test
git add -A && git commit -m "feat(data): skills taxonomy, fixtures, cache, stub routes"
git push -u origin p1/fixtures-stubs
gh pr create --base main --title "feat(data): skills taxonomy, fixtures, cache, stub routes" --body-file .github/pull_request_template.md --reviewer <P2-handle>
```
Paste the test output into the PR. Once it's approved and CI is green: `gh pr merge --squash --delete-branch`. Post in Discord: "Fixtures live: programme, market ×3, trends, skills."

**Done when:** all 7 tests pass, the fixtures load in the browser at `/api/market/ml-engineer`, and DEMO_MODE works.

---

## Task 2 (PR2, MUST, 15:00–15:20): Skill Mapper
**Branch:** `p1/skill-mapper` · **Files:** `lib/agents/skillmap.ts`, `lib/agents/skillmap.test.ts`

### Steps
1. `getSkills()` imports `data/skills.json` (a static import, so it's typed).
2. **Build an alias index once:** a map from each alias (and the id and lowercased name) to the skill id. Sort aliases by length, longest first, so "machine learning" wins over "ml".
3. `canonicalize(term)`: lowercase and trim the term, strip punctuation at the ends, then look it up. Return the id or null.
4. `mapTextToSkills(text, opts)`:
   1. **Deterministic pass:** for each alias, build the regex `(?<![a-z0-9+#.])${escape(alias)}(?![a-z0-9+#])`, case-insensitive, and test it against the text. Collect the ids. Special cases: "c" only counts as the standalone language when written as " C " or "C programming", and "r" only as " R " (language).
   2. **Level heuristic** from nearby verbs: "build", "implement", "develop" or "design" → 3; "use", "apply" or "write" → 2; otherwise → 1.
   3. **Optional LLM pass** (when `opts.useLLM !== false` **and** `OPENAI_API_KEY` is set): call `llmJSON` with:
      - **system:** "You map educational or job text onto a FIXED skill list. Only use ids from the list. If an important technology or skill is not on the list, add it to unknownTerms. Never invent ids."
      - **user:** `SKILL IDS: ${ids.join(", ")}\n\nTEXT:\n${text.slice(0, 6000)}`
      - **schema:** `z.object({ skills: z.array(z.object({ skillId: z.string(), level: z.union([z.literal(1),z.literal(2),z.literal(3)]) })), unknownTerms: z.array(z.string()) })`
      - Then drop any skillId that isn't in the taxonomy.
   4. Merge the passes, keeping the **max level** per skill. `emit({runId, agent:"skillmap", status:"progress", message:`mapped ${n} skills`})` when `runId` is set.
5. Export `trackUnknownTerms(terms: string[])`, an in-memory counter. Terms seen ≥ 3 times are returned by `emergingCandidates()`.

### Required tests (mock `@/lib/llm` and `@/lib/agents/events`)
1. `canonicalize("JS")` → "javascript"; `canonicalize("Postgres")` → "postgresql"; `canonicalize("k8s")` → "kubernetes"; `canonicalize("unknownthing")` → null.
2. `mapTextToSkills("Build REST APIs in Node and deploy with Docker", {useLLM:false})` includes rest-apis (level 3), nodejs and docker.
3. "Machine learning with scikit learn" → machine-learning and scikit-learn; "ml" doesn't double-count.
4. "JavaScript" doesn't match "java"; "C++" maps to cpp, not c.
5. With the LLM mocked to return `{skills:[{skillId:"fake",level:2},{skillId:"python",level:2}],unknownTerms:["mojo"]}`, the result drops "fake", keeps python and returns unknownTerms ["mojo"].
6. With `useLLM: true` and no `OPENAI_API_KEY`, `llmJSON` isn't called.

**Ship it:** commit `feat(skillmap): alias matcher + optional LLM mapping`, then open the PR with `--reviewer <P2-handle>`.

---

## Task 3 (PR3, MUST, 15:20–15:45): Firecrawl connector + Syllabus Agent
**Branch:** `p1/syllabus-agent` · **Files:** `lib/connectors/firecrawl.ts` (+ test), `lib/agents/syllabus.ts` (+ test), the real `app/api/syllabus/extract/route.ts`, and `data/cache/syllabus-uom-bsc-cs.json`

### Steps
1. **The connector hides SDK differences.** Open `node_modules/@mendable/firecrawl-js/README.md` and check which version is installed:
   - **v2:** `new Firecrawl({ apiKey })` with `.search(q,{limit})`, `.map(url,{search})`, `.crawl(url,{limit, includePaths, scrapeOptions:{formats:["markdown"]}})` and `.scrape(url,{formats:["markdown"]})`. JSON extraction is `.scrape(url,{formats:[{type:"json", schema, prompt}]})`.
   - **v1:** `new FirecrawlApp({apiKey})` with `.scrapeUrl` and `.crawlUrl`, and JSON extraction through `formats:["json"], jsonOptions:{schema,prompt}`.
   - Implement the 4 functions from "You provide" against whichever version is installed (verify in docs). Normalise the outputs. Give each call a 60-second timeout and throw `FirecrawlError` with the message.
2. **`extractProgramme({url, text, programmeId, runId})`**, wrapped in `withCache(\`syllabus-${programmeId}\`, …, {fixture:"programme.uom-bsc-cs.json"})`:
   1. `emit started`: "Syllabus Agent: reading programme page".
   2. If `text` is given, skip crawling and run step 5 on the text directly.
   3. Otherwise:
      ```ts
      pages = await fcCrawl(url, { limit: 40, includePaths: ["course-units", "course-details", "units", "module"] })
      ```
      If that returns fewer than 3 pages, fall back to `fcScrapeMarkdown(url)` plus `fcSearch(\`${programme name} course units site:manchester.ac.uk\`, 10)` and scrape the top 8 results. Emit "crawled N pages".
   4. For each page (up to 6 at a time, using a small concurrency helper), run `fcScrapeJSON(page.url, MODULE_SCHEMA, PROMPT)`:
      - **MODULE_SCHEMA:**
        ```js
        { type:"object", properties:{ units:{ type:"array", items:{ type:"object", properties:{ code:{type:"string"}, title:{type:"string"}, year:{type:"number"}, semester:{type:"string"}, credits:{type:"number"}, compulsory:{type:"boolean"}, topics:{type:"array",items:{type:"string"}}, learning_outcomes:{type:"array",items:{type:"string"}}, assessment:{type:"string"} }, required:["title"] } } } }
        ```
      - **PROMPT:** "Extract every course unit/module on this page with its code, title, year of study, semester (1, 2 or full-year), credits, whether compulsory, the list of topics, the learning outcomes and the assessment type. Return an empty list if none."
   5. Normalise: map semester strings into `"1"|"2"|"full-year"`; default the year from a code like COMP1xxxx → 1; dedupe by `code || title`. Emit "extracted N course units".
   6. For each module, run `mapTextToSkills(topics + outcomes, {runId})`, then generate `industryNote` with one batched `llmJSON` call: `{ notes: [{ code, note }] }` for all modules, each note ≤ 14 words of real-world usage. Emit "mapped N skills across N modules".
   7. Return the `Programme` (`source: "firecrawl"`), then emit done.
3. **Route:** validate, call `extractProgramme`, return the envelope. Errors return 502 `{code:"firecrawl_failed"}` with the message "Couldn't read that page. Paste the course text instead."
4. **Run it now** on the University of Manchester BSc Computer Science programme page (find the URL with `fcSearch` or Google). Check the JSON by eye, fix obvious misses by hand, and **commit `data/cache/syllabus-uom-bsc-cs.json`**. If Firecrawl can't read the site, use paste-text mode on the course-unit text instead.

### Required tests (mock the Firecrawl SDK module, the LLM and emit)
1. Normalisation: semester "Semester 2" → "2", "Full year" → "full-year"; code "COMP23111" → year 2.
2. Dedupe: two pages returning the same code produce one module.
3. Fallback: if `fcCrawl` returns 1 page, `fcSearch` is called and up to 8 pages are scraped.
4. Text mode: `{text}` never calls `fcCrawl`.
5. Events: emitted in order started → progress(crawled) → progress(extracted) → progress(mapped) → done.
6. Route: a Firecrawl throw returns 502 with `ok:false` and `code:"firecrawl_failed"`.
7. In DEMO_MODE, `extractProgramme` returns the cache/fixture without calling the SDK.

**Ship it:** commit `feat(syllabus): firecrawl syllabus agent + UoM cache`, then open the PR with `--reviewer <P2-handle>`. Include in the PR body the module count and 3 example mapped modules.

---

## Task 4 (PR4, MUST, 15:45–16:10): Market Agent (Adzuna + Firecrawl)
**Branch:** `p1/market-agent` · **Files:** `lib/connectors/adzuna.ts`, `lib/connectors/reed.ts`, `lib/agents/market.ts` (+ tests), the real route, and `data/cache/market-*.json`

### Steps
1. **Role catalogue** in `market.ts`:
   ```ts
   const ROLES = [
     { id: "ml-engineer", name: "ML engineer", query: "machine learning engineer" },
     { id: "software-engineer", name: "Software engineer", query: "graduate software engineer" },
     { id: "data-analyst", name: "Data analyst", query: "data analyst" },
   ]
   ```
   `getRoles()` returns `{id, name}`.
2. **Adzuna connector:**
   ```
   GET https://api.adzuna.com/v1/api/jobs/gb/search/{page}?app_id&app_key&what=<query>&where=<location?>&results_per_page=50&content-type=application/json
   ```
   Fetch pages 1–2 and map each result to `{ title, company: company.display_name, description, url: redirect_url, salaryMin: salary_min, salaryMax: salary_max, created }`.
3. **Reed connector (fallback):**
   ```
   GET https://www.reed.co.uk/api/1.0/search?keywords=<q>&resultsToTake=100
   ```
   Uses Basic auth (`base64(key + ":")`). Map it to the same shape (verify in docs).
4. **`getRoleDemand(roleId, {location="UK", runId, refresh})`**, wrapped in `withCache(\`market-${roleId}-uk\`, …, {ttlSec: 86400, fixture: \`market.${roleId}.json\`})`. When `refresh` is set, bypass the memory cache.
   1. Fetch the ads (Adzuna, falling back to Reed on error) and dedupe by `title|company` (lowercased). Emit "found N ads".
   2. Fetch full text for the first 15 with `fcScrapeMarkdown(url)` (5 at a time, up to 3000 characters each). If one fails, keep its description.
   3. **Skills per ad:** run `mapTextToSkills(text, {useLLM:false})` on every ad. Then run one batched `llmJSON` call over the 15 full texts to catch misses. Schema: `{ ads: [{ index, skillIds: string[] }] }`. The system prompt is the same as in Task 2.
   4. `share[skill] = adsMentioning / adsAnalysed`. Sort descending, keep the top 40, and round to 2 decimals.
   5. Join each skill's `trend` from `getTrends()` by skillId.
   6. **Salary:** take the midpoints of salary_min and salary_max where present, then compute p25, median and p75 with a sorted-array percentile. Leave salary undefined if there are fewer than 5 values.
   7. `topCompanies` is the top 5 by count; `sampleAds` is the first 5 ads with a URL.
   8. Emit "analysed N ads · top skill python 86%", then done. Return `RoleDemand` with `source: "adzuna"`.
5. **Route:** `GET /api/market/[roleId]?location=&refresh=1`. Unknown roles return 404.
6. Run it for all 3 roles and **commit `data/cache/market-<role>-uk.json`**.

### Required tests (mock fetch with recorded samples saved to `tests/http/adzuna/search-page1.json`)
1. Dedupe: 3 ads, 2 of them duplicates (same title and company with different case), give `adsAnalysed === 2`.
2. Share: with 4 ads, 3 of them mentioning docker, the docker share is 0.75 and the list is sorted descending.
3. Salary percentiles: midpoints [30k, 40k, 50k, 60k, 70k] give a median of 50000; fewer than 5 values give `salary` undefined.
4. Fallback: an Adzuna 500 causes Reed to be called.
5. A Firecrawl failure on one ad still counts that ad, using its description.
6. Route: an unknown role returns 404; a known role returns 200 and zod-valid `RoleDemandZ`.

**Ship it:** commit `feat(market): adzuna market agent with skill demand + salaries`, then open the PR with `--reviewer <P2-handle>`.

---

## Task 5 (PR5, MUST, 16:10–16:40): Industry Radar page `/market` (excellent UI)
**Branch:** `p1/industry-radar` · **Files:** `app/(app)/market/page.tsx`, `components/market/{RoleTabs,SkillDemandList,TrendFanChart,SkillPicker,RoleOutlookCard,SampleAds}.tsx`, component tests, `e2e/market.spec.ts`

### Wireframe (desktop; on mobile everything stacks in one column)
```
PageHeader: "Industry Radar" — "What UK employers are hiring for right now, and where it's heading."
[ ML engineer | Software engineer | Data analyst ]            (RoleTabs, defaults to the user's primary role)
┌StatCard: 214 ads analysed┐┌StatCard: £52k median (£44k–£63k)┐┌StatCard: Top hirer: ARM (12 ads)┐
┌ Top skills employers ask for ───────────────┐┌ Trend: where skills are heading ─────────────┐
│ python      ███████████████ 86%  stable  ✓You│ [chips: llm-apps ✓ docker ✓ python + add]      │
│ docker      ███████ 41%  📈 rising   ◎ Gap  │  fan chart: solid history, dashed projection,   │
│ …(top 15, "Show all")                       │  shaded band (low–high)                         │
└─────────────────────────────────────────────┘│ "A projection from past job postings, not a     │
                                               │  guarantee."                                    │
┌ Rising fast ┐ ┌ Cooling down ┐ ┌ Role outlook ┐ └─────────────────────────────────────────────────┘
┌ Sample ads (5, external links ↗) ┐   footnote: "Data: Adzuna job ads + Hacker News 'Who is hiring?' threads. Refreshed weekly by n8n."
```

### Steps
1. **Data:**
   - `useQuery(["market", roleId], () => apiGet<RoleDemand>(\`/api/market/${roleId}\`))`
   - `useQuery(["trends", picked], …)`
   - The user's map: `useQuery(["graph", userId, roleId], () => apiGet<BridgeMap>(\`/api/graph/${userId}?roleId=${roleId}\`))`. Build a `statusBySkill` map from `map.nodes`.
2. **SkillDemandList:**
   - Each row shows: skill name; a bar (width = share, colour `--primary`, with an animated grow-in); "86%" in `tabular-nums`; a `StatusBadge` for the trend when present; and on the right the **user's status** as a `StatusBadge` (proven / degree / gap).
   - Clicking a row adds the skill to the chart picker.
   - Each row is a `button` with the aria-label "python, 86% of ads, stable, you: proven".
3. **TrendFanChart:** Recharts `ResponsiveContainer > ComposedChart`.
   - One `Area` per picked skill for the band (`dataKey` is `[low, high]` from the projection; fill opacity 0.15).
   - A solid `Line` for history and a dashed `Line` (`strokeDasharray="6 4"`) for the projection.
   - A `ReferenceLine` at the current month labelled "Today".
   - The tooltip shows the month and "41% of postings".
   - Up to 4 skills, each with a distinct colour drawn from chart tokens (not the status colours).
   - Add a `<p className="sr-only">` text summary: "llm-apps rising +38% per year".
4. **Rising / cooling lists:** take the top 5 by `growthPerYear` among the role's skills; each line reads "+38%/yr" with `TrendingUp`/`TrendingDown` icons.
5. **RoleOutlookCard:** a role is "Rising" if the demand-weighted mean `growthPerYear` of its top-10 skills is > 0.1. Show one sentence, for example "Demand is growing, led by LLM apps and MLOps."
6. **States:**
   - **Loading:** 3 skeleton stat cards, 8 skeleton bars and a chart-shaped skeleton.
   - **Empty** (no skills): `EmptyState` — "No ads found for this role yet. Try another role or refresh."
   - **Error:** `ErrorState` — "We couldn't load job data." with [Retry] and [Use demo data] (which sets `?demo=1`).
   - **Success:** content plus the toast "Updated with today's ads" after a refresh.
7. **Motion:** bars grow in with a 40ms stagger, the chart fades in, and both are disabled under reduced motion.
8. **Mobile:** tabs scroll horizontally, the stat cards become a 1-column stack, and the chart is 260px tall.

### Required tests
1. Component: SkillDemandList renders "86%" and the trend badge text "Rising" with its icon (not colour only).
2. Component: rows show the user status "Gap" for docker given `statusBySkill`.
3. Component: clicking a row calls `onPick("docker")`; it's keyboard reachable (Tab, then Enter).
4. Component: with `isError`, ErrorState renders with a Retry button that calls `refetch`.
5. Unit: the outlook helper returns "rising" for the ml-engineer fixture.
6. e2e (`e2e/market.spec.ts`, DEMO_MODE): `/market?demo=1` shows "Industry Radar"; switching to "Data analyst" changes the ads count; the chart SVG is visible; `expectNoA11yViolations(page)` passes.

**Ship it:** commit `feat(market): industry radar page`. Open the PR with `--reviewer <P2-handle>` and attach **light, dark and mobile screenshots**.

---

## Task 6 (PR6, SHOULD, 16:15–16:50): HN backfill + Trend Forecaster
**Branch:** `p1/trends` · **Files:** `scripts/hn-backfill.ts`, `lib/connectors/hn.ts`, `lib/agents/trends.ts` (+ test), the real `/api/trends`, and `data/cache/trends.json`

### Steps
1. **`hn.ts`:**
   - `listWhoIsHiring(months=36)` calls `GET https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=100` and pages through results. Keep titles matching /Who is hiring\?/i. Map each to `{id: objectID, month: YYYY-MM from created_at}`.
   - `getComments(id)` calls `GET https://hn.algolia.com/api/v1/items/{id}` and returns the top-level `children[].text`, with HTML stripped.
2. **`scripts/hn-backfill.ts`:** for each month (3 at a time), count `commentsMentioning(skill) / totalComments` using the deterministic alias matcher (no LLM). Write `data/cache/trends-raw.json` as `{ skillId: TrendPoint[] }`, then log progress.
3. **`forecast(history)`:**
   1. Take the last 24 points and set `y = logit(clamp(share, 1e-4, 1-1e-4))` with x = 0..n-1.
   2. Fit ordinary least squares to get the slope b, intercept a, and the residual standard error s.
   3. Compute `growthPerYear = exp(12*b) - 1`.
   4. For h = 1..12, compute `yhat = a + b*(n-1+h)` and `se = s*sqrt(1 + 1/n + (x0-mean)^2/Sxx)`. Then `share = sigmoid(yhat)`, `low = sigmoid(yhat-1.96*se)`, `high = sigmoid(yhat+1.96*se)`. Month labels continue from the last history month.
   5. `label` = "rising" if growthPerYear > 0.15, "declining" if < -0.15, otherwise "stable".
4. **`getTrends(skillIds?)`:** read the raw cache (or the fixture), apply `forecast` to each skill, and filter by `skillIds`. Wrap it in `withCache("trends", …, {fixture:"trends.json"})`.
5. Run the backfill and commit `data/cache/trends.json`.

### Required tests
1. A synthetic series with constant share 0.1 gives growth ≈ 0 (±0.01) and the label "stable".
2. A series with logit increasing 0.05 per month gives growth ≈ exp(0.6)-1 ≈ 0.82 and the label "rising".
3. The projection has 12 points with low ≤ share ≤ high, all inside [0, 1].
4. A declining series gives "declining".
5. HN HTML stripping: `"<p>We use <i>Rust</i> &amp; Go</p>"` becomes "We use Rust & Go", which matches rust and go.
6. Route: `/api/trends?skills=docker` returns exactly 1 series.

**Ship it:** commit `feat(trends): HN hiring-history forecaster`, then open the PR with `--reviewer <P2-handle>`.

---

## Task 7 (PR7, SHOULD, by 16:55): warm cache
**Branch:** `p1/warm-cache`. `scripts/warm-cache.ts` calls `extractProgramme(UoM)`, `getRoleDemand` for each of the 3 roles, and `getTrends()`, then writes everything to `data/cache/`. Run it, commit the JSON, and check that `DEMO_MODE=true npm run dev` shows real data on `/market`.

**Test:** a smoke test that the script module exports `main` and that, with the connectors mocked, it writes 5 files (use a mock of the fs module).

## Task 8 (COULD): Lecturer Insights
Only start this if Tasks 1–7 are merged before 16:50. `GET /api/lecturer/insights?programmeId=` finds the role skills with demand ≥ 0.25 that **no module covers**. It returns `gaps` with `studentsTargeting` (count from the store's profiles) and `labIdeas`, produced by `llmJSON` with "suggest 3 practical lab ideas tied to these modules' learning outcomes". The `/lecturer` page shows a table of gaps, the lab idea cards, and the note "Anonymous: shown only for cohorts of 10 or more."

---

## 16:15 integration checkpoint (your part)
- [ ] `/api/programmes/uom-bsc-cs`, `/api/market/ml-engineer` and `/api/trends` return real cached data.
- [ ] P2's orchestrator calls your `extractProgramme`, `getRoleDemand` and `getTrends`, and the events show in the Activity panel.
- [ ] `/market` works on the Vercel preview.

## Bug bash (16:50–17:05)
Test **P2's** API outputs on the preview by checking that `/roadmap` receipts show real demand %. Then test the `/map` filters. Log issues in Discord, using the contract §9.5 states checklist and keyboard checks.

## Demo role
Talk to beat 5 (Industry Radar): *"LLM evaluation is rising fast, and Aisha's roadmap already includes it."* Fallback: DEMO_MODE cache.

## Cut list (in this order)
Lecturer Insights → Reed fallback → Firecrawl full-text step (use Adzuna descriptions) → live HN backfill (keep the fixture trends). **Never cut:** fixtures, the Skill Mapper, the syllabus cache, the market cache, `/market`.

## Risks
- **Uni site blocks Firecrawl:** use paste-text mode and hand-fix the cache JSON.
- **Adzuna limits:** cache, and keep Reed as the backup.
- **Bad skill matches:** use the word-boundary regex plus the tests.
- **LLM latency:** batch the calls, use `LLM_MODEL_FAST`, cache.

---

## PASTE THIS INTO YOUR CODING AGENT
> You are P1's coding agent on the Keystone hackathon repo. Read `docs/team/00-shared-contract.md` fully, then `docs/team/P1-data-agents.md`. Execute Tasks 1→7 in order. For each task:
> 1. `git switch main && git pull --ff-only && git switch -c <branch from the task>`
> 2. Write the listed tests first. Mock all network calls (fetch, the Firecrawl SDK) and `@/lib/llm` and `@/lib/agents/events`.
> 3. Implement exactly the signatures under "You provide".
> 4. Run `npm run typecheck && npm run lint && npm test`; all must pass.
> 5. Commit with the given Conventional Commit message, then `git push -u origin <branch>`, then `gh pr create --base main --title "<title>" --body-file .github/pull_request_template.md --reviewer <P2-handle>`, filling in the template with the test output.
> 6. Stop and give me the PR URL.
>
> Never push to `main`. Only edit files P1 owns. Honour `DEMO_MODE`. Return the `ApiResult` envelope from every route. For UI, follow contract §9: shared components from `components/keystone/`, the tokens, all 4 states, keyboard and aria, mobile, and the axe check. If something in my file conflicts with the contract, follow the contract and tell me.
