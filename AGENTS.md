<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI work

Before any UI work, read `DESIGN.md` and use the `keystone-ui` skill (`.claude/skills/keystone-ui/SKILL.md`).
UI is done only when `npm run ui-gate -- --base <your dev URL> /your-route` prints `UI-GATE: PASS` and you have looked at the screenshots in `.ui-gate/`.
