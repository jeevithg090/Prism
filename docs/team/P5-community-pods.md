# P5: Community (Pods, Project Studio, Trajectories, badges, momentum)

**Mission:** You turn Keystone from a solo tool into **peer learning**. You own:
- complementary **study pods**,
- **real GitHub projects** created by AI for each pod,
- **Trajectories** of seniors who walked the path,
- the **newcomer badge** and help feed,
- the **momentum score** that ranks students on growth.

Always describe this work as *learning by teaching* and *near-peer mentoring*, never as "networking". Reply's challenge treats social networking as out of scope.

**You own:**
- `lib/agents/{matchmaker,architect,techlead,trajectories,guides}.ts`, `lib/momentum.ts`, `lib/badges.ts`, `lib/schemas/community.ts`
- `data/seed/{students,student-skills,trajectories}.json`, `data/fixtures/{pod.aisha,momentum.aisha,help,guides.aisha}.json`, `scripts/seed.ts`
- `app/api/{pods/match,pods/[podId],pods,projects/create,webhooks/github,trajectories,trajectories/similar,help,guides/find,momentum/[userId],badges/[userId]}/route.ts`
- `app/(app)/{pods,pods/[podId],trajectories,community}/page.tsx`
- `components/{pods,trajectories,community,momentum}/*` (including the slot components `PodSummaryCard`, `MomentumWidget` and `BuildLog`)
- `e2e/pods.spec.ts`

**Review buddy:** P3 reviews your PRs. You review P4's PRs.

Read `docs/team/00-shared-contract.md` first. The contract wins.

---

## At a glance

| # | Deliverable | Priority | Due | Unblocks |
|---|---|---|---|---|
| S0 | GitHub org + PAT + webhook secret, shared with the team | MUST | **14:35** | P2 evidence, your repo creation |
| PR1 | Seed data, fixtures, `scripts/seed.ts`, stub routes | MUST | **15:00** | P3 persona switcher and dashboard, P2 store seeding |
| PR2 | Matchmaker + `/api/pods/match` | MUST | 15:35 | Pods demo |
| PR3 | Project Architect (design, then GitHub repo + issues) | MUST/SHOULD | 16:00 | The "real repo appears" demo moment |
| PR4 | Pods UI + `PodSummaryCard` | MUST | 16:20 | Demo spine |
| PR5 | Momentum + Build Log + `MomentumWidget` + badges | SHOULD | 16:35 | Dashboard, passport |
| PR6 | Trajectories page (Sankey + students like you + ask for 15 minutes) | SHOULD | 16:50 | Demo beat 7 |
| PR7 | Community page (help feed, newcomer mode) | SHOULD | 17:00 | Inclusion story |
| PR8 | AI Tech Lead webhook | COULD | — | — |
| PR9 | Guides finder | COULD | — | — |

**You consume:**
- **P2** (from 14:55): `llmJSON`, `llmText`, `embed`, `getStore`, `emit`, `newRunId`, plus `loadGraph(userId, roleId)` or `store.get("maps", "aisha:ml-engineer")`, falling back to `data/fixtures/bridgemap.aisha.ml-engineer.json`.
- **P4:** `triggerWorkflow("pod-kickoff", {...})`.
- **P1:** `fcSearch` (Guides only).
- **P3:** the shared components (from 15:15) and `useActivity`.

**You provide:**
```ts
// lib/agents/matchmaker.ts
export type CandidateSkills = { userId: string; proven: SkillId[]; gaps: SkillId[]; interests: string[]; availability: string[]; badges: BadgeId[]; year: number };
export function scoreTeam(members: CandidateSkills[], opts?: { interestSim?: (a: CandidateSkills, b: CandidateSkills) => number }): number;
export async function matchPod(input: { userId: string; runId?: string }): Promise<Pod>;
// lib/agents/architect.ts
export async function designProject(pod: Pod, runId?: string): Promise<ProjectBrief>;
export async function createRepoAndIssues(pod: Pod, brief: ProjectBrief, runId?: string): Promise<ProjectBrief>;
// lib/agents/techlead.ts
export function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean;
export async function reviewPullRequest(event: unknown): Promise<{ reviewed: boolean }>;
// lib/agents/trajectories.ts
export async function similarTrajectories(profile: Profile, all: Trajectory[], limit?: number): Promise<{ trajectory: Trajectory; similarity: number }[]>;
// lib/agents/guides.ts
export async function findGuides(profile: Profile, map: BridgeMap): Promise<GuideSuggestion[]>;
// lib/momentum.ts
export const POINTS: Record<"pr-merged"|"roadmap-milestone"|"helped-newcomer"|"mock-interview"|"problem-solved", number>;
export function computeMomentum(events: { userId: string; kind: string; ts: string }[], userId: string, now?: Date): MomentumWeek[];
// lib/badges.ts
export function computeBadges(profile: Profile, ctx: { helpsGiven: number; shipped: boolean; interviewAvg?: number; now?: Date }): BadgeId[];
// components
export function PodSummaryCard({ userId }: { userId: string }): JSX.Element;   // components/pods/PodSummaryCard.tsx
export function MomentumWidget({ userId }: { userId: string }): JSX.Element;   // components/momentum/MomentumWidget.tsx
export function BuildLog({ userId }: { userId: string }): JSX.Element;         // components/momentum/BuildLog.tsx
```

