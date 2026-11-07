---
version: 1
name: Keystone
description: "A calm, light-first product UI for university students: warm off-white canvas (#FAFAF9), white cards with 1px stone borders, slate ink (#0F172A) and one indigo accent (#4F46E5) for the single primary action, focus and brand. Status is always colour + icon + label (proven emerald, degree blue, gap rose, rising amber). Geist Sans for UI, Geist Mono with tabular numbers for every figure. Built to read from the back of a room on a projector: 16px body, key numbers 32px and up, nothing under 13px."
source-of-truth: "docs/team/00-shared-contract.md §9 wins on any conflict with this file."

colors:
  background: "#FAFAF9"
  card: "#FFFFFF"
  popover: "#FFFFFF"
  foreground: "#0F172A"
  muted-foreground: "#64748B"
  muted-foreground-on-tint: "#536175"
  muted: "#F5F5F4"
  secondary: "#F5F5F4"
  accent: "#EEF2FF"
  accent-foreground: "#3730A3"
  border: "#E7E5E4"
  input: "#D6D3D1"
  primary: "#4F46E5"
  primary-foreground: "#FFFFFF"
  ring: "#6366F1"
  destructive: "#DC2626"
  status-proven: "#059669"
  status-degree: "#2563EB"
  status-gap: "#E11D48"
  status-rising: "#D97706"
  chart-1: "#6366F1"
  chart-2: "#14B8A6"
  chart-3: "#D946EF"
  chart-4: "#0EA5E9"
  chart-5: "#F59E0B"

colors-dark:
  background: "#0B0B0F"
  card: "#14141A"
  foreground: "#F4F4F5"
  muted-foreground: "#A1A1AA"
  muted: "#1E1E26"
  accent: "#1E1B4B"
  border: "#27272A"
  primary: "#818CF8"
  primary-foreground: "#0B0B0F"
  ring: "#A5B4FC"
  status-proven: "#34D399"
  status-degree: "#60A5FA"
  status-gap: "#FB7185"
  status-rising: "#FBBF24"
  chart-1: "#818CF8"
  chart-2: "#2DD4BF"
  chart-3: "#E879F9"
  chart-4: "#38BDF8"
  chart-5: "#FBBF24"

typography:
  display: { fontFamily: Geist Sans, fontSize: 48px, lineHeight: 56px, fontWeight: 600, letterSpacing: -0.02em, class: text-display }
  h1: { fontFamily: Geist Sans, fontSize: 36px, lineHeight: 44px, fontWeight: 600, letterSpacing: -0.02em, class: text-h1 }
  h2: { fontFamily: Geist Sans, fontSize: 28px, lineHeight: 36px, fontWeight: 600, letterSpacing: -0.01em, class: text-h2 }
  h3: { fontFamily: Geist Sans, fontSize: 20px, lineHeight: 28px, fontWeight: 600, class: text-h3 }
  body: { fontFamily: Geist Sans, fontSize: 16px, lineHeight: 26px, fontWeight: 400, class: text-body }
  small: { fontFamily: Geist Sans, fontSize: 14px, lineHeight: 20px, fontWeight: 400, class: text-small }
  caption: { fontFamily: Geist Sans, fontSize: 13px, lineHeight: 18px, fontWeight: 500, class: "text-caption (text-xs is also 13/18)" }
  number: { fontFamily: Geist Mono, fontSize: 32px+, fontWeight: 600, fontFeature: tabular-nums, class: "font-mono tabular-nums" }

rounded:
  pill: 9999px      # rounded-full: badges, chips, filter pills
  card: 18px        # rounded-2xl: every card and panel
  control: 14px     # rounded-xl: buttons, inputs, selects, inner panels
  small: 10px       # rounded-lg: shadcn default button, tooltips

spacing:
  base: 4px
  card-padding: 24px      # p-6 (p-8 / p-10 only for a page's one hero card)
  section-gap: 24px       # gap-6 / space-y-6 (space-y-8 between page sections)
  page-gutter-mobile: 16px
  page-gutter-desktop: 32px
  max-width: 1280px       # max-w-7xl (already set by app/(app)/layout.tsx)

