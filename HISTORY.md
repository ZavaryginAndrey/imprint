# HISTORY — Imprint 2.0

Archive of closed web-platform phases (W1…) and the rakes stepped on. Phase map: [imprint2.0/README.md](imprint2.0/README.md).
The Android v1 history stays with the v1 code (not in this repository).

---
## W4a — Web client, desktop (closed 2026-09-30, tag `web-w4a`)

The real web client replaces the W2 probe: Day + Backlog, sidebar, input, check-off, hover actions —
optimistic and live across tabs ([phase file](imprint2.0/W4-web-ui.md) ·
[spec](docs/superpowers/specs/2026-09-30-w4-web-ui-design.md) · [plan](docs/superpowers/plans/2026-09-30-w4a-web-client.md)).
W4b (mobile, drag, repeat, steps, right-click edits, all UX §8 e2e) follows on the same spec.

### What was built
- **Ids from the caller** (ADR 011): `ToolContext.newId`; the tab sends its preview ids in `x-imprint-ids`;
  a known id means a retry → `replayed`, nothing runs twice. **Epoch** in `GET /api/state`.
- **Store:** server snapshot + acked + pending calls replayed through the domain (`sandbox` → `project`);
  one call at a time, rollback of only the refused call, retry with the same ids, epoch reset, live
  socket with backoff, read cache per user, logical-day timer, `beforeunload` while calls wait.
- **UI (React, CSS modules, Radix popover, Phosphor, auto-animate, self-hosted Onest + Playfair):** sign-in,
  routes `/`, `/g/<id>`, `/history`, `/settings` (Meta stubs), sidebar with counters and «+ Группа»,
  columns with group sections, input with date/group chips and the native calendar, `N`/`Esc`, the pop
  check-off, hover group/date/delete with undo, toasts. P1 enforced by eslint in `screens/`/`components/`.
- **e2e:** Playwright against a local worker + Vite on their own ports and storage; sign-in is a signed test
  cookie. 20 scenarios (input table, rows, groups, routes, two tabs, layout at 3 sizes, popover at edges).

### Rakes
- Importing worker source into the web `tsc` fails on DOM vs WebWorker `BufferSource` types — e2e signs
  its session cookie itself (format documented in `e2e/session.ts`).
- happy-dom runs Web Animations and cancels them on teardown → unhandled `AbortError`; list motion is off in tests.
- An action before the first state arrives acts on an empty world: the Day screen renders nothing until
  the view exists (no spinner), and quick date chips resolve at Enter, not at click.
- A filter reached by address (not by click) was not remembered — remember whatever filter is shown.
- Reloading right after an action lost the unsent call → `beforeunload` + `html[data-pending]` for e2e.
- A long-running Vite dev server can keep a stale module after an export is added (`X is not defined`):
  restart it before trusting a blank page.
- `isTimeZone` accepted offsets and any case; aliases stay accepted — engines canonicalise them differently.

---

## W3 — Domain 2.0 (closed 2026-09-29, tag `web-w3`)

The server computes the Day itself, and every UX §3–§5 rule is a tool
([phase file](imprint2.0/W3-domain.md) · [spec](docs/superpowers/specs/2026-09-29-w3-domain-design.md) ·
plans [W3a](docs/superpowers/plans/2026-09-29-w3a-day-projection.md), [W3b](docs/superpowers/plans/2026-09-29-w3b-ux-delta.md)).

### What was built
- **W3a — the Day as a projection** (ADR 007): `UserSettings` + `time/` (logical day in an explicit zone);
  `projectDay`/`projectBacklog`/`locate` from rows + journal; "completed" computed; journal tail beyond the
  35-day window; v1 domain tests ported; «three days of life» in two zones.
- **W3b — the UX delta:** group colour keys and icons (migration 3, `color` derived, contrast ≥ 3:1);
  `create_group` next colour, `set_group_color`/`set_group_icon`, delete with detach + `restore_group`,
  `reorder_groups`, `openCount`; `capture_task` (UX §3), `move_task` (UX §4), `set_due_date` future date
  leaves the Day; steps as a checklist (`add_steps`, `syncParent`, ADR 008); `suggest_steps` as a worker
  server tool with Gemini and a daily quota (ADR 009); ADR 010.

### Rakes
- Locale order is not v1 order: journal ties and group names compare by code unit (ADR 007).
- Turning repeat off after an earlier `DONE` needs a compensating `UNDONE`, or the task reads "completed".
- `dueKey` survives a zone change only while the offset moves < 12 h — normalise dates on zone change (W4).
- A new required field on a v1 contract type breaks v1 snapshots and every row literal: 2.0 fields are
  optional and normalised on read (`groupLook`); the v1 column list stays apart (`GROUP_LOOK_COLUMNS`).
- Casting a `Wire<…>` DO RPC result straight to a narrow type fails `tsc` (TS2352/TS2589); go through `unknown`.
- vitest-pool-workers merges `.dev.vars` into test bindings via `wrangler.jsonc`: every secret the code branches on (now `GEMINI_API_KEY`) must be pinned in `vitest.config.ts` `miniflare.bindings`.
- Subagent commits pick up the model name from session reminders; the plan's `Co-Authored-By` line has to be stated as verbatim, not implied.

---

## W2 — Server hub (closed 2026-09-29, tag `web-w2`)

Tools run on the server in the user's Durable Object; Google sign-in; live «changed» to other tabs
([phase file](imprint2.0/W2-server-hub.md) · [plan](docs/superpowers/plans/2026-09-29-w2-server-hub.md)).
Executed subagent-driven: one implementer + one reviewer per task, a final whole-branch review and one
fix wave (worker tests 4 → 69).

