# Imprint 2.0 — working notes for Claude

**Imprint** is an *external memory for tasks*, not a productivity app — the tone is narrow (ADHD patterns),
and the headline mechanism is the "imprint" banner. Success is when the user leaves.

This repository holds **Imprint 2.0**: the web platform and its design docs. The Android v1 app and the
frozen v1 web workbench live elsewhere (the owner's local repository) and are **not** here — links to
`app/`, `web/`, `PLAN.md` or `POLISH.md` in older docs point there and are expected to be broken.

## Layout

- [platform/](platform/) — the code: npm workspace (`packages/domain`, `apps/worker`, `apps/web`). Its own
  rules: [platform/CLAUDE.md](platform/CLAUDE.md) — read it before touching code.
- [imprint2.0/](imprint2.0/) — phase map ([README.md](imprint2.0/README.md)), phase files `W1…W8`, the web UX
  spec [05-web-ux.md](imprint2.0/05-web-ux.md), mockups and the landing (the reference look).
- [docs/superpowers/specs/](docs/superpowers/specs/) and [docs/superpowers/plans/](docs/superpowers/plans/) —
  design specs and implementation plans per phase.
- [docs/knowledge/](docs/knowledge/) — the knowledge base; check
  [02-BUGS-AND-TRAPS.md](docs/knowledge/02-BUGS-AND-TRAPS.md) before UI, Room-like storage or time code;
  [03-DESIGN.md](docs/knowledge/03-DESIGN.md) — palette, type, components.
- [HISTORY.md](HISTORY.md) — closed phases and the rakes stepped on.

## Current work

**W4b** — the full web UX. Plan: [docs/superpowers/plans/2026-09-30-w4b-web-full-ux.md](docs/superpowers/plans/2026-09-30-w4b-web-full-ux.md)
(spec: [2026-09-30-w4-web-ui-design.md](docs/superpowers/specs/2026-09-30-w4-web-ui-design.md)). The plan's
«Решения плана» are accepted by the owner (screenshot tests are out of W4b). Ask the owner for the execution
method (native or subagent-driven) before starting, unless the first prompt names it.

## Owner's standing rules

- **Never modify or delete existing tests without asking.** New tests (in new files) are fine.
- **Dependencies are installed only inside `platform/`:** `npm install <pkg> -w @imprint/<workspace>` from
  `platform/`. Per-workspace declaration is the accepted layout. The first `-w` install into a brand-new
  workspace may not write `dependencies` to its package.json — verify and rerun.
- Per change: implement → `npm run check` (from `platform/`) green → a separate commit. e2e: `npm run e2e`
  (localhost only, its own storage — never real data). There is no CI: these local runs are the gate.
- First run in a fresh environment: `cd platform && npm ci && npx playwright install --with-deps chromium`.
- Push, deploy (`npm run deploy:*`), tags and merges only when the owner asks.
- The owner writes in Russian; code, comments and commit messages are in English.