components:
  card: { background: "{colors.card}", border: "1px {colors.border}", rounded: "{rounded.card}", padding: 24px, shadow: shadow-sm, class: "rounded-2xl border bg-card p-6 shadow-sm" }
  button-primary: { background: "{colors.primary}", text: "{colors.primary-foreground}", rounded: "{rounded.control}", height: "40-56px", rule: "one per screen" }
  button-secondary: { variant: outline, background: "{colors.card}", border: "1px {colors.border}", rounded: "{rounded.control}" }
  status-badge: { rounded: "{rounded.pill}", parts: "icon + label + tint", class: "StatusBadge" }
  focus-ring: { width: 2px, color: "{colors.ring}", class: "focus-visible:ring-2 focus-visible:ring-ring" }
---

# Keystone design system

> Read this before building or polishing any page. Then use the `keystone-ui` skill
> (`.claude/skills/keystone-ui/SKILL.md`) and run the gate: `npm run ui-gate -- --base <url> /your-route`.
> Contract §9 (`docs/team/00-shared-contract.md`) is the source of truth. This file explains it,
> fills the gaps, and turns it into rules a coding agent can follow page by page.

## 1. Overview

Keystone is **the bridge from your degree to industry**. A student pastes their programme URL; agents
read the syllabus, real job ads and their GitHub, then show what their degree already covers, what
industry wants that it doesn't, a week-by-week plan, a pod of peers to build with, and proof that
climbs a ladder (Tried it → Built it → Can teach it).

Five people's coding agents build its pages separately. On a projector it must look like **one
product**: the same canvas, the same card, the same status language, the same voice on every screen.

**Key characteristics**
- Light-first. Warm off-white page (`#FAFAF9`), pure white cards, 1px stone hairlines. Dark mode is a `.dark` class with its own tokens, never an inverted afterthought.
- **One accent.** Indigo `#4F46E5` marks the one primary action on a screen, the focus ring, links and the brand. It is not a decoration colour.
- **Status is a language**, not a palette: proven, degree, gap, rising, each with a fixed colour, a fixed lucide icon and a word.
- **Numbers carry the story.** Big Geist Mono figures with tabular digits, always with a context line ("41% of ML engineer ads").
- **Agents are visible.** Each agent has an icon and a colour, and long work streams into the Activity panel.
- No decoration for its own sake: no gradient blobs, no glassmorphism, no stock illustrations, no emoji confetti.

## 2. Brand and voice

**Promise:** your degree is the foundation; Keystone builds the bridge to industry.
**Mechanism:** Keystone turns what you're taught into what you can prove.

| Do | Don't |
|---|---|
| Second person, present tense: "You're 38% of the way there. Here's this week." | Third person or system voice: "The user's readiness score is 0.38." |
| Kind and plain: "That's on us, not you. Try again." | Blame or jargon: "Request failed (500)." |
| Name the real thing: "Dockerise the captioning API", "Priya reviews your PR". | Vague benefit talk: "Accelerate your growth journey." |
| **Peer learning**, learning by teaching, near-peer mentoring, pods, helpers. | "Networking", "connections", "leverage your network". |
| "Agents propose, you decide." Every recommendation has a **Why?** receipt. | Dictating: "You must learn Kubernetes." |
| Celebrate growth against your own baseline: "+18% vs your usual week". | Rank students against each other, leaderboards pushed at people. |
| Say what data is seeded: `DemoDataNote`. | Fake live data or invented statistics. |

Words we use: *proof, pod, gap, covered by your degree, rising, this week, review, helper, newcomer (🌱)*.
Words we never use: *unlock, unleash, empower, supercharge, seamless, cutting-edge, revolutionary,
game-changer, journey (unless it is literally a trajectory), ecosystem, leverage, delve, robust, powerful, world-class*.

Matching and recommendations never use demographic fields. Badges like 🌍 International or 🧭 First-gen
are things a student chose to show; they invite kindness, they never filter.

## 3. Colors

All tokens live in `app/globals.css` as shadcn variable names, so every `components/ui/*` primitive
picks them up. Use the Tailwind utilities, never raw hex in components.

### Surface and ink

