---
name: keystone-ui
description: Keystone's UI rules and finish gate. Use it whenever you build, change, review or polish any Keystone page, component, chart, empty/error/loading state or UI copy (anything under app/ or components/), so every page looks like one product on a projector and passes the real-browser UI gate.
---

# Keystone UI

Five people's coding agents build Keystone's pages separately. On the projector it must look like
**one polished product**. `DESIGN.md` (repo root) is the full design system; contract §9
(`docs/team/00-shared-contract.md`) wins on any conflict. This skill is the short version plus the
gate you must pass before you call UI work done.

## Before you write UI

1. Read `DESIGN.md`, at least §8 Components, §12 The 4 states, §16 Do's and Don'ts and your page's recipe in §17.
2. Write the page's one-sentence job (the `PageHeader` subtitle) and name its **one** primary action.
3. Use `@/components/keystone` (PageHeader, SectionCard, StatCard, StatusBadge, SkillChip, ReadinessRing, ReceiptDrawer, BadgePill, AgentAvatar, EmptyState, ErrorState, LoadingSkeleton, DemoDataNote) and `@/components/ui/*`. Never fork them.

## Working rules

**Tokens, not hex.** `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border`,
`bg-primary`, `ring-ring`, `text-status-{proven,degree,gap,rising}`, `var(--chart-1..5)`. Raw hex only
inside `app/globals.css`.

**Status = colour + icon + label.** proven `CheckCircle2`, degree `GraduationCap`, gap `Target`, rising
`TrendingUp`, declining `TrendingDown`. Use `StatusBadge`/`SkillChip` or a text label ("Learns:"). Status
colours are for icons, dots, borders and fills; tinted callouts use `text-foreground`.

**Type.** Geist. Page title via `PageHeader` (one h1). Card titles `text-xl font-semibold`. Body 16px.
Numbers `font-mono tabular-nums`, key numbers 32px+ with a context line. **Nothing under 13px**: no
`text-[10px]`/`[11px]`/`[12px]`/`[0.8rem]`, no `size="sm"`/`"xs"` buttons. (`text-xs` is 13px here.)

**Cards and layout.** Card = `rounded-2xl border bg-card p-6 shadow-sm`. Inputs/buttons `rounded-xl`,
pills `rounded-full`. Gaps `gap-6`, sections `space-y-8`. Grids use `minmax(0,1fr)`. Two levels max:
card > tinted panel (`rounded-xl bg-muted/60 p-4`) or `divide-y` rows. No card inside a card inside a card.
Desktop card rows are grids of whole cards, not carousels that cut one off. Asides `lg:sticky lg:top-6`.

**Buttons.** One filled primary per screen. Repeated per-row actions are `variant="outline"`. Icon-only
buttons get `aria-label`; icons get `aria-hidden`. External links: `↗` + sr-only "(opens in a new tab)".

**4 states, always.** Loading = skeleton shaped like the content (+ "Watch the agents →" while an agent
runs). Empty = `EmptyState` with one action. Error = `ErrorState` with Retry + "Use demo data".
Success = content + `sonner` toast for actions.

**Data viz.** Chart tokens (never grey series), labels ≥13px, a one-sentence text summary from the data,
a "View as list" table, every number with its denominator ("41% of ML engineer ads", "14 of 40 journeys").

**Motion.** `motion/react`, 150–250ms ease-out, 40ms stagger, opacity/transform only,
`initial={reduce ? false : …}` with `useReducedMotion()`. No bounce, parallax or scroll reveals.

**A11y.** AA contrast, visible `focus-visible:ring-2 ring-ring`, labels on inputs, alt on images,
focusable scroll regions (`role="region" tabIndex={0} aria-label`), `aria-live="polite"` for live text.

**Mobile.** Single column under `md`, 16px gutters, no horizontal page scroll at 390px, touch targets
≥40px, side-by-side buttons stack (`flex-col-reverse sm:flex-row`).

**Voice.** Second person, kind, plain: "You're 38% of the way there. Here's this week." Peer learning,
learning by teaching, near-peer mentoring; never "networking". Agents propose, you decide; every
recommendation has a Why? receipt. Never use demographics for matching.

## Anti-slop: delete on sight

- Gradient blobs, glows, mesh/aurora backgrounds, glassmorphism, stock illustrations.
- Emoji as bullets or decoration (badges 🌱 🌍 🧭 🔁 🤝 🛠️ 🎤 only).
- "Unlock your potential", "supercharge", "seamless", "powerful", "journey", "ecosystem", "leverage", "Join thousands".
- Lorem ipsum, "John Doe", `[Company]`, `{{var}}`, "Card title", stray `**`/`##`, TODO text.
- Naked numbers ("0.41", "Score 82"), invented stats, testimonials or logos.
- The section template: eyebrow pill + claim + lede + 3 icon cards, everywhere; eyebrows that repeat the subtitle.
- A strip of stat tiles with one-word labels; six identical filled buttons in a list.
- "X, not Y" frames more than once a page; exclamation marks in body copy.
- Dead spinners; "Something went wrong" with no Retry.

## Finish gate (UI work is not done until every box is ticked)

Run the app and the real-browser gate:

```bash
DEMO_MODE=true npm run dev                       # or: DEMO_MODE=true npx next build && DEMO_MODE=true npx next start -p 3311
npm run ui-gate -- --base http://localhost:3000 /your-route   # default routes are always included
npm run ui-gate -- --base http://localhost:3000 --only /your-route   # just yours
```

It checks every route at 1440×900 and 390×844 and **FAILs** on axe serious/critical violations,
horizontal overflow, visible text under 13px, images without alt, and buttons/links without an
accessible name; it **WARNs** on more than one primary button above the fold, a missing h1, failed
requests and console errors. Screenshots land in `.ui-gate/<route>-<width>.png`. Exit code 1 = not done.

- [ ] `UI-GATE: PASS` for your routes (paste the table in the PR). Fix the cause, never the check.
- [ ] You **opened the screenshots** (1440 and 390) and looked: clear hierarchy, one primary, nothing cut or overlapping, numbers big with context, consistent with the other Keystone pages.
- [ ] All 4 states exist and were seen (force them with `?demo=1`, an offline API or a test).
- [ ] Copy read aloud passes §16: second person, specific, no slop words, no naked numbers.
- [ ] Keyboard pass: Tab reaches everything with a visible ring; dialogs trap and return focus.
- [ ] Reduced motion: nothing essential depends on animation.
- [ ] `npx tsc --noEmit`, `npx eslint <your files>` and `npx vitest run` are green.

If the gate cannot run (no Chromium: `npx playwright install chromium`; nothing on the port: start the
app), say so in your report instead of claiming the UI is done.
