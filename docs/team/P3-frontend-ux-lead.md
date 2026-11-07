# P3: Frontend lead, UX, design system, repo admin

**Mission:** You make Keystone **look and feel like a winning product**. You also own the repo, CI, the design system, the app shell, and the four core screens judges remember:
- **Landing**
- **Onboarding**
- **Bridge Map**
- **Roadmap**

Everyone else builds on your scaffold and your `components/keystone/*`. **The scaffold is the first thing the team needs: push it by 14:40.**

**You own:**
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/providers.tsx`, `app/(app)/layout.tsx`
- `app/(app)/{onboard,dashboard,map,roadmap}/page.tsx`, `app/(app)/profile/[id]/page.tsx`
- `components/{ui,shell,keystone,onboarding,map,roadmap,passport,dashboard}/*`
- `lib/{types,env,session,utils,fetcher}.ts`, `middleware.ts`
- `vitest.config.ts`, `playwright.config.ts`, `tests/setup.ts`, `e2e/utils.ts`, `e2e/demo.spec.ts`
- `.github/*`, `.env.example`, `docs/team/*`

**Review buddy:** P4 reviews your PRs. You review P5's PRs.

Read `docs/team/00-shared-contract.md` first. You implement §3, §4, §5, §9, §10, §11 and §12 of it.

---

## At a glance

| # | Deliverable | Priority | Due | Unblocks |
|---|---|---|---|---|
| T0 | **Scaffold (the only direct push to main)** + branch protection + Vercel | MUST | **14:40** | everyone |
| PR1 | Design system: tokens, fonts, `components/keystone/*` | MUST | 15:15 | P1, P4, P5 UI |
| PR2 | App shell: sidebar, top bar, Activity panel, session, fetcher, providers | MUST | 15:35 | every page |
| PR3 | Onboarding wizard `/onboard` | MUST | 15:55 | demo spine |
| PR4 | Bridge Map `/map` | MUST | 16:15 | demo spine |
| PR5 | Roadmap `/roadmap` | MUST | 16:30 | demo spine |
| PR6 | Dashboard `/dashboard` (with slots for P4 and P5) | MUST | 16:40 | demo spine |
| PR7 | Landing `/` | SHOULD | 16:50 | first impression |
| PR8 | Skill Passport `/profile/[id]` | SHOULD | 17:00 | assessment pillar |
| PR9 | `e2e/demo.spec.ts` + production deploy + screenshots for P4 | SHOULD | 17:05 | submission |

**If time is short, build a simple hero on `/` early (10 minutes) and polish it later.** The judges' first screen must never be the default Next.js page.

**You consume:**
- P2: `/api/profile`, `/api/onboard/run`, `/api/agents/stream`, `/api/graph`, `/api/roadmap` (fixture stubs from 15:00)
- P1: `/api/roles`, `/api/trends`
- Slot components: P4's `BriefingPlayer` and `VoiceOnboardButton`; P5's `MomentumWidget`, `PodSummaryCard` and `BuildLog`

**You provide:** the shared components in contract §9.6, `useActivity()`, `useCurrentUser()`, `getCurrentUserId()`, `apiGet`, `apiPost` and `apiPatch`.

---

## T0: scaffold (MUST, 14:20–14:40, direct push to `main`, done once)
```bash
npx create-next-app@latest keystone --ts --eslint --tailwind --app --import-alias "@/*" --no-src-dir --use-npm
cd keystone
npm i zod openai @mendable/firecrawl-js octokit @supabase/supabase-js @tanstack/react-query motion recharts react-force-graph-2d sonner nanoid date-fns @elevenlabs/elevenlabs-js @elevenlabs/react pdf-parse clsx tailwind-merge class-variance-authority cmdk server-only
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test @axe-core/playwright tsx wait-on prettier
npx shadcn@latest init -d
npx shadcn@latest add button card badge dialog sheet tabs tooltip input label select slider switch checkbox radio-group progress skeleton separator avatar dropdown-menu command scroll-area table popover toggle toggle-group sonner textarea
```
Then create these files:
1. `lib/types.ts`: copy it **verbatim** from contract §5.
2. **`lib/env.ts`:** a zod object with every key in `.env.example` as `z.string().optional()`, plus `DEMO_MODE: z.enum(["true","false"]).default("false")`. Export `env` and `isDemo()`.
3. **`lib/utils.ts`:** shadcn's `cn`, plus `pct(n)`, which returns `"38%"`, and `fmtGBP(n)`, which returns `"£52k"`.
4. **`vitest.config.ts`:**
   ```ts
   import { defineConfig } from "vitest/config"; import react from "@vitejs/plugin-react"; import path from "node:path";
   export default defineConfig({ plugins: [react()], test: { environment: "node", setupFiles: ["./tests/setup.ts"], include: ["**/*.test.{ts,tsx}"], exclude: ["e2e/**","node_modules/**"] }, resolve: { alias: { "@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } } });
   ```
   `tests/setup.ts` contains `import "@testing-library/jest-dom/vitest";`. `tests/server-only-stub.ts` contains `export {};`.
5. **`playwright.config.ts`:**
   ```ts
   import { defineConfig, devices } from "@playwright/test";
   export default defineConfig({ testDir: "e2e", use: { baseURL: "http://localhost:3000" }, webServer: { command: "npm run build && npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 180000, env: { DEMO_MODE: "true" } }, projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }] });
   ```
   `e2e/utils.ts` holds the axe helper from contract §11.
6. **`package.json` scripts:** exactly as in contract §3.
7. `.github/workflows/ci.yml` (from contract §12):
   ```yaml
   name: ci
   on: { pull_request: {}, push: { branches: [main] } }
   jobs:
     ci:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - name: secret scan
           run: "! git grep -nE '(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_|xi-api-key)' -- ':!*.md' ':!.github/**'"
         - run: npm run typecheck
         - run: npm run lint
         - run: npm test
         - run: npm run build
           env: { DEMO_MODE: "true" }
     e2e:
       runs-on: ubuntu-latest
       needs: ci
       continue-on-error: true
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci && npx playwright install --with-deps chromium
         - run: npm run test:e2e -- --project=desktop
   ```
8. **More files:**
   - `.github/pull_request_template.md`: copy from contract §10.
   - `.github/CODEOWNERS`: map each path in contract §4 to `@<handle>`, using placeholders until you know the handles.
   - `.env.example`: copy from contract §8.
   - `.gitignore`: make sure it includes `.env*.local`.
9. **Folders:** create `docs/team/` and copy in all 6 files from the GUH `team/` folder. Create every folder from contract §4 with a `.gitkeep`. Add a `README.md` stub with the title, the one-line pitch and "see docs/team".
10. **Placeholder home:** `app/page.tsx` shows "Keystone" with the tagline, so the default Next.js page is never shown.
11. Verify locally:
    ```bash
    npm run typecheck && npm run lint && npm test -- --passWithNoTests && npm run build
    ```
12. Publish:
    ```bash
    git add -A && git commit -m "chore: scaffold keystone (next, tailwind, shadcn, tests, ci, contract types)"
    gh repo create keystone --public --source . --push
    ```
13. **Protect `main`:** run the `gh api … /branches/main/protection` command from contract §10, with `<OWNER>` set to your user or org.
14. **Add teammates:**
    ```bash
    for u in <p1> <p2> <p4> <p5>; do gh api -X PUT repos/<OWNER>/keystone/collaborators/$u -f permission=push; done
    ```
15. **Vercel:** go to vercel.com, choose New Project, import `keystone`, and set the env var `DEMO_MODE=true` for Preview. Add the real keys later, when teammates send them privately. Each PR now gets a preview URL.
16. **Discord:** "✅ Repo ready: `gh repo clone <OWNER>/keystone`. Protection is on: PRs only. Fixture PRs due 15:00."

**Done when:** CI is green on `main`, a test PR can't merge without review and CI, and the Vercel preview loads.

---

## PR1 (MUST, due 15:15): design system
**Branch:** `p3/design-system` · **Files:** `app/globals.css`, `app/layout.tsx` (fonts), `components/keystone/*.tsx` + tests, `components/shell/ThemeToggle.tsx`

### Steps
1. **Fonts:** use `next/font` Geist and Geist Mono (`geist` from `next/font/google` if available, otherwise Inter and JetBrains Mono). Set the CSS variables `--font-sans` and `--font-mono`.
2. **`globals.css` (Tailwind v4):**
   - Set the token values for `:root` and `.dark` exactly as in contract §9.2, including `--status-proven`, `--status-degree`, `--status-gap` and `--status-rising`, plus 4 chart colours `--chart-1..4` (indigo `#6366F1`, teal `#14B8A6`, fuchsia `#D946EF`, sky `#0EA5E9`).
   - Map them in `@theme inline { --color-status-proven: var(--status-proven); … }` so the classes `text-status-proven`, `bg-status-gap/10` and so on work.
   - Set `body { @apply bg-background text-foreground antialiased; font-feature-settings: "ss01","cv11"; }`.
   - Add `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms!important; transition-duration:.01ms!important } }`.
3. **ThemeToggle:** toggles the `dark` class on `<html>` and saves the choice to localStorage (with try/catch). The default is light.
4. **Shared components** (each in `components/keystone/<Name>.tsx`, named exports):
   - **`StatusBadge({status, size="md"})`:**
     - Map: proven → CheckCircle2 "Proven"; degree-done → GraduationCap "Degree ✓"; degree-upcoming → GraduationCap "Degree · later"; gap → Target "Gap"; rising → TrendingUp "Rising"; stable → Minus "Stable"; declining → TrendingDown "Cooling".
     - Style: `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium`, with background `bg-status-x/10`, text `text-status-x` and border `border-status-x/20`. degree-upcoming uses `border-dashed`.
     - **Always icon + text.**
   - **`SkillChip({skillId,name,status?,level?,onClick?})`:** a rounded-xl chip with a status dot and the name, plus 3 level dots (filled = level). It renders as a `button` when `onClick` is set. The aria-label is "Docker, gap, level 0 of 3".
   - **`ReadinessRing({value, projected, label})`:**
     - An SVG ring 160px across (120px on mobile), stroke 12.
     - A ghost arc for `projected` (`stroke-primary/25`) and a solid arc for `value` (`stroke-primary`).
     - The centre shows a count-up `38%` (motion, 800ms) with a small caption: "→ 84% by Sep 2027".
     - `role="img"` with aria-label "Readiness 38 percent, projected 84 percent".
   - **`ReceiptDrawer({receipt, title, open, onOpenChange})`:** a shadcn `Sheet` on the right (bottom on mobile).
     - Title: "Why am I seeing this?"
     - Rows:
       - 📊 "41% of ML engineer ads ask for it"
       - trend row with a StatusBadge and "+12% a year"
       - 🎓 "None of your modules teach it", "Covered later in COMP2xxxx" or "You've done this in COMP1xxxx"
       - evidence links
     - Footer: "Keystone explains every recommendation. Data: Adzuna ads, your syllabus, your GitHub."
   - **`PageHeader({title, subtitle, actions})`:** h1 at 36px semibold, a muted subtitle, actions on the right; stacked on mobile.
   - **`StatCard({label,value,delta?,hint?})`:** the value at 32px `tabular-nums`; the delta is a green or rose pill.
   - **`SectionCard({title,description,actions,children})`:** `rounded-2xl border bg-card p-6 shadow-sm`.
   - **`EmptyState({icon, title, body, action})`** and **`ErrorState({title="Something went wrong", body, onRetry, onUseDemo})`:** the icon sits in a soft circle, with a single primary button (plus a secondary "Use demo data").
   - **`LoadingSkeleton({variant: "card"|"list"|"chart"|"graph"})`:** shapes that look like the real content.
   - **`BadgePill({badge})`:** emoji and label from contract §9.6, with a tooltip explanation (for example 🌱 "New to UoM: in their first 10 weeks. Be extra welcoming!").
   - **`AgentAvatar({agent, size})`:** the icon and colour map from contract §9.6, in a coloured rounded-xl square.
   - **`DemoDataNote()`:** a small muted pill reading "Demo data".
5. Add a `components/keystone/index.ts` barrel export.

### Required tests (`// @vitest-environment jsdom`)
1. StatusBadge "gap" renders the text "Gap" and an svg icon. "degree-upcoming" has the class `border-dashed`.
2. SkillChip with `onClick` is a button with aria-label containing "level 2 of 3"; clicking it calls the handler.
3. ReadinessRing has `role="img"` and an aria-label containing "38 percent" and "84 percent".
4. ReceiptDrawer, when open, shows "41% of" and "none of your modules" for a receipt with `coveredByDegree:"no"`. Pressing Escape calls `onOpenChange(false)`.
5. ErrorState: clicking Retry calls `onRetry`; "Use demo data" calls `onUseDemo`.
6. BadgePill "new-to-uni" renders "New to UoM".

**Ship it:**
```bash
npm run typecheck && npm run lint && npm test
git switch -c p3/design-system   # create the branch before you commit
git add -A && git commit -m "feat(ui): design system tokens + shared keystone components"
git push -u origin p3/design-system
gh pr create --base main --title "feat(ui): design system tokens + shared keystone components" --body-file .github/pull_request_template.md --reviewer <P4-handle>
```
Add screenshots of a "kitchen sink" page (a temporary page at `/dev/ui` that renders every component in light and dark).

---

## PR2 (MUST, due 15:35): app shell, Activity panel, session, data layer
**Branch:** `p3/app-shell` · **Files:** `app/providers.tsx`, `app/(app)/layout.tsx`, `components/shell/{Sidebar,TopBar,PersonaSwitcher,ActivityPanel,MobileNav}.tsx`, `lib/session.ts`, `lib/fetcher.ts`, `middleware.ts` + tests

### Steps
1. **`providers.tsx`** (client): a `QueryClientProvider` (staleTime 30s, retry 1) plus the sonner `<Toaster richColors position="top-center"/>`.
2. **`lib/fetcher.ts`:** `apiGet<T>(url)`, `apiPost<T>(url, body)` and `apiPatch<T>(url, body)` fetch the URL, parse the JSON, and if `!json.ok` throw `new Error(json.error.message)`. Otherwise they return `json.data`.
3. **`middleware.ts`:**
   - If the URL has `?demo=1`, set the cookie `ks_uid=aisha` (path /, 7 days).
   - If there's no `ks_uid` cookie and the path is under `/(app)` (except `/onboard`), redirect to `/onboard`.
4. **`lib/session.ts`:**
   - `getCurrentUserId()` (server) reads `cookies().get("ks_uid")`.
   - `useCurrentUser()` (client) reads `document.cookie`, then `useQuery(["profile", id], () => apiGet<Profile>(\`/api/profile/${id}\`))`.
5. **Sidebar** (`w-64`; collapses to `w-16` icons-only on `md`):
   - Logo: an arch SVG with "Keystone" in semibold.
   - Nav items (lucide icons): Dashboard (LayoutDashboard), Bridge Map (Network), Roadmap (Route), Industry Radar (Radar), Pods (Users), Trajectories (Milestone), Community (HeartHandshake), Interview (Mic), Passport (BadgeCheck).
   - Active state: `bg-primary/10 text-primary` with a left 3px bar.
   - Footer: "Reply · AI on Campus".
6. **TopBar:**
   - **PersonaSwitcher:** a dropdown with the avatar, name, badges, and the list of Aisha plus the 12 seeded students. Read them with a static import of `data/seed/students.json`, guarded with try/catch in case P5 hasn't merged it yet. Choosing one sets the cookie and refreshes the page.
   - **Readiness pill:** "ML engineer · 38%", from `useQuery(["graph", uid, role])`.
   - **ThemeToggle.**
   - **Agents button:** a Sparkles icon labelled "Agents" that pulses (a ring animation) while a run is live.
7. **ActivityPanel** (the signature multi-agent proof):
   - A right-hand `Sheet` 420px wide (full screen on mobile).
   - The header reads "Agents at work", followed by a live dot and "9 agents".
   - **Hook:** `useActivity()` comes from a context provider holding `{runId, events, open, setOpen, start(runId)}`. `start` opens `new EventSource(\`/api/agents/stream?runId=${runId}\`)`, listens for `"agent"` events and appends them. It closes on orchestrator done or error. **Fallback:** if EventSource errors twice, poll `GET /api/agents/stream?runId=&poll=1` every 1 second.
   - **Rendering:** events grouped by agent as an ordered timeline. Each row shows the AgentAvatar, the agent name (bold), the message with numbers highlighted (wrap any `\d+%?` in `<span class="font-mono font-semibold text-foreground">`), a status icon (Loader2 spinning for progress, CheckCircle2 for done, AlertTriangle for error) and a relative time.
   - New rows slide in (motion, y: 8 → 0, 180ms).
   - The container has `aria-live="polite"`.
   - **Completion:** when the orchestrator is done, show a success card: "Bridge ready · 38% → 84%" and a [See my Bridge Map] button that goes to `/map`.
   - **Empty state:** "No agents running. Start onboarding or replay the demo run." with a [Replay demo run] button that calls `apiPost("/api/onboard/run",{userId:"aisha"})` and then `start(runId)`.
8. **MobileNav** (`md:hidden`, fixed bottom): Dashboard, Map, Roadmap, Pods and More (a sheet with the rest). Tap targets are at least 44px.
9. The **`(app)/layout.tsx`** grid is `[sidebar][main]`; main is `max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8`, with `ActivityProvider` wrapping everything.

### Required tests
1. fetcher: an `ok:false` response throws with its message; `ok:true` returns the data.
2. ActivityPanel (with mocked EventSource): 3 events render 3 rows with agent names. An orchestrator-done event shows "Bridge ready" and the button. The panel has `aria-live`.
3. ActivityPanel highlights "214" in a `font-mono` span.
4. ActivityPanel fallback: after 2 EventSource errors, polling fetch is called.
5. Sidebar: the active link has `aria-current="page"`.
6. middleware: `?demo=1` sets the cookie `ks_uid=aisha` (unit test on the function).

**Ship it:** commit `feat(shell): app shell, activity panel, session + fetcher`, then open the PR with `--reviewer <P4-handle>`. Include desktop and mobile screenshots and a GIF of the panel replaying.

---

## PR3 (MUST, due 15:55): onboarding wizard `/onboard`
**Branch:** `p3/onboarding` · **Files:** `app/(app)/onboard/page.tsx`, `components/onboarding/{Stepper,StepYou,StepGoal,StepLearn,StepConnect,StepReview}.tsx` + tests

### Layout
A centred card `max-w-2xl`, a stepper on top (5 dots and labels, with the current one in `--primary`), and a sticky footer with [Back] and [Continue] (primary). The draft is saved to localStorage `ks_onboard_draft` on every change, wrapped in try/catch.

### Steps
1. **"You":**
   - Name. University programme URL, prefilled with the UoM BSc CS URL, with a "Use demo programme" link that sets `programmeId` to `uom-bsc-cs`.
   - Year (segmented control 1–4) and start date (default 2026-09-21).
   - Opt-in badges as toggle cards: 🌱 New to UoM ("Helpers will explain things in more detail"), 🌍 International, 🧭 First-gen, 🔁 Career changer.
   - Copy: "These badges are optional and only used to send help your way."
2. **"Goal":**
   - Role cards from `GET /api/roles`, each showing an icon, the name and "Top skills: Python · SQL · Docker" (from the `/api/market/<role>` query). Pick up to 2; the first one picked is the primary.
   - A timeline select: "Summer internship 2027", "Placement 2027/28", "Graduate job 2029", or custom. This sets `targetDate`.
3. **"How you learn":**
   - An hours slider (2–20) with the live label "8 hours a week".
   - **A theory ↔ practice slider** with the live sentence: "Mostly building (70%), some reading (30%)".
   - Format toggles: video, docs, projects, pair.
   - Budget: "Free resources only" or "Paid is OK".
   - Constraint chips: part-time job, caring, commuting.
   - Accessibility checkboxes.
   - **Slot:** `<VoiceOnboardButton onComplete={(dna)=>merge(dna)} />`, rendered only if `components/voice/VoiceOnboardButton` exists. Use `next/dynamic` with a catch → null. Label: "Prefer to talk? Tell our voice coach instead."
4. **"Connect":**
   - **GitHub username:** shows a live avatar preview `https://github.com/<login>.png?size=80` once there are 2 or more characters, with a check icon once the image loads.
   - LeetCode username (optional).
   - **LinkedIn PDF:** disabled, with the note "Coming soon. We never scrape LinkedIn; you'll upload your own export."
   - X profile link (display only).
   - Copy: "We only read public work you choose to share. Nothing is posted anywhere."
5. **"Review":**
   - A summary card for each step, with Edit links.
   - The big primary button **"Build my bridge →"**. On click:
     1. Show a loading state ("Starting your agents…").
     2. `apiPost<Profile>("/api/profile", profile)`
     3. `apiPost<{runId}>("/api/onboard/run",{userId: profile.id})`
     4. `activity.start(runId)`
     5. `router.push("/dashboard")`
   - On error, show a toast ("Couldn't start. Try again or use the demo.") and the ErrorState actions.
6. **Validation:** a zod schema per step, with inline errors under each field (`text-sm text-status-gap`). Continue is disabled until the step is valid. Enter submits the step.
7. **Motion:** steps slide horizontally (x ±24, 200ms), or fade only under reduced motion.

### Required tests
1. Step "You": Continue is disabled with an empty name and enabled after typing one.
2. The theory slider at 70 shows "Mostly building (70%)".
3. Goal: you can't select a third role (a toast or disabled state).
4. GitHub input "octocat" renders an img with src containing `github.com/octocat.png`.
5. Review submit calls `/api/profile` and then `/api/onboard/run` (mocked fetch) and pushes `/dashboard`; on failure it shows the error toast.
6. The draft persists: reloading the component restores the name from localStorage.
7. e2e: complete the wizard in DEMO_MODE and land on `/dashboard` with the Activity panel open; axe passes on `/onboard`.

**Ship it:** commit `feat(onboarding): 5-step learning DNA wizard`, then open the PR with `--reviewer <P4-handle>`. Include screenshots of each step.

---

## PR4 (MUST, due 16:15): Bridge Map `/map` (the signature screen)
**Branch:** `p3/bridge-map` · **Files:** `app/(app)/map/page.tsx`, `components/map/{BridgeGraph,SkillDetailPanel,MapFilters,MapLegend,MapListView}.tsx` + tests

### Wireframe
```
PageHeader "Your Bridge Map" — "Everything an ML engineer needs, and how your degree and your work already cover it."
[ReadinessRing 38% → 84%]  [StatCard Proven 4] [StatCard Degree covers 9] [StatCard Gaps 10]
Filters: [✓Proven][✓Degree][✓Gaps] [Category ▾] [Only role skills ◉]   [Graph | List]
┌──────────────── graph canvas (h-[560px]) ───────────────┐┌ SkillDetailPanel (w-96) ─────┐
│  nodes coloured by status, sized by demand,              ││ Docker            ◎ Gap      │
│  rising = amber halo, upcoming = dashed ring             ││ 41% of ads · 📈 +12%/yr      │
│                                                          ││ Not covered by your degree   │
│                                       [legend]           ││ Evidence: none yet           │
└──────────────────────────────────────────────────────────┘│ [See it in your roadmap →]   │
                                                            └──────────────────────────────┘
```

### Steps
1. Data: `useQuery(["graph", uid, roleId], () => apiGet<BridgeMap>(\`/api/graph/${uid}?roleId=${roleId}\`))`.
2. **`BridgeGraph`:**
   - Use `dynamic(() => import("react-force-graph-2d"), { ssr: false })`, with `graphData = { nodes, links: edges.map(e => ({source:e.from, target:e.to})) }`.
   - `nodeCanvasObject` draws:
     - a circle with radius `6 + demand*14`, filled with the status colour read from the CSS variables (via `getComputedStyle`),
     - a dashed outline ring for degree-upcoming,
     - an amber halo (radius +4, alpha 0.35) for rising,
     - the label when `globalScale > 1.2` or on hover (12px Geist, foreground colour).
   - Links are thin (`--border` colour) with directional particles off.
   - Set `cooldownTicks=120` and call `zoomToFit(400, 60)` on engine stop.
   - `onNodeClick` sets the selected skill and centres on the node.
   - Hover shows a tooltip with "Docker · Gap · 41% of ads".
   - Deep link: `?skill=docker` selects that skill on load.
3. **`SkillDetailPanel`** (right on desktop, bottom `Sheet` on mobile):
   - Name, a StatusBadge, level dots.
   - The demand line "41% of ML engineer ads".
   - Trend: a StatusBadge plus a mini sparkline (Recharts LineChart, 120×32, from `/api/trends?skills=`).
   - Degree: module chips with their term ("COMP1xxxx · Year 1 Sem 2").
   - Evidence list with source icons (Github or Code2) and external links.
   - CTA: "See it in your roadmap" goes to `/roadmap#skill-docker` for gaps, or "Show your proof" goes to the passport for proven skills.
4. **`MapFilters`:** status toggle chips (ToggleGroup), a category Select and an "Only role skills" Switch. Filtering hides nodes and links on the client.
5. **`MapLegend`:** 4 statuses plus "rising" and "upcoming (dashed)", each with an icon and text.
6. **`MapListView`** (the accessible alternative, toggled with Graph | List tabs): a shadcn Table with columns Skill, Status (StatusBadge), Demand %, Trend, Covered by and Evidence. Sortable headers are buttons. The default sort is demand descending.
7. **States:** Loading = graph skeleton plus a "Watch the agents build it →" link that opens the panel. Empty = "Your map is empty. Finish onboarding to build it." Error = ErrorState with retry and demo actions. Success = a toast the first time: "Tip: click any skill to see why it matters".
8. Performance: cap the graph at 120 nodes, use `devicePixelRatio`, and pause the simulation when the tab is hidden.

### Required tests
1. MapListView renders one row per node, sorted by demand by default; clicking the "Demand" header toggles the order.
2. Filters: unchecking "Gaps" removes the gap rows from the list view.
3. SkillDetailPanel for docker shows "41% of", "Gap" and "Not covered by your degree".
4. Deep link `?skill=docker` opens the detail panel (mock the router search params).
5. The page in its error state shows ErrorState (mock the query).
6. e2e: `/map?demo=1` shows a `canvas`; switching to List shows the table with "Docker"; axe passes.

**Ship it:** commit `feat(map): interactive bridge map + accessible list view`, then open the PR with `--reviewer <P4-handle>` and attach a GIF.

---

## PR5 (MUST, due 16:30): Roadmap `/roadmap`
**Branch:** `p3/roadmap` · **Files:** `app/(app)/roadmap/page.tsx`, `components/roadmap/{WeekCard,TaskRow,SkippedPanel,RoadmapHeader}.tsx` + tests

### Layout
- **RoadmapHeader:** "Your 12-week bridge", the line "38% today → 84% by Sep 2027", the actions [Regenerate] and [Adjust: theory ◀ ▶ practice], and the version tag "v2 · updated 2 min ago".
- **Left (lg:col-span-8):** a vertical timeline. The current week is highlighted with `ring-2 ring-primary` and "This week". Past weeks are at reduced opacity; exam weeks are muted with the tag "Lighter week: exams".
- **Right (lg:col-span-4):** a sticky **SkippedPanel** titled "Don't relearn: your degree covers these" (GraduationCap icon, `--status-degree` accent). Each item reads "Statistics → COMP1xxxx, Year 1 Sem 2" with the line "Saves about 12 hours". This is the "values your degree" moment, so make it visually distinctive (blue gradient border).

### `WeekCard`
- Header: "Week 3 · 23 Nov", the focus SkillChip, a "Why?" link that opens ReceiptDrawer, and hours "8h".
- Tasks (`TaskRow`): a checkbox, a type icon (BookOpen for learn, Dumbbell for practice, Hammer for build, Lightbulb for primer), the title, "2h", a Free pill, and the resource link "Open ↗".
- **Proof line:** a BadgeCheck icon with "Proof: Merge a PR adding a Dockerfile to your pod repo".
- `degreeLink` in muted text: "Builds on what you learned in COMP1xxxx".
- Each card has an anchor id `skill-<focusSkillId>` for deep links.

### Interactions
- **Checkbox:** an optimistic `apiPatch(\`/api/roadmap/${uid}/tasks/${taskId}\`,{done})` with the toast "Nice! 1 step closer". If every task in the week is done, show a confetti-lite animation (a scale pulse on the card, nothing under reduced motion) and the toast "Week complete: momentum +4".
- **Regenerate:** `apiPost("/api/roadmap/generate",{userId, roleId})`, opens the Activity panel, then invalidates `["roadmap", uid]` and shows the toast "Roadmap updated (v3)".
- **Theory/practice adjust:** ±10, then `apiPatch`/PUT `/api/profile/${uid}` with `{dna:{theoryPractice}}`, then regenerate.

### States
- **Loading:** 3 week skeletons.
- **Empty:** "No roadmap yet." with [Build my roadmap], which generates one.
- **Error:** ErrorState.

### Required tests
1. WeekCard shows the "Why?" button, and clicking it opens a drawer containing the receipt reason.
2. An exam week shows "Lighter week: exams".
3. Checking a task calls PATCH with `{done:true}` and updates the UI optimistically (it rolls back on error, with a toast).
4. SkippedPanel renders the "Don't relearn" heading and one item per `skipped` entry.
5. Regenerate calls POST generate and invalidates the query.
6. e2e: `/roadmap?demo=1`: open "Why?" and see "41% of"; axe passes.

**Ship it:** commit `feat(roadmap): weekly roadmap with receipts + don't-relearn panel`.

---

## PR6 (MUST, due 16:40): Dashboard `/dashboard`
**Branch:** `p3/dashboard` · bento grid (`grid md:grid-cols-6 gap-6`)
- **Hero card (col-span-4):** "Hi Aisha 👋 You're 38% of the way to ML engineer." plus the ReadinessRing and "Projected 84% by Sep 2027 if you follow your roadmap." It shows the newcomer banner when the user has the `new-to-uni` badge: "Welcome to UoM! Your buddy and pod are ready to help."
- **This week (col-span-2):** the focus skill and its tasks with checkboxes (reuse TaskRow), plus "Open roadmap →".
- **Top gaps (col-span-2):** 3 SkillChips that link to `/map?skill=`.
- **Market pulse (col-span-2):** rising skills relevant to the user (from `/api/trends` ∩ map nodes), for example "LLM evaluation +38%/yr".
- **Slots** (each wrapped in an error boundary and `next/dynamic` with a fallback card so a missing component never breaks the page):
  - `<PodSummaryCard userId/>` (P5, col-span-2)
  - `<MomentumWidget userId/>` (P5, col-span-2)
  - `<BriefingPlayer userId/>` (P4, col-span-2)
- **Interview CTA (col-span-2):** "Practise your ML engineer interview: 5 minutes, voice" goes to `/interview`.

**Tests:** the hero shows "38%"; the newcomer banner shows only with the badge; a slot that throws renders the fallback card and the rest of the page still renders.

---

## PR7 (SHOULD): Landing `/`
- **Hero** (full height, soft indigo radial gradient): the eyebrow "Reply · AI on Campus"; h1 at 56px "Your degree is the foundation. **Keystone builds the bridge to industry.**"; the subtitle "AI agents read your syllabus, the live job market and your real work, then build a roadmap that adds to your degree instead of repeating it."; CTAs [Build my bridge] and [Try the demo →] (`/dashboard?demo=1`).
- **Animated illustration:** an SVG arch whose stones are skill nodes lighting up in sequence (blue = degree, green = proven, red becomes green); static under reduced motion.
- **How it works:** 3 steps: "We read your degree" · "We read industry" · "We build your bridge, and your team".
- **Agents strip:** the 9 AgentAvatars with names and one-liners.
- **Evidence band:** "77% of employers say students with real work experience arrive better prepared." (ISE 2025).
- **Footer.**

**Test:** e2e with axe; the "Try the demo" link has `href` containing `demo=1`.

## PR8 (SHOULD): Skill Passport `/profile/[id]`
- **Header:** avatar, name, BadgePills, programme, and a "Verified by evidence, not self-reported" stamp (BadgeCheck in a circle).
- **Skills grid** grouped by category: SkillChip with level dots and evidence source icons, linking out to the proof.
- `<BuildLog userId/>` slot (P5).
- The "Interview-ready" badge if present.
- Buttons: [Copy link] (shows the toast "Link copied") and print styles (`@media print`: hide the nav, black on white).

**Tests:** only skills with level ≥ 2 appear; the copy button calls `navigator.clipboard.writeText`.

## PR9 (SHOULD): e2e demo + deploy
- **`e2e/demo.spec.ts`:** `/dashboard?demo=1` shows "38%" → `/map` has a canvas and the list contains Docker → on `/roadmap`, "Why?" opens the drawer → `/pods` loads (P5) → run `expectNoA11yViolations` on each page.
- **Production deploy:** promote on Vercel and set the env vars (real keys from teammates, `DEMO_MODE=false`). Keep a second deployment or env toggle with `DEMO_MODE=true` as the fallback URL.
- **Screenshots for P4** (Devpost): landing, onboarding step 3, map, roadmap with the receipt open, dashboard, pods, interview.

---

## 16:15 integration checkpoint (you lead it)
Run this on the `main` preview:
1. Onboard Aisha → watch the Activity panel stream.
2. Check `/dashboard` → `/map` → `/roadmap` → `/pods`.

Write the failures in Discord with an owner for each. Re-run at 16:45.

## Bug bash (16:50–17:05)
Test **P5's** `/pods`, `/trajectories` and `/community` against contract §9.5 (states), keyboard-only navigation, mobile at 375px, and dark mode. Run axe.

## Demo role
Present beats 2–4: onboarding, the Activity panel, the Bridge Map, and the roadmap receipt plus skipped items. Fallback: `?demo=1` plus "Replay demo run".

## Cut list (in this order)
PR8 passport → PR7 landing polish (keep the simple hero) → map sparkline → dashboard market pulse → onboarding voice slot. **Never cut:** scaffold, design system, shell + Activity panel, onboarding, map, roadmap.

## Risks
- **react-force-graph SSR errors:** dynamic import with `ssr:false`, and render the list view on the server.
- **SSE on Vercel:** the poll fallback is already built in.
- **Merge conflicts in `layout`:** only you edit shell files, and other people's pages live in their own folders.
- **Projector contrast:** test light mode on the projector at 15:45 if you can.

---

## PASTE THIS INTO YOUR CODING AGENT
> You are P3's coding agent on the Keystone hackathon repo. Read `docs/team/00-shared-contract.md` fully, then `docs/team/P3-frontend-ux-lead.md`.
>
> Do T0 first (the single allowed direct push to `main`). Then do PR1 → PR9 in order, each with this cycle:
> 1. `git switch main && git pull --ff-only && git switch -c <branch>`
> 2. Write the listed tests first (Vitest + Testing Library with jsdom, Playwright + axe for e2e).
> 3. Implement exactly the UI spec: shared components, tokens, the 4 states, keyboard and aria, mobile, reduced motion.
> 4. Run `npm run typecheck && npm run lint && npm test`.
> 5. Commit, push, then `gh pr create --base main --title "<title>" --body-file .github/pull_request_template.md --reviewer <P4-handle>`, with the test output and screenshots.
> 6. Give me the PR URL and stop.
>
> Never push to `main` after T0. Only edit P3-owned files. Render other people's components only through the documented slots, with error boundaries. Use `apiGet`, `apiPost` and `apiPatch` and React Query. If something in my file conflicts with the contract, follow the contract and tell me.