---

## S0 (14:20–14:35): GitHub org, token, secrets
1. Create the org: github.com → New organization (Free) → `keystone-demo`, or another free name. Put that name in `GITHUB_ORG`.
2. Create a **fine-grained PAT** (Settings → Developer settings → Fine-grained tokens):
   - Resource owner: the org. Repository access: All repositories.
   - Permissions: **Administration RW** (to create repos), **Contents RW**, **Issues RW**, **Pull requests RW**, **Metadata R**.
   - Send it **privately** to the team as `GITHUB_TOKEN`. P2 uses the same token.
   - If the org requires approval for fine-grained tokens, approve it under Org settings → Personal access tokens.
3. Generate the webhook secret with `openssl rand -hex 20` and use it as `GITHUB_WEBHOOK_SECRET`.
4. Go to smee.io → "Start a new channel" and save the URL, for local webhook forwarding (COULD).
5. **Create one demo repo now, by hand, as a safety net:** `gh repo create keystone-demo/pod-vision-demo --public --add-readme`. DEMO_MODE will point to it.
6. Once the repo exists: `gh repo clone <owner>/keystone && cd keystone && npm ci && cp .env.example .env.local`.

---

## PR1 (MUST, due 15:00): seed data, fixtures, stub routes
**Branch:** `p5/seed-fixtures`

### Files and content
1. **`data/seed/students.json`:** 12 `Profile`s with `isDemo: true` and `programmeId: "uom-bsc-cs"`. Mix of years 1 to 3. Target roles spread across ml-engineer (5), software-engineer (4) and data-analyst (3). Interests are concrete, for example "computer vision", "fintech", "game dev", "open source", "climate data", "healthcare AI". Availability values are like "tue-eve" or "sat-am". Badges: at least 3 have `new-to-uni`, plus 2 international and 2 first-gen. Example:
   ```json
   {"id":"priya","name":"Priya Shah","githubLogin":"priya-demo","programmeId":"uom-bsc-cs","year":2,"startedAt":"2025-09-22","badges":["first-gen"],"interests":["computer vision","open source"],"availability":["tue-eve","sat-am"],"isDemo":true,
    "dna":{"targetRoles":["ml-engineer"],"timelineLabel":"Placement 2027/28","targetDate":"2027-06-01","hoursPerWeek":10,"theoryPractice":60,"formats":["projects"],"budget":"free","constraints":[],"accessibility":[],"language":"en"}}
   ```
   Other names: Tom Okafor, Mei Lin, Jakub Nowak, Sara Haddad, Leo Fischer, Amara Nwosu, Dev Patel, Hannah Brooks, Yusuf Ali, Chloé Martin, Ollie Grant.
2. **`data/seed/student-skills.json`:** `Record<userId, {proven: SkillId[], gaps: SkillId[]}>`, using only the core skill ids. Make the profiles **complementary to Aisha**, whose gaps are docker, pytorch, sql, aws, mlops, llm-apps:
   - Priya: proven python, pytorch, docker, git. Gaps: sql, aws.
   - Tom: proven sql, postgresql, aws. Gaps: pytorch, react.
   - Mei: proven react, typescript, ci-cd. Gaps: python, machine-learning.
   - Fill in the rest similarly.
