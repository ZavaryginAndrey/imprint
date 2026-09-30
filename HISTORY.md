# HISTORY — Imprint 2.0

Archive of closed web-platform phases (W1…) and the rakes stepped on. Phase map: [imprint2.0/README.md](imprint2.0/README.md).
The Android v1 history stays with the v1 code (not in this repository).

---
## W4b — Web client, full UX (closed 2026-09-30; tag `web-w4` pending the owner's check and dev deploy)

The desktop client of W4a becomes the whole UX: phone layout, drag, repeat, steps, right-click edits, token
contrast ([phase file](imprint2.0/W4-web-ui.md) · [spec](docs/superpowers/specs/2026-09-30-w4-web-ui-design.md) ·
[plan](docs/superpowers/plans/2026-09-30-w4b-web-full-ux.md)). Plan decisions 1-8 and controller rulings C1-C13
are listed in the phase file together with the open tails and the owner's questions.

### What was built
- **Store:** `ask()` for server-side tools («Подсказать шаги»), weekday helpers (`repeatDays`, `activeDays`,
  `toggledDays`) and done-step counters on the row view in `store/`; W4b strings in ru/en.
- **Layout context + windows:** desktop >= 1024 px vs mobile; a bottom sheet (Radix Dialog) for mobile, a popover
  at a point for desktop right click; `usePressMenu` turns a long tap / right click / menu key into one gesture.
- **Row editing:** repeat chips (window stays open), steps window (tick, add, suggest, split), task title and
  group editor saved as you type (300 ms), delete-group with undo; the editor closes when its group is gone.
- **Drag (dnd-kit):** tasks between Day and Backlog (`move_task`, the domain decides the rest), groups in the
  sidebar (`reorder_groups`); dashed target column, dashed origin row, lifted copy.
- **Phone:** top bar with the menu button and a drawer sidebar, one screen at a time, `/g/all` Backlog,
  Back returns to the Day (the Day is planted under a screen), tap row with a tray of actions, one open at a
  time, long tap -> title sheet; hover effects only on desktop.
- **Tokens:** contrast test (text AA, done text 3:1, group colours 3:1); `--amber-ink`, darker `--muted`,
  `--toast-act`, `--side-muted` for the selected item's counter. A visible brand change in the light theme.
- **e2e:** 50 scenarios in all (W4a had 20): three drag rules, group order, right-click and Shift+F10 edits,
  group delete and undo, repeat, steps <-> task, windows at the edges, phone layout at 360/390 px, sheets,
  Back, toasts. `npm run check`: domain 370 (+4 skipped), web 228, worker 99 tests.

### P1 review of `apps/web/src` (criterion «no domain rules in the UI»)
The brief's grep (`.sort(`, `.filter(`, `.reduce(`, `dueDate`, `recurrenceMask`, `location ===`, `isRepeating ?`,
`Date`, `Intl`) over `components/`, `screens/`, `app/` gave 20 hits (lines); none decides a rule. What was checked and why it is allowed:
- `StepsPanel.tsx` `.filter` x4: drop empty draft fields / non-string suggestions from the server reply; the
  steps themselves go to `add_steps` as typed. No task placement or completion decided.
- `BacklogColumn.tsx` `.filter(s => s.tasks.length > 0)`: hide an empty section; `sections.find(g.id === filter)`:
  the group of the chosen filter, by id. The sections and their order come from `View`.
- `TaskRow.tsx`: `row.isRepeating` chooses a caption and an icon; `repeatDays(mask)` is `store/format.ts`
  (domain `isOn`), the UI only maps day numbers to i18n names. `row.doneToday` is read, not computed.
- `RowActions.tsx`, `Composer.tsx`, `DateButton.tsx` (`DateButton`, `setDate`, `Date` in identifiers): the
  native calendar; `min` is `view.today`, which the domain computes. Quick chips (Today, Tomorrow...) stay as a kind
  and resolve through `view.quick` at Enter; the UI never computes a date.
- `app/createStore.ts` `Date.now()`: the store's injected clock at the wiring point (the eslint ban on `Date`
  covers `screens/` and `components/`; the store and the domain take the clock as a parameter).
- `GroupFilters.tsx` `groups.find`, `useRouteGuards.ts` `groups.some`: an id lookup for the editor and for the
  «filter of a deleted group -> All» fallback; no rule.
- `drag.ts` `reordered`: the user's gesture (new order of ids for `reorder_groups`); `dropCall` maps the drop
  target to `move_task` and only forwards `filterGroupId`; the three placement rules are `move_task`'s.
- `RepeatPicker.tsx` `on.includes(d)`, `store/format.ts` `toggledDays`: which chips look pressed and the days after
  a click - the request for `set_repeating`; what repeating means stays in the domain.
- `StepsPanel`, `MobileRow`, `Checkbox`: no completion logic; taps call `set_done`, `move_to_day`, `move_to_backlog`.
- Imports from `@imprint/domain` in `screens/` and `components/` are `import type` only (one: `ToolResult`).
Result: nothing to move into `store/`; the criterion is met.

### Rakes
- **Ghost click after a sheet.** The scrim closes on `click`, not on `pointerdown` (also the drawer): closing on
  pointerdown lets the click that follows land on the row underneath and collapse it. The e2e tap has to land over
  the open row's area to prove it (the first version tapped the top bar and proved nothing).
- **dnd-kit's visible live region.** Each `DndContext` adds a `role="status"` announcer, which broke
  `getByRole("status")` for toasts; both contexts now get a hidden `aria-hidden` container.
- **A portaled popover's pointerdown bubbles through React to the draggable row** and starts a drag from inside
  the window; `canStartDrag` requires the target to be inside `[data-row]` in the DOM.
- **A second finger orphaned the long-tap timer, and a lost touch left a stale pointer id**; a long tap with no
  following click left the «fired» flag set. `usePressMenu` ignores non-primary pointers, cancels on a new
  press and heals the id set on a primary pointerdown.
- **Radix aria-hides everything behind a modal:** role locators match nothing behind an open sheet - e2e looks
  inside the dialog or uses data attributes for the rest.
- **`plantDay` (Day under a screen) once per load vs a rotation, and a duplicate Day on reload:** once per load
  broke the invariant after a desktop period; per mount duplicated the entry on reload -> a marker in
  `history.state`.
- **Toasts under scrims:** with toasts below the sheet/drawer scrim, «Отменить» after deleting a group from the
  drawer was dimmed and untappable; toasts now sit above overlays (z 50), at the cost of covering a sheet's lower part.
- **Amber text contrast:** the amber (`#f0a24e` family) is fine for borders and fills but 1.9-2.2:1 as text on
  the light background -> `--amber-ink`; the toast action had the same trouble (1.8:1) -> `--toast-act`.
- **`:hover` on phones:** a hover rule outside the desktop media query jumps the open row (and sticks after a
  tap); every hover effect is under `@media (min-width: 1024px)`, including Composer, Toasts, Login.
- **A press on a control inside a row is not a long tap on the row:** a 500 ms hold on the circle or a tray icon
  opened the title sheet and ate the click; the row's press handlers skip buttons and the tray.
- **Playwright 1.63's Chromium cannot be downloaded in the cloud container:** the browser directory is a symlink
  to the preinstalled build outside the repository; the lockfile lost ~20 `libc` entries there (npm 10.9.7) -
  regenerate with the owner's npm.

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
