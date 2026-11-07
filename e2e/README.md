# End-to-end suites

Playwright 1.65 + `@axe-core/playwright`. Everything runs against a real `next start` build, no API keys needed.

| File | Project(s) | What it checks |
|---|---|---|
| `api.spec.ts` | `api` | Every route in `app/api/**`: valid input → 200 + `{ok:true}` + a body that passes the zod schema from `lib/schemas/*`; invalid input → 400 `bad_request`; unknown ids → 404 `not_found`; never a 500. Plus the full **proof loop**: match Aisha → create project → review → merge issue 0 → progress → badges (`shipped`) + momentum → evidence ids. Works in `DEMO_MODE=true` and `DEMO_MODE=false`. |
| `pods.spec.ts` | `desktop`, `mobile` | Find my pod → pod card + toast → Start our project → project view with the repo link; unknown pod → kind error; loading skeletons announced (`role="status"`) and axe-clean while the API is slow. |
| `trajectories.spec.ts` | `desktop`, `mobile` | Sankey summary caption, outcome filter chips (`aria-pressed`), list view, Ask for 15 minutes → drafted message → Send → toast. |
| `community.spec.ts` | `desktop`, `mobile` | I can help → "Thank you! +3 momentum" and the card leaves the feed; empty / whitespace ask is blocked; a real ask appears as yours; opt-in Helpers this week; Find guides (or the friendly 3-a-day limit). |
| `lecturer.spec.ts` | `desktop`, `mobile` | Stat cards, gaps chart summary + screen-reader table, Copy to module plan → clipboard + toast; a programme under 10 students shows nothing; loading states. |
| `pages.spec.ts` | `desktop`, `mobile` | Every page loads: 200, an h1, axe clean, no console errors. Pages still being built (`/dashboard`, `/onboard`, `/map`, `/roadmap`, `/market`, `/interview`, `/launch`, `/challenge`, `/profile/aisha`, `/coach`, `/governance`) **skip automatically while they 404** and start running the moment they land. |

Every UI test ends with `expectNoA11yViolations(page)` (serious/critical axe rules, after entrance animations settle) and
`watchPage(page).assertClean()`, which fails on console errors, page errors, failed requests, any 5xx, and any 4xx from
`/api/*`. Allowed: 404s from `/api/profile/<id>` (seniors without a profile; the UI falls back to their name) and
`/api/agents/stream` **only while that route is missing from the build** (Next's HTML 404).

## Run

```bash
# Everything: Playwright builds the app and starts it on E2E_PORT (default 3000) with DEMO_MODE=true.
npx playwright install chromium          # once
E2E_PORT=3105 npx playwright test

# Against a server you started yourself (faster when iterating):
DEMO_MODE=true npx next build
DEMO_MODE=true GITHUB_WEBHOOK_SECRET=e2e-webhook-secret npx next start -p 3100 &
E2E_BASE_URL=http://localhost:3100 npx playwright test
E2E_BASE_URL=http://localhost:3100 npx playwright test --project=mobile e2e/community.spec.ts

# The API suite with no demo data and no keys (every route must use its deterministic fallback):
DEMO_MODE=false GITHUB_WEBHOOK_SECRET=e2e-webhook-secret npx next start -p 3101 &
E2E_BASE_URL=http://localhost:3101 npx playwright test --project=api
```

- `DEMO_MODE` is read at request time by the API routes, so one build serves both modes.
- The webhook test signs payloads with `GITHUB_WEBHOOK_SECRET` (default `e2e-webhook-secret`); the server must use the
  same value, or that one test skips with a note.
- State lives in the server's memory. The specs create their own help requests and never depend on (or use up) the
  seeded feed, so re-running against the same server is fine. Guide drafts are limited to 3 per user per day: the API
  test picks a user with quota left, and the UI test accepts the friendly limit message on a reused server.
- Reports: `test-results/` (traces on failure). `npx playwright show-trace <trace.zip>` to debug.

## Adding a page

Add its route to `BUILT` in `pages.spec.ts` (or leave it in `COMING` until it ships), then write a journey spec that
starts with `const watch = watchPage(page)` and ends with `await expectNoA11yViolations(page); watch.assertClean(testInfo);`.