3. **`data/seed/trajectories.json`:** 40 `Trajectory`s with `isDemo: true`. Each has 4 to 7 steps across years 1 to 5. Outcomes are spread across "ML engineer at a Manchester health-tech startup", "Software engineer at a bank", "Data analyst at a retailer", "PhD in ML", "Founded a startup", "SRE at a cloud company". Advice is 1–2 sentences, specific and kind. Around 60% have `openToChat: true`. Example steps:
   - Y1: society "Joined the robotics society"
   - Y1: hackathon "GreatUniHack: built a CV app"
   - Y2: project "Open-source contribution to scikit-learn docs"
   - Y3: placement "Year in industry at an ML consultancy"
   - Y4: first-role "ML engineer"
4. **Fixtures:**
   - `data/fixtures/pod.aisha.json`: a `Pod` with Aisha, Priya, Tom and Mei, plus explanations and a `project`. The project has the title "VisionAid: accessible image captioning API", 3 milestones, 7 issues, and `repoUrl: "https://github.com/keystone-demo/pod-vision-demo"`.
   - `momentum.aisha.json`: 6 weeks with a rising score; the last week shows `changePct: 18`.
   - `help.json`: 8 requests; 4 come from 🌱 users and 2 are `chat-15`.
   - `guides.aisha.json`: 4 suggestions.
5. **`scripts/seed.ts`:** upserts students into `profiles`, trajectories into `trajectories` and help into `help` using `getStore()`, then logs counts. Run it with `npm run seed`.
6. **`lib/schemas/community.ts`:** zod schemas `PodZ`, `TrajectoryZ`, `HelpRequestZ`, `MomentumWeekZ`, `GuideSuggestionZ`, plus request schemas.
7. **Stub routes** (envelope + zod input validation), all returning fixtures or seed data:
   - `POST /api/pods/match`, `GET /api/pods/[podId]`, `GET /api/pods?userId=`
   - `POST /api/projects/create`, `POST /api/webhooks/github` (returns `{reviewed:false}`)
   - `GET /api/trajectories`, `GET /api/trajectories/similar`
   - `GET|POST /api/help`, `POST /api/guides/find`
   - `GET /api/momentum/[userId]`, `GET /api/badges/[userId]`

### Required tests
1. All seed and fixture files parse with their zod schemas. Student ids are unique. Every skill id in `student-skills.json` exists in contract §5's core list.
2. Every trajectory has `isDemo: true`, and its steps are sorted by year.
3. At least 3 students have `new-to-uni`.
4. Route `GET /api/pods?userId=aisha` returns 200 with an array. `POST /api/help` with an empty message returns 400.

**Ship it:**
```bash
npm run typecheck && npm run lint && npm test
git add -A && git commit -m "feat(community): seed students, trajectories, fixtures + stub routes"
git push -u origin p5/seed-fixtures
gh pr create --base main --title "feat(community): seed students, trajectories, fixtures + stub routes" --body-file .github/pull_request_template.md --reviewer <P3-handle>
```

---

## PR2 (MUST, 15:00–15:35): Matchmaker
**Branch:** `p5/matchmaker` · **Files:** `lib/agents/matchmaker.ts` (+ test), real `POST /api/pods/match`

### Algorithm (deterministic; the LLM only writes the explanation lines)
1. **Candidate for the user:** load the map via `store.get("maps", \`${userId}:${role}\`)`, falling back to P2's `loadGraph`, then the fixture. Proven = nodes with status `proven`. Gaps = role nodes (`demand > 0`) with status `gap`, sorted by demand, top 8. Interests, availability, badges and year come from the profile.
2. **Candidates for others:** seeded students from `student-skills.json` plus profiles. Exclude the user.
3. **Pair score parts** for a team T:
   - `coverage(T) = mean over m∈T of |m.gaps ∩ ∪(proven of others)| / max(1,|m.gaps|)`
   - `interest(T)`: the mean pairwise cosine of `embed(interests.join(", "))` (P2). In DEMO_MODE, or if embedding fails, use the Jaccard of the interest word sets.
   - `direction(T)`: the share of pairs with the same primary target role.
   - `avail(T) = |∩ availability| > 0 ? 1 : 0`.
   - `redundancy(T)`: the mean pairwise Jaccard of the proven sets. Too-similar teams learn less.
   - `mix(T) = 1` if T contains a `new-to-uni` member **and** a member with year ≥ 2; otherwise 0.
4. **Weights:** `scoreTeam = 0.45*coverage + 0.15*interest + 0.15*direction + 0.10*avail + 0.10*mix - 0.15*redundancy`, clamped to [0,1] and rounded to 2 decimals.
5. **Greedy:**
   1. Take the best partner p for the user by `scoreTeam([user,p])`, breaking ties by userId alphabetically.
   2. Repeatedly add the candidate that raises the score most, until the size is 4, or stop at 3 if no candidate raises it.
