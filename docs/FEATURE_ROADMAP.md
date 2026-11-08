# Keystone — Feature Roadmap

Built in a day for the Reply "AI on Campus" challenge at GreatUniHack 2026 (University of Manchester).
Today (8 Nov 2026) the hackathon is done; this roadmap is the post-hackathon plan to make Keystone
**even better**: more evidence sources, more proof, more automation, more shareable value.

Read `DESIGN.md` before any UI work; keep every data view to four states (LoadingSkeleton / EmptyState /
ErrorState / success), never invent demographic matching, and keep the four-test-minimum rule from
`AGENTS.md` (`tsc --noEmit`, `eslint`, `vitest` all green).

---

## Where Keystone is now

| Capability | What exists | Entry points |
|---|---|---|
| **Bridge Map** | degree vs job market vs proof, per-skill status (proven / degree-done / degree-upcoming / gap), readiness score | `lib/graph/build.ts`, `lib/graph/readiness.ts`, `app/api/graph/[userId]/route.ts` |
| **Roadmap** | weekly plan that never re-teaches a later module, receipts per task | `lib/graph/plan.ts`, `app/api/roadmap/generate/route.ts` |
| **Evidence (connectors)** | GitHub, **LeetCode, HackerRank, Codeforces, Stack Overflow, dev.to, LinkedIn PDF** — all replayable, degrade-kindly, deterministic ids | `lib/connectors/*.ts`, `app/api/evidence/sync/route.ts` |
| **Proof ladder** | 3 rungs (tried / built / can teach), skill-level view | `components/passport/`, `lib/agents/proof.ts` |
| **Community / pods** | help feed, guides, peer-matched pods with real GitHub projects, AI Tech Lead PR reviews | `components/community/`, `components/pods/`, `lib/agents/architect.ts`, `lib/agents/techlead.ts` |
| **Voice & briefing** | ElevenLabs weekly briefing, mock-interview scoring | `lib/voice/`, `app/api/briefing/[userId]/route.ts` |
| **Challenges** | auto-graded micro-challenges | `lib/agents/challenges.ts`, `app/api/challenges/generate/route.ts` |
| **Market & trends** | Adzuna/Reed job demand, Hacker News "Who is hiring" forecast | `lib/connectors/adzuna.ts`, `lib/connectors/hn.ts`, `app/api/market/[roleId]/route.ts` |
| **Agents** | 14 named agents, orchestrator, activity events, replay/demo toggle | `lib/agents/`, `lib/replay.ts` |
| **Automation** | n8n workflows W1–W6 defined as JSON, trigger route | `n8n/*.json`, `app/api/n8n/trigger/[workflow]/route.ts` |
| **Governance** | every agent run/tool call/approval on the record | `app/(app)/governance/`, `lib/agents/guardrails.ts` |

Open-source reference checked for this roadmap:
- `mearjuntripathi/coding-profile-service` — multi-platform (LeetCode, HackerRank, CodeChef, GeeksforGeeks) profile aggregation; badges + certifications; modular scraper per platform.
- `its-bismay/leetcode-stats-api` / `yerass11/Leetcode-Stats-API` — LeetCode GraphQL shapes (rank, contest rating, topics solved, basic stats).
- `learningeconomy/LearnCard` — lifelong learning passport: Issue / Earn / Store / Share / Map; verifiable, shareable skill credentials.
- `akkubh/Hackathon-Portfolio-Aggregator` — hackathon projects, certificates, events, public portfolio link / PDF export.
- `taneja/leetcode-api-scraper` (Apify) — operation catalogue: userBadges, userContest, userCalendar, userHeatmap, userSkillStats, userLanguageStats.

---

## Feature opportunities (scored)

Each feature lists **value** (who it helps, why), **effort**, **entry points**, and the open-source idea it borrows.

### P0 — ship this week (low effort, plugs straight into existing pipes)

