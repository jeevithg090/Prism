# Keystone

> Your degree is the foundation. Keystone builds the bridge to industry.

Reply "AI on Campus" · GreatUniHack 2026 (University of Manchester). A team of AI agents reads your syllabus, the live job market and the code you've written, builds one knowledge graph (the Bridge Map), and turns it into a degree-aware roadmap, a study pod with a real GitHub project, and proof of skill.

**Team docs:** start with [`docs/team/00-shared-contract.md`](docs/team/00-shared-contract.md) (the contract wins), then your own `docs/team/P<N>-*.md`.

## Run it
```bash
npm ci
cp .env.example .env.local   # set DEMO_MODE=true to run entirely from fixtures
npm run dev                  # http://localhost:3000  ·  /pods?demo=1 signs you in as Aisha
npm run typecheck && npm run lint && npm test
```

## Scaffold stubs (replace with the real thing in your PR)
These files exist so every page builds and tests today. Each keeps the exact contract signature; the owner replaces the body.

| File | Owner | Stub behaviour |
|---|---|---|
| `lib/llm.ts` | P2 | `llmJSON`/`llmText` throw `LLMError("no_key")` → callers use deterministic fallbacks; `embed` is a hashed bag-of-words |
| `lib/store.ts` | P2 | In-memory store seeded from `data/fixtures` + `data/seed` |
| `lib/agents/events.ts` | P2 | In-memory pub/sub with replay (200 per run) |
| `lib/graph/build.ts` (`loadGraph`) | P2 | Reads `data/fixtures/bridgemap.<user>.<role>.json` |
| `app/api/profile/[id]/route.ts` | P2 | Reads `profiles` from the store |
| `data/fixtures/profile.aisha.json`, `bridgemap.aisha.ml-engineer.json` | P2 | Minimal Aisha fixtures |
| `lib/cache.ts`, `lib/connectors/firecrawl.ts`, `data/skills.json` | P1 | Fixture-first `withCache`; `fcSearch` returns `[]` without a key; the 43 core skills |
| `lib/n8n.ts` | P4 | Posts to `N8N_WEBHOOK_BASE_URL/<workflow>` if set, else `false` |
| `components/keystone/index.tsx`, `components/shell/ActivityPanel.tsx`, `app/providers.tsx`, `app/(app)/layout.tsx` | P3 | Minimal shared components, `useActivity`, React Query + sonner providers |

## CI/CD (GitLab)
Pipelines run on GitLab (`.gitlab-ci.yml`), not GitHub Actions: secret scan → typecheck → lint → test → DEMO_MODE build → e2e (non-blocking) → Vercel deploy (only if `VERCEL_TOKEN` is set) → a GitHub commit status named `ci` (only if `GITHUB_STATUS_TOKEN` is set), so GitHub branch protection can require it.

Push to both remotes so every push runs CI:
```bash
git remote set-url --add --push origin https://github.com/jeevithg090/Reply_Hack.git
git remote set-url --add --push origin git@gitlab.com:gjeevith090/reply-hack.git
```

Branch protection: PRs only, 1 review + green `ci` (see contract §10).