6. **learns/teaches per member:**
   - `learns = m.gaps ∩ ∪(others' proven)` (top 3).
   - `teaches = m.proven ∩ ∪(others' gaps)` (top 3).
   - `role` = "Learns Docker · Teaches Python".
7. **Explanations:** for each pair (a,b) where `a.teaches ∩ b.learns` is non-empty, use the template `"${b.name} reviews your ${skillB}; you review ${b.firstName}'s ${skillA}."` from the viewpoint of `userId`. Optionally polish with one `llmJSON` call: `{ lines: [{fromUserId,toUserId,text}] }` with "Rewrite each line to be warm and specific, ≤ 14 words, keep the skills." Fall back to the templates.
8. Save `Pod` with `{ id: \`pod_${nanoid(6)}\`, name: "Pod " + an adjective-noun pair (deterministic from the score, e.g. "Pod Aurora"), members, explanations, score, createdAt }` via `store.upsert("pods", id, pod, userId)`.
9. Emit:
   - started "Matchmaker: comparing 12 students"
   - progress "best partner: Priya (fills Docker, PyTorch)"
   - progress "pod score 0.82"
   - done

### Required tests (handmade 5-person dataset; mock `embed` to use the Jaccard path)
1. `scoreTeam`: a team where each member's gaps are covered by the others scores higher than a team with identical skills.
2. Redundancy: two members with identical proven sets reduce the score.
3. Mix: adding a new-to-uni member plus a year-2 member raises the score by 0.10.
4. `matchPod` for aisha on the dataset returns exactly `{aisha, priya, tom, mei}` (deterministic) with size 3–4, and Aisha's `learns` includes docker.
5. Every explanation names real skills from the members' learns/teaches.
6. If the LLM polish throws, the template explanations are used.
7. Route: `POST /api/pods/match {userId:"aisha"}` returns 200 with a zod-valid `Pod`; an unknown user returns 404.

**Ship it:** commit `feat(pods): complementary matchmaker with explanations`.

---

## PR3 (MUST design / SHOULD repo, 15:35–16:00): Project Architect
**Branch:** `p5/architect` · **Files:** `lib/agents/architect.ts` (+ test), real `POST /api/projects/create`

### `designProject(pod, runId)`
1. `llmJSON` with:
   - **system:** "You design a 3-week student team project that makes every member practise the skills they want to learn, reviewed by a teammate who already has that skill. Realistic, portfolio-worthy, achievable in ~6 hours/week each. Never reuse university coursework."
   - **user:** `MEMBERS:\n${members.map(m => `${name}: learns ${m.learns.join(", ")}; teaches ${m.teaches.join(", ")}; interests ${interests}`)}`, followed by `Return a title, a one-sentence pitch, exactly 3 milestones, and 6-8 issues. Each issue: title, body (with acceptance criteria as a checklist), assigneeUserId, reviewerUserId, skillId, milestone (one of the milestones).`
   - **schema:** `ProjectBriefZ` without `repoUrl`.
2. **Validate and repair deterministically:**
   - Every member has ≥ 1 issue whose `skillId ∈ member.learns`. If one is missing, add a template issue: `"Add ${skill} to the project"` with a body checklist.
   - The reviewer is someone other than the assignee and has `skillId ∈ reviewer.teaches`. If not, reassign to any member who teaches that skill, otherwise to the highest-score other member.
   - The milestone must be one of the 3, or it's set to milestones[0].
   - Cap at 8 issues.
3. If the LLM fails, use a template brief built from the members' learns.