| Token | Light | Dark | Utility | Use |
|---|---|---|---|---|
| `--background` | `#FAFAF9` | `#0B0B0F` | `bg-background` | The page |
| `--card` | `#FFFFFF` | `#14141A` | `bg-card` | Cards, sheets, popovers |
| `--foreground` | `#0F172A` | `#F4F4F5` | `text-foreground` | Body text, headings |
| `--muted-foreground` | `#64748B` | `#A1A1AA` | `text-muted-foreground` | Secondary text, labels |
| `--muted` | `#F5F5F4` | `#1E1E26` | `bg-muted` | Inner panels, tracks, skeletons, hover |
| `--accent` | `#EEF2FF` | `#1E1B4B` | `bg-accent` | Menu hover, selected rows |
| `--border` | `#E7E5E4` | `#27272A` | `border` | Every 1px line |
| `--input` | `#D6D3D1` | `#3F3F46` | `border-input` | Field borders |
| `--primary` | `#4F46E5` | `#818CF8` | `bg-primary`, `text-primary` | The primary action, links, brand |
| `--primary-foreground` | `#FFFFFF` | `#0B0B0F` | `text-primary-foreground` | Text on primary |
| `--ring` | `#6366F1` | `#A5B4FC` | `ring-ring` | Focus rings |

Tints for soft emphasis: `bg-primary/5` (selected row, "your issue"), `bg-primary/10` (icon circles,
"You" pill), `bg-muted/60` (an inner panel inside a card). Never a tint of a tint.

**Secondary text on tints.** `#64748B` is 4.76:1 on white but only 4.36:1 on `--muted`. `globals.css`
therefore redefines `--muted-foreground` to `--muted-foreground-on-tint` (`#536175`) inside any element
whose class contains `bg-muted`, `bg-secondary`, `bg-accent`, `bg-primary/` or `bg-status-`. You get AA
for free; don't fight it with hard-coded greys.

### Status (the most important colours in the product)

| Status | Token | Light | Dark | Icon (lucide) | Label |
|---|---|---|---|---|---|
| Proven skill | `--status-proven` | `#059669` | `#34D399` | `CheckCircle2` | "Proven" |
| Degree covers it | `--status-degree` | `#2563EB` | `#60A5FA` | `GraduationCap` | "Degree ✓" (done: filled) / "Degree · later" (upcoming: dashed outline) |
| Gap | `--status-gap` | `#E11D48` | `#FB7185` | `Target` | "Gap" |
| Rising trend | `--status-rising` | `#D97706` | `#FBBF24` | `TrendingUp` | "Rising" |
| Declining trend | muted | `#64748B` | `#A1A1AA` | `TrendingDown` | "Cooling" |

**Colour + icon + label, never colour alone.** A red dot by itself means nothing to a colour-blind
judge or on a washed-out projector. Use `StatusBadge` / `SkillChip`, or group chips under a text label
("Learns:" / "Teaches:").

Status colours are for icons, dots, fills, borders and chart marks. As **text** on a tint they are below
4.5:1 in light mode (emerald 3.3:1, amber 3.2:1 on their own tint), so tinted callouts use
`text-foreground` with a status-coloured icon and border:
`rounded-xl border border-status-proven/25 bg-status-proven/10 px-3 py-2 text-sm text-foreground`.

### Charts

`--chart-1` indigo `#6366F1`, `--chart-2` teal `#14B8A6`, `--chart-3` fuchsia `#D946EF`, `--chart-4`
sky `#0EA5E9`, `--chart-5` amber `#F59E0B` (dark: `#818CF8 #2DD4BF #E879F9 #38BDF8 #FBBF24`). In recharts
pass `fill="var(--chart-1)"`; in Tailwind `fill-chart-1`, `bg-chart-1`. Never grey series: grey bands
vanish on a projector. When a chart shows skill status, use the status tokens instead of chart tokens.

## 4. Typography

Geist Sans for UI (`font-sans`, mapped to `--font-geist-sans` in `app/layout.tsx`), Geist Mono for
numbers and code (`font-mono`). Every stat uses `tabular-nums`.

