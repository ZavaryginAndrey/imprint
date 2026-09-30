# Imprint platform — working notes for Claude

Imprint 2.0 web platform (npm workspace). Spec:
[../docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md](../docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md);
phases: [../imprint2.0/README.md](../imprint2.0/README.md); ADRs: [docs/adr/](docs/adr/).

## Rules
- **P1:** product rules live only in `packages/domain`. `apps/*` route, store and render — no date,
  recurrence, completion or placement logic.
- **Time (P5):** "today" and dates come only from `packages/domain/src/time/` with the user's `UserSettings`
  (zone, reset). Never `new Date()` getters or `startOfDayMillis` in tools; the Day is a projection (ADR 007).
- `packages/domain` stays pure: no DOM, Node, Cloudflare or React (`purity.test.ts` enforces it).
- Tool results are data (`ToolResult`), never exceptions; new tools follow `tools/define.ts`.
- Non-test files ≤ 300 lines (eslint `max-lines`).
- Never modify or delete existing tests without asking; new tests are fine.
- Never touch `web/` (frozen) or `app/` from platform work.
- User data is reached only through `requireSession` → `idFromName(session.sub)`; never add an
  unauthenticated `/api/*` route. Tool calls go through `SqlStore.execute` (one transaction + `rev`).
- Worker tests: `isolatedStorage` is off — every test uses fresh ids (`newSub()`, `freshStub()`).
  Secrets live in wrangler secrets / `.dev.vars` (gitignored); tests use the fake bindings in `vitest.config.ts`.
- Knowledge base: [../docs/knowledge/](../docs/knowledge/) — check 02-BUGS-AND-TRAPS before UI or time code.

## Commands (from `platform/`)
`npm run check` · `npm run dev` (worker + web) · `npm run dev -w @imprint/worker` · `npm run dev -w @imprint/web` · `npm run deploy:dev`.
On Windows PowerShell use `npm.cmd`.