### `createRepoAndIssues(pod, brief, runId)`
- **DEMO_MODE:** return the brief with `repoUrl = "https://github.com/keystone-demo/pod-vision-demo"` (from S0). Issue URLs are `${repoUrl}/issues/${i+1}`. Make no API calls.
- **Live** (`octokit`, `GITHUB_TOKEN`, org `GITHUB_ORG`):
  1. `POST /orgs/{org}/repos` with `{ name: \`pod-${slug(brief.title)}-${nanoid(4).toLowerCase()}\`, description: brief.pitch, private: false, auto_init: true }`. Emit "created repo pod-…".
  2. `PUT /repos/{org}/{repo}/contents/README.md` with a base64 README: title, pitch, members table (name, learns, teaches), milestones, and "Made with Keystone". You need the existing README's `sha` from `GET` first, because `auto_init` creates one.
  3. Labels: for each distinct skill, `POST /repos/{org}/{repo}/labels` with `{name: skillId, color: "6366F1"}`. Ignore 422 errors (label exists).
  4. Milestones: `POST /repos/{org}/{repo}/milestones` with `{title}` for each one. Map the titles to numbers.
  5. Issues: `POST /repos/{org}/{repo}/issues` with `{ title, body: body + "\n\n**Assignee:** <name> · **Reviewer:** <name> · **Skill:** <skill>", labels:[skillId], milestone: number }`. Only set `assignees` for members whose `githubLogin` is a collaborator; demo students have no real logins. Save each `html_url`. Emit "opened 7 issues across 3 milestones".
  6. If any step fails, emit an error event "GitHub failed: using demo repo" and fall back to the DEMO behaviour.
- After success, call `triggerWorkflow("pod-kickoff", { podId, podName, repoUrl, members: names, title, pitch })` (P4), and save `pod.project = brief` plus `discordChannelUrl` if the workflow returns it.

**Route:** `POST /api/projects/create {podId}` loads the pod (404 if missing), runs `designProject` then `createRepoAndIssues`, saves, and returns the brief.

### Required tests (mock llm, octokit and `@/lib/n8n`)
1. Repair: an LLM brief missing an issue for Mei's `learns` gets a template issue added for Mei.
2. Repair: a reviewer equal to the assignee is reassigned to a member who teaches that skill.
3. In DEMO_MODE, `createRepoAndIssues` makes no octokit calls and returns the demo repo URL plus issue URLs.
4. Live (mocked): the calls happen in order repos.create → contents → labels → milestones → issues ×N. The repo name matches `/^pod-[a-z0-9-]+-[a-z0-9]{4}$/`. Every issue body contains "Reviewer:".
5. A label 422 doesn't fail the run.
6. A failure in issue creation falls back to the demo repo and emits an error event.
7. `triggerWorkflow` is called once with `repoUrl`.

**Ship it:** commit `feat(studio): AI project architect creates repo + issues`.

---

## PR4 (MUST, 16:00–16:20): Pods UI + `PodSummaryCard`
**Branch:** `p5/pods-ui` · **Files:** `app/(app)/pods/page.tsx`, `app/(app)/pods/[podId]/page.tsx`, `components/pods/{FindPodHero,MatchingAnimation,PodCard,MemberRow,ProjectView,IssueList,PodSummaryCard}.tsx` + tests, `e2e/pods.spec.ts`

### `/pods` flow
1. **No pod yet:** the `FindPodHero` card.
   - Title: "Learn faster in a pod"
   - Body: "We'll match you with 2–3 students who are strong where you're stuck, and you'll teach them what you know."
   - Button: [Find my pod] (primary, large).
   - Small print: "Matched on skills, interests and availability. Never on personal characteristics."
2. **Matching** (after clicking): `MatchingAnimation` shows avatars of candidates drifting in, then 3 settling next to the user's avatar (motion layout, 1.2s), with the caption "Comparing 12 students… finding who fills your gaps". The Activity panel opens through `useActivity().start(runId)` if the response has one. Under reduced motion, show a simple progress line instead.
3. **`PodCard`** (result):
   - Header: the pod name, "Compatibility 82%" as a progress bar, and 4 avatars.
   - **MemberRow** for each member: avatar, name, BadgePills, and the line "Learns: [Docker][PyTorch] · Teaches: [Python]" (SkillChips with statuses).
   - Explanation lines with an ArrowLeftRight icon: "Priya reviews your Python; you review her SQL."
   - Primary CTA: **[Start our project →]**. Secondary: [Find a different pod].
4. **Start project:** call `apiPost("/api/projects/create", {podId})`. The button shows "Designing your project…" and the Activity panel streams the architect's progress. Then navigate to `/pods/[podId]` with the toast "Repo is live ↗" (with an action link).

### `/pods/[podId]` (`ProjectView`)
- **Header:** the project title (h1) and pitch, with buttons [Open repo ↗] and [Open Discord ↗] (if `discordChannelUrl` is set).
- **Milestone stepper:** 3 steps (current = first).
- **`IssueList`:** grouped by milestone. Each issue row shows: title, skill SkillChip, "Assignee: Aisha", the reviewer avatar with "Reviewer: Priya", and a GitHub link icon.
- **Side card:** the "How pods work" text: "1. Pick your issue. 2. Open a PR. 3. Your reviewer gives feedback. 4. Merged PRs become proof on your passport."