| Role | Size / line | Weight | Utility | Use |
|---|---|---|---|---|
| Display | 48/56 | 600, tracking-tight | `text-display` | Landing hero, one per page at most |
| H1 | 36/44 | 600, tracking-tight | `text-h1` (or `text-3xl md:text-4xl`) | Page title (`PageHeader` renders it) |
| H2 | 28/36 | 600 | `text-h2` (or `text-xl md:text-2xl` for card titles) | Section titles |
| H3 | 20/28 | 600 | `text-h3` | Card titles inside a section |
| Body | 16/26 | 400 | `text-body` / default | Running text |
| Small | 14/20 | 400–500 | `text-small` / `text-sm` | Descriptions, metadata |
| Caption | 13/18 | 500 | `text-caption` / `text-xs` | Pills, labels, timestamps. **The floor.** |
| Key number | 32–56 | 600, mono | `font-mono text-4xl tabular-nums` | Readiness, compatibility, momentum |

- `text-xs` is raised to 13px in `globals.css`, so legacy `text-xs` is safe. Never write `text-[10px]`, `text-[11px]`, `text-[12px]` or `text-[0.8rem]` (the shadcn `size="sm"` button uses 12.8px: use the default size).
- Uppercase is for short section labels only (`text-sm font-semibold tracking-wide uppercase text-muted-foreground`), never for sentences.
- One h1 per page. Heading levels never skip. A hero heading inside a card is an h2 and is never bigger than the page's h1.
- `text-balance` on headings, `max-w-2xl` (≈65ch) on paragraphs.

## 5. Layout

### Spacing
4px grid. Cards `p-6`; the page's one hero card may use `md:p-10`. Inside cards `space-y-4`; between
cards `gap-6`; between page sections `space-y-8`. Don't invent values: if it isn't on the Tailwind
scale (`1 2 3 4 5 6 8 10 12`), don't use it.

### Page anatomy (every app page)
```
PageHeader            title (h1) · one-line subtitle that explains the page · primary action on the right
[context strip]       optional: 2–4 StatCards, each with a context line
Main grid             lg:grid-cols-3 → content lg:col-span-2 + aside (lg:sticky lg:top-6)
                      or lg:grid-cols-[minmax(0,1fr)_22rem] when the aside is a fixed rail
Secondary sections    full-width SectionCards, space-y-8
```
- The app layout already sets `mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8`. Don't add page-level max-widths or paddings.
- Use `minmax(0,1fr)` in grid templates so long words can't force overflow.
- Rows of cards fill the row: 2-up `md:grid-cols-2`, 3-up `lg:grid-cols-3`. Every card in a row has the same height (`h-full flex flex-col`, footer `mt-auto`).
- A row of cards on desktop never becomes a sideways carousel that cuts the last card. On mobile a snap scroller with an 85%-wide card is fine; at `lg` it becomes a grid.

### Whitespace
Space groups things; borders separate things. If two blocks need a line between them, prefer
`divide-y` rows inside one card over two cards.

## 6. Shapes

| Element | Radius | Utility |
|---|---|---|
| Card, sheet, empty/error state | 18px | `rounded-2xl` |
| Button, input, select, inner panel, list group | 14px | `rounded-xl` |
| Badge, chip, filter pill, avatar | full | `rounded-full` |

Nested radii shrink: an inner panel inside a `rounded-2xl` card is `rounded-xl`.

## 7. Elevation and depth

- Level 0: page `bg-background`.
- Level 1: card `bg-card border shadow-sm`. This is the only shadow at rest.
- Level 2: popover, dialog, sheet (shadcn defaults).
- Inside a card, depth comes from **tint, not borders**: `bg-muted/60 rounded-xl p-4` for an inner panel; `divide-y` for rows.

**Two levels, never three.** Card > panel > content. Never a bordered, shadowed card inside a card inside
a card. A list of requests inside a "Help a newcomer" card is a `divide-y` list, not six more cards.

## 8. Components

Use the shared components from `@/components/keystone` (contract §9.6). Never fork them; if one is
missing something, ask P3. shadcn primitives are in `@/components/ui/*`.