### What was built
- **Storage** — SQLite tables `tasks`/`groups`/`events` one to one with `types.ts`, `settings` (one JSON
  row), `meta` (`schemaVersion`, `rev`); migrations by `schemaVersion` on wake, each committed with its
  version (a failing step rolls back); the W1 dev object (meta with `hello_count`) migrates cleanly.
- **`SqlStore`** — `ToolContext` over memory + a pending buffer; one `transactionSync` per call with
  `rev + 1`; throwing/failing tools and failed commits leave nothing in SQLite or memory; events loaded
  for a 35-day window; server events carry `deviceId: "server"`.
- **`UserStore`** — RPC `callTool`/`getState`/`deleteAccount`; hibernatable `/api/live` with per-tab
  `conn` tags (the writer's own socket is skipped); `deleteAll()` closes sockets with 4001.
- **Auth** — Google code + PKCE in the worker, stateless HMAC session cookie (ADR 005), `requireSession`
  on every user route, `Origin` check on mutating routes and the socket; `/api/hello` probe removed
  (its test deleted with the user's OK).
- **Web probe** — sign-in, task count + rev, live reload across tabs (W4 replaces it).
- **Live dev:** https://imprint-dev.imprint-worker.workers.dev — Google sign-in and two-tab reload
  verified both ways. Prod OAuth client and `--env prod` secrets not set yet (before the first
  `platform-v*` tag).

### Rakes
- **Local workerd uses the host time zone, not UTC** (vitest-pool-workers on Windows, UTC+2); `TZ`
  doesn't reach it. `todayKey()` builds the UTC calendar day explicitly; deployed workerd is UTC. Until
  W3a, `compose.ts` local-time helpers still follow the host zone under `wrangler dev`.
- **`SQLITE_CANTOPEN` in worker tests on Windows** with per-file runners (DO SQLite path too long) →
  `singleWorker: true`; `isolatedStorage: false` for hibernatable WebSockets, fresh ids per test.
- **workers-types RPC typing** turns results containing `unknown` into `never` → `Wire<T>` in
  `userStore.ts`; `Headers.getSetCookie()` is missing from the types (exists at runtime).
- **`*.imprint-worker.workers.dev` dev and prod are one site for SameSite** (PSL entry is
  `workers.dev`, but the account subdomain is shared) → `Origin` check on POST/DELETE, not Lax alone.
- **Google token endpoint 401 = wrong client secret** (`invalid_client`); a 400 would mean code or
  redirect URI. Found with `wrangler tail`; the callback's silent pre-checks were not the cause.
- Open for W4 (recorded in [W4-web-ui.md](imprint2.0/W4-web-ui.md) risks): `rev` restarts at 0 after
  account deletion while other devices' sessions stay valid; the live socket needs reconnect.

---

## W1 — Platform foundation (closed 2026-09-29, tag `web-w1`)

Imprint 2.0's web platform skeleton in `platform/` (npm workspace), no product features
([phase file](imprint2.0/W1-foundation.md) · [plan](docs/superpowers/plans/2026-09-28-w1-platform-foundation.md)).
Prerequisite **W0** — the web Tools layer ([plan](docs/superpowers/plans/2026-09-28-web-tools.md)): 19
zod-typed tools in `web/src/tools/` over a `ToolContext` port, `main.ts` writing only through `runTool`
(web 29 → 112 tests); executed in the same session, then `web/` frozen.

### What was built
- **`@imprint/domain`** — the W0 registry and the modules under it copied from `web/src/` byte-identical
  (checked with `diff`; 103 copied tests green, same count as in `web/`), plus `draft.ts` (the pure half
  of the web draft), an `index.ts` barrel and `purity.test.ts` (no browser/Node/Cloudflare globals).
- **`apps/worker`** — Hono + SQLite Durable Object `UserStore` (`hello()` counter + a domain tool run
  inside the object); `/health`, `/api/hello`, JSON 404 for any other `/api/*`, SPA assets otherwise.
  Tests run on the real workerd runtime (`@cloudflare/vitest-pool-workers`).
- **`apps/web`** — React 19 + Vite page: in-process domain probe + worker health ("сервер недоступен"
  on down / 500 / garbage).
- ESLint with a 300-line `max-lines` guard (`LEGACY_LARGE` stayed empty); CI workflows
  (`platform.yml`: check + dev deploy; `platform-release.yml`: prod on `platform-v*`); ADR 001–004, 006.
- **Live dev:** https://imprint-dev.imprint-worker.workers.dev — health, DO counter grows, `/api/nope`
  → 404 JSON, deep link → SPA. Not yet run: CI (no GitHub remote), Cloudflare budget alerts (Free plan).

### Rakes
- **W0 absent at W1 start** — the W1 plan's prerequisite; W0 was executed first.
- **npm workspaces:** the first `npm install -w <new-workspace> …` installed but did not write
  `dependencies` into that workspace's `package.json`; rerunning wrote them.
- **Two Vites:** vitest 3.2 hoisted Vite 7 to the root; `@vitejs/plugin-react` resolved it against the
  web app's Vite 6 → TS2769 in `vite.config.ts`. Fix: root devDependency `vite@^6.3` → one Vite 6.
- **Windows process trees:** stopping `npm run dev` leaves `wrangler`/`workerd`/`vite` children alive
  and holding the port — kill the whole tree (`taskkill /t`).
- `vitest-pool-workers` on Windows prints EBUSY temp-dir cleanup warnings; harmless (exit 0).
- npm 11 blocks install scripts (`allow-scripts`: workerd/esbuild postinstall) — everything still works.
- First deploy created the account's workers.dev subdomain (`imprint-worker`).
- A pre-groups `Draft` literal in the untouchable `compose.test.ts` forced `draftToSnapshot` to take
  `groups` as optional (defaults to `[]`) — in W0 and, verbatim, in the platform copy.

---