### `PodSummaryCard({userId})` (dashboard slot)
A compact version: the pod name, 4 avatars, "Your issue: Add Docker support" and [Open pod]. If there's no pod: "You're not in a pod yet" with [Find my pod].

### States
- **Loading:** card skeletons.
- **Empty:** the FindPodHero.
- **Error:** ErrorState with retry and demo actions.
- **Success:** toasts.

All buttons are keyboard reachable, avatars have alt text, and on mobile the layout is a single column with sticky CTAs.

### Required tests
1. PodCard renders 4 MemberRows and the explanation text containing "reviews your".
2. Clicking [Start our project] calls POST `/api/projects/create` with the podId, disables the button with "Designing your project…", and navigates on success.
3. IssueList groups issues under the 3 milestone headings, and each row has a link with `href` starting `https://github.com/`.
4. PodSummaryCard shows "You're not in a pod yet" when the API returns `[]`.
5. MatchingAnimation under reduced motion renders the static progress text.
6. e2e (`e2e/pods.spec.ts`, DEMO_MODE): `/pods?demo=1` → Find my pod → the pod card is visible → Start project → the project view shows "Open repo"; axe passes.

**Ship it:** commit `feat(pods): pods UI, matching animation, project view`. Open the PR with `--reviewer <P3-handle>` and attach a GIF.

---

## PR5 (SHOULD, 16:20–16:35): momentum, Build Log, badges
**Branch:** `p5/momentum-badges` · **Files:** `lib/momentum.ts`, `lib/badges.ts` (+ tests), real momentum and badges routes, `components/momentum/{MomentumWidget,BuildLog}.tsx` (+ tests)

### `lib/momentum.ts`
1. **Points:** `POINTS = { "pr-merged": 5, "roadmap-milestone": 4, "helped-newcomer": 3, "mock-interview": 3, "problem-solved": 1 }`.
2. **`computeMomentum(events, userId, now)`:**
   1. Filter by userId and **dedupe** by `kind+ts`.
   2. Bucket into ISO weeks ("2026-W45").
   3. Score each week as the sum of points, with `problem-solved` capped at 10 points per week and each kind capped at 5 events per week (anti-gaming).
   4. `baseline` = the mean score of the previous 4 weeks, with a minimum of 1.
   5. `changePct = round((score - baseline) / baseline * 100)`.
   6. Return the last 6 weeks, oldest first, with the `breakdown`.
3. **Route** `GET /api/momentum/[userId]`: `store.list("momentum_events", {userId})` → `computeMomentum`. In DEMO_MODE for aisha, return the fixture.

### `lib/badges.ts`
**`computeBadges(profile, ctx)`:**
- Opt-in badges come from `profile.badges` ∩ {international, first-gen, career-changer}.
- `new-to-uni` only if it's in `profile.badges` **and** now − startedAt ≤ 70 days.
- `helper` if `ctx.helpsGiven ≥ 2`.
- `shipped` if `ctx.shipped`.
- `interview-ready` if `ctx.interviewAvg ≥ 3.5`.
- The route builds the ctx:
  - helpsGiven = the count of help requests where the user is the helper and the status is `accepted` or `done`.
  - shipped = any pod with `project.repoUrl` containing the user.
  - interviewAvg = the mean of `store.list("interviews",{userId})` scores.

### UI
- **`MomentumWidget`:**
  - A big "+18%" (green if > 0, muted if 0, rose if < 0) with the caption "vs your usual week".
  - A 6-week sparkline (Recharts AreaChart, 100% × 64px).
  - The breakdown in a tooltip or popover ("2 merged PRs · 1 milestone · helped 1 newcomer").
  - The footnote "Ranked on growth, not on who's 'best'."
  - Empty state: "Your momentum starts with your first step this week."
- **`BuildLog`:** a vertical timeline of verified events. Each row shows an icon (GitPullRequest, Route, HeartHandshake, Mic, Code2), the text ("Merged PR in pod-visionaid" / "Completed Week 2: Docker"), a relative date, and a link if there is one. The optional [Turn into CV bullets] button calls `llmText` through a small server action that returns 3 STAR bullet points, shown in a dialog with Copy.