| Component | Use it for | Notes |
|---|---|---|
| `PageHeader` `{title, subtitle, actions?}` | The top of every app page | Subtitle is one sentence that says what the page is for. `actions` holds at most one primary button. |
| `SectionCard` `{title, description?, actions?, children}` | Every titled block | The standard card. Header actions are outline buttons. |
| `StatCard` `{label, value, delta?, hint?}` | One headline number | `hint` is mandatory in practice: the context line. |
| `StatusBadge` `{status, size?}` | Skill status or trend | Colour + icon + label built in. |
| `SkillChip` `{skillId, name, status?, level?, onClick?}` | A skill anywhere | Level is 3 dots; clickable chips open the receipt. |
| `ReadinessRing` `{value, projected?, label}` | Readiness (dashboard, Bridge Map, passport) | Counts up once; the projected value is a ghost arc. |
| `ReceiptDrawer` `{receipt, title}` | Every **Why?** | A sheet: sources, numbers, the agent that produced it. |
| `BadgePill` `{badge}` | 🌱 🌍 🧭 🔁 🤝 🛠️ 🎤 | Shown next to a person's name. Tooltip explains it. |
| `AgentAvatar` `{agent}` | Anywhere an agent is named | Icon + colour per agent (§9). |
| `EmptyState` `{icon, title, body, action}` | No data yet | One primary action. |
| `ErrorState` `{title, body, onRetry, onUseDemo}` | A failed load | Always both Retry and "Use demo data". |
| `LoadingSkeleton` `{variant}` | Loading | Shaped like the real content. |
| `DemoDataNote` | Seeded content | Once per section is enough for honesty. |

### Buttons: the hierarchy
1. **Primary** (`<Button>`, indigo fill): the one thing this screen is for. **One per screen**, ideally above the fold. Big moments get `size="lg" className="h-12 rounded-xl px-6 text-base"`.
2. **Secondary** (`variant="outline"`): everything else, including the same action repeated per row ("I can help", "Ask for 15 minutes", "Copy message").
3. **Ghost / link**: tertiary and inline actions ("Back to pods", "View as list").
- Icon-only buttons have an `aria-label`. Icons inside buttons are `aria-hidden`.
- Links that look like buttons use `buttonVariants()` on `<a>`/`<Link>`. External links say so: `↗` plus `<span className="sr-only">(opens in a new tab)</span>`.
- Don't use `size="sm"` / `size="xs"` buttons on pages (text under 13px).

### Lists, rows and people
- A person = `MemberAvatar`/`PersonAvatar` (alt text or `role="img" aria-label={name}`) + name + `BadgePill`s.
- Avatar initials are ≥13px; overlapping stacks use `size="md"` or larger so initials aren't clipped.
- Row metadata: `text-sm text-muted-foreground`, separated by `·`.

### Forms
Label above every field (`<Label htmlFor>`), helper text below, character counts right-aligned in
`text-xs tabular-nums`. Inputs `rounded-xl h-10`, textareas `text-base`. The submit button is the
form's primary and is disabled until the form is valid.

## 9. Agent identities

| Agent | Icon (lucide) | Colour | | Agent | Icon | Colour |
|---|---|---|---|---|---|---|
| orchestrator | `Workflow` | slate | | matchmaker | `Users` | pink |
| syllabus | `BookOpen` | blue | | architect | `Hammer` | teal |
| skillmap | `Network` | violet | | techlead | `GitPullRequest` | emerald |
| market | `Briefcase` | amber | | trajectories | `Milestone` | cyan |
| trends | `TrendingUp` | orange | | guides | `Compass` | lime |
| evidence | GitHub mark* | zinc | | voice | `Mic` | rose |
| roadmap | `Route` | indigo | | n8n | `Zap` | red |

\* lucide-react 1.x ships no brand icons: use the inline `GitHubMark` from `components/pods/IssueList.tsx`
(or `BadgeCheck`). Agent chips are `bg-<colour>-500/10 text-<colour>-600` (dark: `-400`) in a
`rounded-xl` square. Agent messages in the Activity panel always carry a real number:
*"Market Agent: 214 ads analysed"*, never *"Thinking…"*.

## 10. Data visualisation

- Every chart has a **one-sentence text summary** below it, written from the data: *"Of 40 journeys, 14 led to ML roles; 9 of those included a placement."* Put it in a `figcaption` with `aria-live="polite"` when filters change it.
- Every chart has a **table alternative** ("View as list"). The Bridge Map graph must have one.
- Labels on the chart are ≥13px (`fontSize={14}` in recharts ticks), with a `var(--card)` halo stroke when they sit on bands.
- Every number has its unit and denominator: "41% of ML engineer ads", "14 of 40 journeys", "+18% vs your usual week". Never a bare "0.41".
- Filters are pill toggles with `aria-pressed`, each with a colour dot that matches its series, the label, and a count.
- Big numbers: `font-mono font-semibold tabular-nums`, 32px+, with the context line under them.
- A wide chart on mobile scrolls inside a focusable region (`role="region" tabIndex={0} aria-label`), never the page.