| # | Feature | Value | Effort | Entry points |
|---|---|---|---|---|
| P0-1 | **Connections settings** on the profile page — save/edit handles per platform, last-synced-at, per-platform "Re-sync" button | Students actually own their platform identity today instead of only via request body | S | `app/api/profile/route.ts` (PUT exists), `app/(app)/profile/[id]/page.tsx`, `components/profile/ConnectionsCard.tsx` (new) |
| P0-2 | **Sync status & history UI** — per-source last sync result (ok / degraded / error + reason), "Sync all now" on the passport | Trust: students see exactly what Keystone read from each platform | S | `lib/store` collection `syncs` (new), `app/api/evidence/sync/route.ts` writes a `sync_<nanoid>` record per run |
| P0-3 | **Readiness trend chart** — weekly readiness snapshot (now → target) shown on Dashboard + Map | Visual progress is the #1 demo hook for judges | S | recharts already installed; new `lib/graph/snapshots.ts` + `components/dashboard/ReadinessTrend.tsx` |
| P0-4 | **Per-skill evidence drilldown** — click a Bridge Map node → the quotes/links that proved it (which platform, which badge, which repo) | Turns "proven" into something you can show an interviewer | S | `PassportView.tsx` already renders evidence; add node → skill filter link |
| P0-5 | **Demo fixture for new sources** — add LeetCode/HackerRank/Codeforces/Stack Overflow/dev.to/LinkedIn-PDF items to Aisha's `evidence.aisha.json` | Demo mode instantly shows the richer evidence story | XS | `data/fixtures/evidence.aisha.json` |

### P1 — next two weeks (high value, distinct surfaces)

| # | Feature | Value | Effort | Entry points |
|---|---|---|---|---|
| P1-1 | **CodeChef connector** — rating, max rating, problems solved, stars/badges (public HTML profile) | CodeChef is huge with international/Indian students; closes the "coding profile" gap for non-LeetCode users | M | `lib/connectors/codechef.ts` (new, HTML scrape), wire into `app/api/evidence/sync/route.ts` |
| P1-2 | **AtCoder connector** — rating, rank, problems solved (`users/{handle}/history/json`) | Completes the competitive-programming triad (LeetCode / Codeforces / AtCoder) | S | `lib/connectors/atcoder.ts` (new, JSON API) |
| P1-3 | **LeetCode topic-tag evidence** — bundle an open-source problem→tag dataset (from the `leetcode-stats` topic repos), map recent accepted submissions to topic skills (sql, graphs, dynamic-programming→algorithms, etc.) | Today's public GraphQL no longer returns per-topic tags; this restores granular skill proof | M | `lib/connectors/leetcode.ts` extends `recentAcSubmissionList` handling; new `data/leetcode-problem-tags.json` |
| P1-4 | **Coding passport gallery** — per-platform badges/stars (HackerRank 5-star Python, Codeforces legendary GM, LeetCode rank), streak heatmap (userCalendar/userHeatmap ops from Apify reference) | The passport becomes a shareable "coding CV", not just a skill list | M | `components/passport/PlatformBadges.tsx`, `StreakHeatmap.tsx` (new) |
| P1-5 | **n8n workflow console** — enable/disable W1–W6, test-trigger a workflow, show last-trigger status | Makes the automation real instead of hidden JSON files | M | `app/(app)/governance/` or new `app/(app)/automation/page.tsx` over `app/api/n8n/trigger/[workflow]/route.ts` |

### P2 — this term (product differentiation)

| # | Feature | Value | Effort | Entry points |
|---|---|---|---|---|
| P2-1 | **Public skill passport share link + PDF export** — a public page (`/p/[userId]`) and one-click PDF of proven skills, with receipts (LearnCard "Share", Hackathon-Portfolio-Aggregator "export link/PDF") | Students can put one link on a CV/LinkedIn; proves skill without grades | L | `app/(app)/passport/public/[userId]/page.tsx` (new), `unpdf`/`pdf-lib` for export |
| P2-2 | **Devpost connector** — hackathon submissions, projects, prizes, event links as evidence | Fits Keystone's own hackathon origin; students love tracking hackathons | M | `lib/connectors/devpost.ts` (new, public HTML + Devpost API where available) |
| P2-3 | **GitHub evidence 2.0** — public contributions count, stars given/received, PRs opened/merged (search API, no auth needed) | GitHub today only counts language bytes; contributions show real collaborative engineering | M | extend `lib/graph/evidence.ts` (`syncGithubEvidence`) with `users/{login}/events/public` / search issues |
| P2-4 | **Verifiable skill credentials** — issue an Open Badge / verifiable credential when a skill hits "proven" (LearnCard Issue/Earn/Store/Share/Map) | Makes proof portable beyond Keystone; strong Reply/demo story | L | new `lib/agents/credentials.ts`, `app/api/credentials/issue/route.ts` |
| P2-5 | **Skill-swap / teach claims in Community** — "I can teach React (proven via merged PR)" claims, help requests matched to teachers | Deepens the peer-learning loop ("learning by teaching") | M | `components/community/` `TeachClaims.tsx`, `lib/community/help.ts` extends `HelpRequest` kind |