### Required tests
1. Points: 2 pr-merged + 1 milestone gives 14.
2. The problem-solved cap: 15 events in one week give 10 points.
3. Duplicate events (same kind and ts) count once.
4. Baseline: previous weeks [4, 6, 8, 10] and this week 12 give baseline 7 and changePct 71.
5. computeBadges: started 30 days ago with the badge gives `new-to-uni`; started 100 days ago drops it; helpsGiven 2 adds `helper`; interviewAvg 3.6 adds `interview-ready`.
6. MomentumWidget renders "+18%" and the "growth, not" footnote; BuildLog renders one row per event.

**Ship it:** commit `feat(momentum): growth-based momentum, build log, badges`.

---

## PR6 (SHOULD, 16:35–16:50): Trajectories `/trajectories`
**Branch:** `p5/trajectories` · **Files:** `lib/agents/trajectories.ts` (+ test), real routes, `app/(app)/trajectories/page.tsx`, `components/trajectories/{JourneySankey,TrajectoryCard,AskChatDialog}.tsx` (+ tests)

### Steps
1. **`similarTrajectories(profile, all, limit=5)`:**
   - Embed the profile text (interests + target role name + year) and each trajectory's text (steps labels + outcome) with P2's `embed`. Use cosine similarity, plus a +0.15 bonus if the outcome matches the target role. Sort and take the top `limit`.
   - Fallback: the Jaccard of word sets.
   - Route `GET /api/trajectories/similar?userId=&limit=`.
2. **`JourneySankey`** (Recharts `Sankey`):
   - Nodes: Year 1 focus (the first `society` or `project` step category, e.g. "Society", "Hackathon", "Side project") → Year 2–3 experience ("Placement", "Internship", "Open source", "Research") → Outcome role groups (ML, SWE, Data, PhD, Startup, Other).
   - Link values are counts from the trajectories, coloured with the chart tokens.
   - The outcome filter chips highlight the matching paths.
   - Include a text summary for screen readers: "Of 40 journeys, 14 led to ML roles; 9 of those included a placement."
3. **"Students like you":** a horizontal scroll of `TrajectoryCard`s, each showing the name, outcome, a mini step timeline (dots with labels), the advice quote in italics, a `DemoDataNote`, and **[Ask for 15 minutes]** (only if `openToChat`).
4. **`AskChatDialog`:**
   - On open, call a server action that uses `llmText`: "Draft a short, specific, polite message from a first-year asking a senior for a 15-minute chat about <their path>; ≤ 60 words; mention one concrete step from their journey."
   - The draft goes in an editable textarea. [Send request] calls `POST /api/help {fromUserId, toUserId, kind:"chat-15", message}`, then shows the toast "Request sent: they'll see it in Community."
   - The copy makes clear that Keystone never sends anything outside the app.
5. **States:** skeletons; empty ("No journeys yet: seniors can share theirs from their passport"); error.

### Required tests
1. similarTrajectories (embedding fallback): an ML-interest profile ranks an ML-outcome trajectory first, and the bonus applies.
2. The Sankey data builder: 3 trajectories produce the correct node and link counts and include the text summary.
3. TrajectoryCard hides the Ask button when `openToChat` is false.
4. AskChatDialog: the draft is editable, Send calls POST `/api/help` with `kind:"chat-15"`, and the toast shows.

**Ship it:** commit `feat(trajectories): journey sankey + students like you + ask for 15 min`.

---

## PR7 (SHOULD, 16:50–17:00): Community `/community` (newcomer mode)
**Branch:** `p5/community`
- **"Help a newcomer" feed:** open help requests, with those from 🌱 users first. Each card shows: BadgePill, the message, the kind (question / chat-15 / code review), the time, and an [I can help] button. Clicking it calls `POST /api/help` with an update (add the `PATCH`-like body `{id, status:"accepted", toUserId}`, handled in the same route), records the momentum event `helped-newcomer` for the helper, and shows the toast "Thank you! +3 momentum".
- **Ask composer:** a textarea and kind select, with the note "Your 🌱 badge tells helpers to explain things in more detail."
- **"Helpers this week"** (opt-in): the top 5 by helps this week, with the 🤝 badge. The caption reads "Celebrating helpers, not ranking students."
- **Guides** section (PR9, COULD) with copy buttons.

**Tests:** 🌱 requests sort first; [I can help] sends `status:"accepted"`; an empty composer is blocked.

---

