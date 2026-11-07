# Design: Keystone

The locked system. Every Hallmark run reads this first and every page shares it. Change it on purpose; the file is the rule. `app/tokens.css` is the source of truth for every value below.

## System
- Genre: modern-minimal (app screens; `/` and `/launch` are marketing pages in the same system)
- Shape of the first page: app screen
- Theme: Coral (deal 1/3), re-mixed for a light-first projector app: warm grey paper, cotton cards, ink actions, one coral signal
- Axes: light/grotesk-sans/warm · posture: restrained
- Audience: first-year and newcomer students, and Reply judges reading from the back of a room

## Tokens
```css
:root {
  --color-paper: oklch(97% 0.006 55);   --color-paper-2: oklch(94.5% 0.007 55);  --color-paper-3: oklch(91.5% 0.009 55);
  --color-cotton: oklch(99% 0.004 80);  --color-desk: oklch(94.3% 0.008 64);
  --color-ink: oklch(21% 0.012 38);     --color-ink-2: oklch(29% 0.013 40);      --color-ink-3: oklch(47% 0.013 45);
  --color-rule: oklch(87% 0.009 55);    --color-rule-2: oklch(81% 0.011 55);     --color-field: oklch(60% 0.012 50);
  --color-signal: oklch(53% 0.15 40);   --color-accent-ink: oklch(99% 0.004 80); --color-focus: oklch(53% 0.17 35);
  --color-board: oklch(22% 0.011 40);   --color-board-type: oklch(97% 0.006 70);
  --status-proven: oklch(50% 0.12 150); --status-degree: oklch(50% 0.1 255);
  --status-gap: oklch(51% 0.19 10);     --status-rising: oklch(55% 0.13 80);
  --font-display: Instrument Sans;  --font-body: Instrument Sans;  --font-outlier: Geist Mono (figures and code only);
  --radius-card: 10px;  --radius-control: 8px;  --radius-input: 6px;  --shadow-card: 0 1px 2px (shade / 0.08);
}
```
Dark mode is the `.dark` class on `<html>`, derived (never inverted) in the same file. shadcn names map onto these: `bg-background` paper, `bg-card` cotton, `text-foreground` ink, `text-muted-foreground` ink-3, `bg-muted` paper-2, `bg-accent` paper-3 (hover), `border-border` rule, `border-input` field, `text-primary` / `stroke-primary` the coral signal, `bg-sidebar` desk.

Type scale (1.2 from 16px, nothing under 13px): `text-xs` 13 · `text-sm` 14 · `text-base` 16 · `text-lg` 19 · `text-xl` 23 · `text-2xl` 28 · `text-3xl` 33 · `text-4xl` 40 · `text-5xl` 48. Page title `text-3xl md:text-4xl` 600; region title `text-xl` 600; item title `text-lg` 600; body 16; labels and meta `text-sm`/`text-xs` 500, sentence case, untracked. Key numbers are `font-mono tabular-nums` at `text-3xl` (33px) or larger.

## Controls
- Primary: `<Button>` default, ink board with paper text, 8px radius, 36px (`size="lg"` 44px for the one page action). One per screen.
- Secondary: `<Button variant="outline">`, a cotton card with a lit edge and a cast (`shadow-stock`), same radius and height; hover lifts 1px.
- Fields: 40px, 6px radius, 1px `border-input` (3:1), cotton fill; the focus ring is a 2px coral outline, instant, inset on fields.
- The coral signal marks where you are and what is yours: the active nav item, the focus ring, links, the readiness arc and a chart's one argued series. Never a fill behind a paragraph, never a heading colour.

## Status
Always colour + icon + label, via `<StatusBadge>`: Proven (CheckCircle2, green), In your degree (GraduationCap, blue), Later in your degree (GraduationCap, dashed), Gap (Target, crimson), Rising (TrendingUp, ochre), Stable, Cooling. Colour sits on the icon, tint and edge; the label stays ink (15:1 on every tint).

## Agents
`AGENT_META` gives each of the 14 agents one lucide icon and one hue, all mixed at the same OKLCH lightness (`bg-<agent>-500/12 text-<agent>-700`). Use `<AgentAvatar>`; never invent another agent colour.

## Surfaces
Paper canvas, desk-toned sidebar, cotton cards with a hairline and `shadow-sm`. One containment layer: a card holds wells (`bg-muted`, no border) and rows split by hairlines, never another card. Tables before card grids; heads sentence case, horizontal rules only.

## States
Every region that loads data draws four states: `<LoadingSkeleton>` in the shape of what is coming, `<EmptyState>` (what is empty, why it matters, one action), `<ErrorState>` ("That's on us, not you." with Retry and Use demo data) and the full state. Seeded data carries `<DemoDataNote>`.

## Voice
Plain, kind second person, present tense: "You're 38% of the way there. Here's this week." Say *peer learning*, never *networking*. No eyebrows, no tracked capitals, no middle-dot meta strings, no emoji as icons, no arrows glued to link text.

## Motion
- Character: brisk. `--dur-micro` 120ms press, `--dur-short` 220ms hover and menus, `--dur-long` 420ms sheets. `transform` and `opacity` only; focus rings never animate; under reduced motion everything ends at once. A spinner (Loader2) is the only loop.

## Projector rules
Key numbers 32px and up; no text under 13px; text 4.5:1 on every surface and tint, icons and field edges 3:1; one primary action per screen.

## Exports
`app/tokens.css` (Tailwind v4 `@theme static` plus `:root` / `.dark`), `app/base.css` (Floor rules, base layer), shadcn mapping in `app/globals.css` `@theme inline`.