## 11. Motion

`motion/react`. Motion explains a change; it is never decoration.
- 150–250ms, ease-out. List items stagger 40ms (`delay: i * 0.04`). Step changes cross-fade with a 6–10px rise.
- The readiness ring counts up once; graph nodes fade and scale in once; the pod matching animation is the one showpiece (≈3s, then the result).
- Move `opacity` and `transform` only. No bounce, no overshoot, no parallax, no scroll-triggered reveals on every card, no looping attention-seekers.
- Always `const reduce = useReducedMotion()` and pass `initial={reduce ? false : …}`. `globals.css` also collapses CSS animations under `prefers-reduced-motion`. Learning DNA's reduced-motion setting must be honoured too.
- Hover: buttons darken one step; linked cards may lift 2px. Nothing resizes or pushes a neighbour.

## 12. The 4 states (a data view is not done without all four)

| State | Pattern |
|---|---|
| Loading | `Skeleton` blocks shaped like the real layout (same card, same rows). If an agent is running: a "Watch the agents →" link that opens the Activity panel. No bare spinner. |
| Empty | `EmptyState`: lucide icon in a soft circle, one plain sentence on why it's empty, **one** primary action. |
| Error | `ErrorState`: what happened in plain words ("That's on us, not you."), **Retry**, and **Use demo data**. |
| Success | The content, plus a `sonner` toast for actions: `toast.success("You're in Pod Orbit", { description: "3 students fill your gaps, and you fill theirs." })`. |

## 13. Accessibility (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1 (large text ≥ 3:1). Check tints: see §3.
- Visible focus on everything: `focus-visible:ring-2 focus-visible:ring-ring` (outline-none only when a ring replaces it).
- Everything works with the keyboard; scrollable regions are focusable.
- Every input has a label; icon-only buttons have `aria-label`; images have `alt` (decorative: `alt=""`).
- One `<h1>`; landmarks via `<section aria-labelledby>`; lists are real `<ul>/<ol>`.
- The Activity panel and live captions use `aria-live="polite"`.
- Status never by colour alone (§3). Charts have text summaries and tables (§10).
- axe: **0 serious or critical** violations. `npm run ui-gate` checks this in a real browser.

## 14. Projector rules

Judging happens on a projector at the back of a room, in light mode.
- Base font 16px; **key numbers ≥ 32px**; **no text under 13px** anywhere (the gate fails it).
- Strong contrast: no light-grey-on-white body text, no thin weights below 400.
- The one thing that matters on each screen is visible without scrolling at 1440×900.
- Colours must survive a washed-out projector: status and charts use the saturated tokens, never pastel greys.
- Demo routes load instantly with `DEMO_MODE=true` and never show an empty first frame.

## 15. Responsive and mobile

| Width | Behaviour |
|---|---|
| ≥1024 (`lg`) | Main + aside grids, 3-up card rows, sticky aside |
| 768–1023 (`md`) | 2-up rows; aside drops below |
| <768 | Single column, 16px gutters; sidebar becomes a bottom tab bar (5 items + More); primary action may sit in a sticky bottom bar |

- **No horizontal page scroll** at 390px (the gate fails it). Wide tables and charts scroll inside their own focusable region.
- Touch targets ≥ 40px tall (44px for the primary).
- Buttons that sit side by side on desktop stack full-width on mobile (`flex-col-reverse sm:flex-row`, primary last in DOM so it lands on top).
- Test at 390×844 every time; the gate screenshots it.

## 16. Do's and Don'ts (anti-slop)

These are the tells that make a page read as machine-generated. One is a smell; three is slop.

### Do
- Lead each screen with the answer to "what should I do next?"
- Put every number in a sentence with its context: "Docker: 41% of ML engineer ads, and no module covers it."
- Use the student's real data and the seeded cast (Aisha, Priya, Tom, Mei…). In demo mode, show `DemoDataNote`.
- Spend words where you know most; let some cards be two lines.
- Use one primary action per screen; make per-row actions outline buttons.
- Use the shared components and tokens; one card style; one radius family.
- Write microcopy too: empty states, errors, toasts, disabled reasons, all in the same kind voice.
- End sentences on information, not on a quip or a moral.