### P3 — this academic year (platform)

| # | Feature | Value | Effort | Entry points |
|---|---|---|---|---|
| P3-1 | **Kaggle connector** — datasets, notebooks, competition medals (bronze/silver/gold → data-skills evidence) | Data-science students currently have almost no coding-proof path | M | `lib/connectors/kaggle.ts` (new) |
| P3-2 | **GeeksforGeeks connector** — problems solved, certificates, courses | Popular with placement-prep students in the UK/India | M | `lib/connectors/geeksforgeeks.ts` (new) |
| P3-3 | **Coding leaderboard (opt-in)** — pod readiness, most-improved momentum, problems-solved leaderboards | Gamification that drives repeat usage | M | `app/(app)/leaderboard/page.tsx` (new), `lib/momentum.ts` extends |
| P3-4 | **Interview → evidence** — pass a mock interview in a skill → `keystone-interview` evidence item counts toward Proof Ladder rung 3 | Completes the "can teach it" rung with AI-scored interviews | M | `lib/voice/interviewScoring.ts` → evidence write path |
| P3-5 | **Pod project → GitHub automation** — Architect-created repos get real issues + first PR via n8n webhook; merge auto-writes `keystone-pod` evidence | The pod loop becomes fully automated proof | L | `lib/agents/architect.ts` + n8n W3, `app/api/webhooks/github/route.ts` extends |

---

## Recommended next actions (this week)

1. **Commit P0-5** — extend `data/fixtures/evidence.aisha.json` with one item per new source so Demo mode shows LeetCode/HackerRank/Codeforces/Stack Overflow/dev.to/LinkedIn-PDF proof immediately.
2. **P0-1 + P0-2** — add handle inputs + "Re-sync all" to the profile page, and record a `sync_<id>` per evidence sync run in the store. This is the smallest thing that makes the six connectors feel like a product, not a script.
3. **P0-3** — add a readiness sparkline to the Dashboard `ReadinessCard` (recharts is already a dependency).
4. **Record demo replays** — run `scripts/record-demo.mjs` once per connector with a public handle so `data/replay/` ships real recorded responses for the live demo.
5. **P1-1 / P1-2** — CodeChef + AtCoder connectors next, following the exact `lib/connectors/hackerrank.ts` pattern (replayOrRecord, emit events, deterministic `ev_<userId>_<skillId>_<source>` ids, never throw).

## Definition of done per feature

- `npx tsc --noEmit` clean repo-wide
- `npx eslint <changed files>` clean
- `npx vitest run` all green; every new connector has ≥ 10 tests (pure mapper, happy path, degrade-on-failure, edges), no real network (`vi.spyOn(globalThis, "fetch")`)
- Connector follows the shared contract: `import "server-only"`, `sync*Evidence({userId, handle, runId?})`, agent `"evidence"` events, `replayOrRecord` ns = platform name, ids `ev_<userId>_<skillId>_<source>`, store upsert, returns `listEvidence(userId)`
- UI work passes `npm run ui-gate -- --base <dev URL> /<route>` and you have reviewed `.ui-gate/` screenshots
- No demographic fields in matching; nothing posted outside the app without the student's explicit action

## Notes

- Today is 8 Nov 2026, one day after GreatUniHack 2026. The live demo is at `https://keystone-reply.vercel.app` (`?demo=1` signs in as Aisha). Keep Demo Mode rock-solid — judges land on recorded runs.
- Never add a connector that requires scraping behind a login or storing raw platform data. The LinkedIn design (student uploads their own PDF export; nothing persisted) is the model for anything private.
- Skill ids must always come from `data/skills.json` (43 core skills); never invent ids — extend `skillmap.ts` aliases instead.