## PR8 (COULD): AI Tech Lead webhook
- **`verifySignature`:** compute `sha256=` + HMAC-SHA256(rawBody, secret) in hex, then `crypto.timingSafeEqual` against the header. Return false if the header is missing or the lengths differ.
- **Route:**
  1. Read the raw text body and verify it (401 if it fails).
  2. Handle only `x-github-event: pull_request` with action opened or synchronize.
  3. Fetch the diff: `GET /repos/{o}/{r}/pulls/{n}` with `mediaType: { format: "diff" }`, truncated to 8k characters.
  4. Call `llmText`:
     - **system:** "You are a kind senior engineer mentoring students. Give a Socratic review: max 6 bullets, ask guiding questions and point to concepts/docs; NEVER write the full solution or large code blocks."
     - Post the reply as a comment with `POST /repos/{o}/{r}/issues/{n}/comments`.
  5. On `closed` with `merged:true`: add the momentum event `pr-merged` for the member mapped by GitHub login.
- **Local testing:**
  ```bash
  npx smee-client -u <smee-url> -t http://localhost:3000/api/webhooks/github
  ```
- **Tests:** a valid signature returns true and a tampered one false; a non-PR event returns `{reviewed:false}`; the comment body contains no fenced code block longer than 5 lines (strip longer ones).

## PR9 (COULD): Guides
`findGuides`:
- `GET /search/users?q=location:Manchester+language:<top gap language>+followers:>20&per_page=5`
- P1's `fcSearch("Manchester <skill> meetup speaker")`
- `llmJSON` to write `whyRelevant`, `suggestedQuestion` and `draftMessage`
- **Limit: 3 drafts a day per user** (store collection `guides_usage`). **Never send anything.**

The UI is a section on `/community` with cards and a [Copy message] button, plus the note "You send it yourself. We never message anyone."

**Tests:** the 4th request in a day returns 429 `{code:"daily_limit"}`, and there's no outbound messaging code path.

---

## 16:15 integration checkpoint (your part)
- [ ] On `/pods?demo=1`: Find my pod → Start project → the repo link opens the real demo repo.
- [ ] A live run creates a real repo in `keystone-demo`, and P4's pod-kickoff posts to Discord.
- [ ] `PodSummaryCard` and `MomentumWidget` render inside P3's dashboard.

## Bug bash (16:50–17:05)
Test **P4's** `/interview` (pre-call, in-call and post-call states), `/launch`, and `BriefingPlayer`. Check keyboard access, mobile and axe.

## Demo role
Talk through beats 6–7: *"Priya reviews your Python; you review her SQL."* Click Start project to show the real GitHub repo with assigned issues and Discord lighting up. Then show the Trajectories Sankey. **Fallback:** DEMO_MODE plus the pre-made demo repo.

## Cut list (in this order)
Guides → Tech Lead → Community page (keep the help API) → Trajectories "Ask" dialog → Sankey (keep the cards) → live repo creation (use the demo repo). **Never cut:** seed data, Matchmaker, the pod card with explanations, the project view.

## Risks
- **GitHub org permission errors:** make the demo repo in S0 and keep the DEMO fallback.
- **Matching looks random:** the seed skills are designed to complement Aisha, and a test locks the expected pod.
- **Ethics questions:** matching never uses demographic fields; badges are only used to route help.

---

## PASTE THIS INTO YOUR CODING AGENT
> You are P5's coding agent on the Keystone hackathon repo. Read `docs/team/00-shared-contract.md` fully, then `docs/team/P5-community-pods.md`. Execute PR1 → PR7 in order (PR8 and PR9 only if there's time). For each:
> 1. `git switch main && git pull --ff-only && git switch -c <branch>`
> 2. Write the listed tests first. Mock `@/lib/llm` (llmJSON, llmText, embed), octokit, `@/lib/n8n` and fetch.
> 3. Implement exactly the signatures in "You provide".
> 4. Run `npm run typecheck && npm run lint && npm test`.
> 5. Commit, push, then `gh pr create --base main --title "<title>" --body-file .github/pull_request_template.md --reviewer <P3-handle>`, with the test output and screenshots or GIFs for UI.
> 6. Give me the PR URL and stop.
>
> Never push to `main`. Only edit P5-owned files. Every route returns the `ApiResult` envelope with zod-validated input. Honour `DEMO_MODE` (seed data, fixtures, the demo repo). UI follows contract §9: shared components, tokens, the 4 states, keyboard and aria, mobile, reduced motion, axe. Matching must never use demographic fields. Never send messages outside the app. If something in my file conflicts with the contract, follow the contract and tell me.