### Don't
- **No decoration:** gradient blobs, glows, mesh or aurora backgrounds, glassmorphism, noise textures, 3D illustrations, stock photos. A single faint tint wash on a hero header is the maximum.
- **No emoji confetti:** emoji only as `BadgePill` badges (🌱 🌍 🧭 🔁 🤝 🛠️ 🎤) or one inside a sentence that refers to a badge. Never as bullets or headings.
- **No hype copy:** "Unlock your potential", "Supercharge your career", "Your journey starts here", "The future of learning is here", "Seamless", "Powerful AI-driven insights", "Join thousands of students".
- **No placeholder residue:** lorem ipsum, "John Doe", `[Company Name]`, `{{name}}`, "Card title", markdown `**` or `##` on the rendered page, "TODO".
- **No naked numbers:** "0.41", "Score: 82", "73%" with nothing saying 73% of what.
- **No invented specifics:** made-up stats, testimonials, logos or "trusted by" strips. Only data the agents or the seed produced.
- **No section template:** eyebrow pill + big claim + lede + three icon cards, repeated on every section. No uppercase eyebrow over every heading. No eyebrow that repeats the subtitle.
- **No strip of stat tiles** with one-word labels and no context line.
- **No nested cards** (card in card in card), no tilted cards, no carousels that cut a card on desktop.
- **No competing primaries:** six indigo "I can help" buttons in a feed; two filled buttons side by side.
- **No contrast frames as a habit:** "X, not Y", "rather than", "without the" more than once a page. No "Not only… but also".
- **No exclamation marks** in body copy (one in a success toast is fine). No em-dash chains.
- **No dead spinners**, no "Loading…" with nothing shaped like the content, no "Something went wrong" without Retry.
- **No text under 13px**, no grey-on-grey, no colour-only status.
- **No "networking"**; no leaderboards pushed at people; no demographic filters.

## 17. Page recipes

Each recipe: the job of the page (the PageHeader subtitle), the one primary action, and the layout.

### Dashboard `/dashboard` (P3)
- **Job:** "Here's where you are and what to do this week."
- **Primary:** "Start this week's task" (the roadmap week's proof).
- **Layout:** PageHeader with greeting ("Hi Aisha") · hero card: `ReadinessRing` (38% → projected 84% by Sept 2027) beside "This week: Docker" with why ("41% of ML engineer ads; no module covers it") and the primary · row of 3 `StatCard`s (momentum "+18% vs your usual week", proven skills "4 proven · top gap: Docker", pod "Pod Orbit · your issue: Dockerise the captioning API") · `MomentumWidget` + Build Log · pod summary card.

### Bridge Map `/map` (P3)
- **Job:** "What your degree covers, what industry wants, and the gaps between."
- **Primary:** none in the header; the graph is the page. Clicking a node opens its `ReceiptDrawer`.
- **Layout:** PageHeader with "View as list" toggle · legend strip (StatusBadge for proven, degree done, degree later, gap, rising) · the force graph in a card (`next/dynamic`, `ssr:false`), nodes coloured by status **and** drawn with the status icon/outline style · side rail: top gaps ranked by demand ("Docker · 41% of ads"). The list view is a table: skill, status badge, demand %, covered by (module), proof.

### Roadmap `/roadmap` (P3)
- **Job:** "Your plan, week by week. Skip what your degree already teaches."
- **Primary:** "Start week N".
- **Layout:** current week as a hero card (skill, why with receipt, the proof task, linked pod issue) · vertical timeline of weeks with status (done ✓, now, later), "Skip: your Semester 2 module covers it" rows in degree-blue with `GraduationCap` · re-plan changes shown as a "You decide" diff the student approves.

### Pods `/pods` (P5, the demo centrepiece)
- **Job:** "Peer learning: teach what you know, learn what you don't, and ship a real project together."
- **Primary:** "Find my pod" → after matching, "Start our project".
- **Layout:** no pod → one hero card: heading, one-sentence promise, the primary, the fairness line ("Matched on skills, interests and availability. Never on personal characteristics.") and a tinted panel of three plain rows (who, learn by teaching, real GitHub project) · matching → the animation card with a live status line ("Comparing 12 students…") · matched → `PodCard`: name, avatar stack, compatibility as a big mono number **with** its context line, members as `divide-y` rows (Learns / Teaches chips), "How you'll help each other" as tinted rows, footer with outline "Find a different pod" + primary.

### Project view `/pods/[podId]` (P5)
- **Job:** the pod's project, milestones and who reviews what.
- **Primary:** "Open repo ↗" (mobile: sticky bottom bar).
- **Layout:** back link · avatar stack + "Pod Orbit · 3-week project · 7 issues" · h1 project title + pitch · milestone stepper (current milestone tinted, `aria-current="step"`) · main: Issues card grouped by milestone, the viewer's issues tinted with a "Your issue" pill · aside: "Start here" (your issue, who reviews it), "How pods work" (4 real steps), members.

### Trajectories `/trajectories` (P5)
- **Job:** "Near-peer mentoring: see how students before you got where you want to go."
- **Primary:** none above the fold; per-card outline "Ask for 15 minutes".
- **Layout:** Sankey card (filter pills with counts, chart tokens, "View as list" table, one-sentence summary) · "Students like you": 3-up grid of `TrajectoryCard`s on desktop (snap scroller on mobile), each with similarity "57% similar to you", a step timeline, their advice as a quote, `DemoDataNote`.

### Community `/community` (P5)
- **Job:** "Learning by teaching: help a newcomer, ask for help, learn from practitioners."
- **Primary:** "Ask for help" (the composer's submit).
- **Layout:** main (2/3): "Help a newcomer" feed as `divide-y` rows (🌱 newcomers first), each with person, kind pill, time, message, outline "I can help" · sticky aside (1/3): Ask composer (newcomer note as a neutral callout), opt-in "Helpers this week" · full width: "Learn from practitioners" with the safety line "You send it yourself. We never message anyone." and draft cards as tinted panels.

### Lecturer insights `/lecturer` (P1, could)
- **Job:** "Anonymous cohort gaps and what your students could teach each other."
- **Primary:** "Suggest a lab" (opens the lab idea with its learning outcome).
- **Layout:** privacy line first ("Anonymous, shown only for groups of 10 or more") · 3 `StatCard`s with context ("Docker: top gap, 0 modules cover it", "3 students can already teach it") · bar chart of gaps by demand (chart tokens, text summary, table) · peer-teachable skills list · lab suggestion cards tied to a named learning outcome. The lecturer decides; nothing is automatic.

### Landing `/` and campaign `/launch` (P3, P4)
A landing page wins one intent: **one offer, one audience, one primary action** ("Try the demo" / "Map my degree").
- Above the fold: headline that names the outcome and the audience ("Your degree is the foundation. Keystone builds the bridge to industry."), one subheadline that says how, the one CTA (verb + what you get), one proof signal from real data (e.g. "214 ML engineer ads read for this demo"), and a real product screenshot (the Bridge Map or the pod card), not an illustration.
- Then: problem → how it works in three real steps (syllabus → plan → pod and proof) → proof (the demo's real numbers) → FAQ (EU AI Act, privacy, "does it grade me?") → the same CTA again.
- Never competing CTAs above the fold; no invented testimonials, logos or counts; check at 390px.

## 18. Iteration guide (for coding agents)

1. Read this file and contract §9. Load the `keystone-ui` skill.
2. Start from the recipe for your page. Write the PageHeader subtitle first: if you can't say the page's job in one sentence, the page isn't ready.
3. Build with the shared components and tokens; build all four states.
4. Run the app (`DEMO_MODE=true`) and the gate: `npm run ui-gate -- --base http://localhost:3000 /your-route`.
5. Fix every FAIL. Open the screenshots in `.ui-gate/` and look at them at 1440 and 390: hierarchy, spacing, one primary, nothing cut. The gate can't judge taste; you can.
6. Re-run until `UI-GATE: PASS`. Put the table in your PR.

## 19. Known gaps

- The keystone components in this worktree are a local shim of P3's; prop names follow contract §9.6.
- Learning DNA's reduced-motion preference is not wired into a global provider yet; respect `useReducedMotion()` everywhere so it works when it is.
- Dark mode tokens are defined but the app is judged in light mode; check dark before shipping a new colour.
