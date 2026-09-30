# W4a — Веб-клиент (десктоп) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий десктопный веб-клиент Imprint 2.0: День + Бэклог, сайдбар, ввод, отметка, дата/группа/удаление по наведению — оптимистично, с живыми правками из других вкладок, на dev.

**Architecture:** Store держит последний серверный снимок + подтверждённые (`acked`) + ожидающие (`pending`) вызовы; вид — прогон их через `runTool` домена на `memoryContext` и проекции домена. Id новых строк выдаёт клиент (`ToolContext.newId`, заголовок `x-imprint-ids`), сервер узнаёт повтор по занятому id. React-компоненты только рендерят вид и зовут `store.run(name, input)`.

**Tech Stack:** React 19, Vite 6, TypeScript 5.9, `@radix-ui/react-popover`, `@phosphor-icons/react`, `@formkit/auto-animate`, `@fontsource` (Onest, Playfair Display), Vitest + happy-dom + Testing Library, Playwright (Chromium), Hono/Durable Objects (сервер).

**Spec:** [docs/superpowers/specs/2026-09-30-w4-web-ui-design.md](../specs/2026-09-30-w4-web-ui-design.md)

## Global Constraints

- P1: в `apps/web/src/screens` и `apps/web/src/components` — никаких импортов значений из `@imprint/domain` (только `import type`), никаких `Date`/`Intl`; время, «сегодня», быстрые даты — в `store/` через `time/` домена.
- Файлы (кроме тестов) ≤ 300 строк (eslint `max-lines`), включая `.tsx`.
- Существующие тесты не меняются и не удаляются; новые — можно. `account.ts`, `health.ts`, `probe.ts` и их тесты остаются.
- `packages/domain` чистый (`purity.test.ts`); tools не бросают.
- Не трогать `web/` и `app/`.
- Коммит на каждую задачу, `npm run check` зелёный перед коммитом; команды из `platform/`, в PowerShell — `npm.cmd`.
- e2e никогда не касается реальных данных: только localhost, свой `--persist-to` (CRIT-1).
- Движение: только сообщение о действии; всё выключено при `prefers-reduced-motion`.
- W4a — десктоп ≥ 1024 px; мобильная раскладка — W4b.

## Review Focus

1. Два быстрых действия подряд над только что созданной задачей (ввод → сразу отметка до ответа сервера) — отметка сохраняется, дублей нет (Task 7 тест «action on a pending row»).
2. Обрыв сети посреди вызова, затем повтор — на сервере одна задача, а не две; плашки об ошибке нет (Task 2 тест `replayed`, Task 7 тест «network retry»).
3. Смена логического дня при открытой вкладке (ночь, час сброса) — День пересчитывается без перезагрузки (Task 8 тест «day rollover timer»).
4. Вкладка открыта, аккаунт удалён с другого устройства — вид очищается, новая эпоха принимается (Task 7 тест «epoch change»).
5. Фильтр по группе, которую удалили в другой вкладке — адрес `/g/<id>` откатывается на `/` без пустого экрана (Task 9 тест «unknown group filter»).

---

## File Structure

```
packages/domain/src/
  tools/context.ts            + newId()
  tools/memoryContext.ts      + ids option
  compose.ts, edit.ts         newId параметром (по умолчанию uuid)
  tools/support.ts, groups.ts, steps.ts, capture.ts, tasks.ts, tasks-move.ts — ctx.newId
  tools/result.ts             + reason "replayed"
  time/quick.ts (+test)       быстрые даты чипов: tomorrow, weekend, week
  tools/new-id.test.ts        newId во всех создающих tools
apps/worker/src/
  store/ids.ts (+test в test/) разбор x-imprint-ids
  store/sqlStore.ts           execute(..., ids) + replay; epoch
  userStore.ts, api/routes.ts заголовок → callTool
apps/web/
  vite.config.ts              прокси из IMPRINT_API
  vitest.config.ts            happy-dom для *.dom.test.tsx
  playwright.config.ts, e2e/  e2e
  src/platform/api.ts, live.ts
  src/store/types.ts, sandbox.ts, view.ts, queue.ts, store.ts, cache.ts, hooks.ts, look.ts
  src/app/main.tsx, App.tsx, router.ts, theme.ts, groupColors.ts
  src/i18n/index.ts, ru.ts, en.ts
  src/styles/tokens.css, base.css, fonts.ts
  src/screens/DayScreen.tsx, MetaStub.tsx, LoginScreen.tsx
  src/components/Shell, Sidebar, NewGroupField, DayColumn, BacklogColumn, ScrollList, TaskRow,
                 Checkbox, RowActions, GroupPicker, GroupIcon, DateButton, Composer, Toasts, Popover
```

---

### Task 1: Домен — id выдаёт вызывающий

**Files:**
- Modify: `packages/domain/src/tools/context.ts`, `tools/memoryContext.ts`, `compose.ts`, `edit.ts`, `tools/support.ts`, `tools/groups.ts`, `tools/steps.ts`, `tools/capture.ts`, `tools/tasks.ts`, `tools/tasks-move.ts`, `tools/result.ts`
- Create: `packages/domain/src/tools/new-id.test.ts`, `platform/docs/adr/011-caller-ids.md`

**Interfaces:**
- Produces: `ToolContext.newId(): string`; `memoryContext({ ids?: () => string })`; `buildContribution(input, deviceId, now?, todayKey?, newId?)`; `doneEvent(task, done, deviceId, now?, todayKey?, newId?)`; `Reason` включает `"replayed"`.

- [ ] **Step 1: Failing test** — `tools/new-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { memoryContext } from "./memoryContext";
import { runTool } from "./index";

/** Every id a tool creates comes from ctx.newId (ADR 011) — rows and events. */
function feed() {
  let n = 0;
  const handed: string[] = [];
  return { handed, ids: () => { const id = `id-${++n}`; handed.push(id); return id; } };
}

describe("newId", () => {
  it("capture_task: task and CREATED event take the caller's ids", () => {
    const f = feed();
    const ctx = memoryContext({ ids: f.ids, todayKey: "2026-09-30" });
    const r = runTool(ctx, "capture_task", { title: "Milk", view: "day" });
    expect(r).toMatchObject({ ok: true, task: { id: "id-1" } });
    expect(ctx.draft.events.map((e) => e.id)).toEqual(["id-2"]);
  });

  it("create_group, add_steps, set_done, delete_task, move_task use ctx.newId", () => {
    const f = feed();
    const ctx = memoryContext({ ids: f.ids, todayKey: "2026-09-30" });
    runTool(ctx, "create_group", { name: "Home" });
    const task = runTool(ctx, "capture_task", { title: "Pack", view: "day" });
    const taskId = (task as { task: { id: string } }).task.id;
    runTool(ctx, "add_steps", { taskId, steps: ["a", "b"] });
    runTool(ctx, "set_done", { taskId, done: true });
    runTool(ctx, "move_task", { taskId: taskId, to: "backlog" });
    runTool(ctx, "delete_task", { taskId });
    const all = [...ctx.draft.tasks, ...ctx.draft.groups, ...ctx.draft.events].map((r) => r.id);
    expect(all.every((id) => id.startsWith("id-"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it("default memoryContext still hands out UUIDs", () => {
    const ctx = memoryContext();
    expect(ctx.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 2:** `npm run test -w @imprint/domain -- new-id` → FAIL (`ids` не опция / id — UUID).
- [ ] **Step 3: Implement.**
  - `context.ts`: добавить в `ToolContext`
    ```ts
    /** A fresh row/event id. The caller may supply them (ADR 011) so a preview and the server agree. */
    newId(): string;
    ```
  - `memoryContext.ts`: `MemoryOptions.ids?: () => string` (doc: «Id source; default `uuid`»); в возвращаемом объекте `newId: opts.ids ?? uuid` (импорт `uuid` из `../compose`).
  - `compose.ts`: `buildContribution(input, deviceId, now = Date.now(), todayKey = todayDayKey(), newId: () => string = uuid)`; `id: newId()` для задачи, затем для события (порядок: сначала задача, потом событие).
  - `edit.ts`: `doneEvent(task, done, deviceId, now = Date.now(), todayKey = todayDayKey(), newId: () => string = uuid)`; `id: newId()`.
  - `support.ts` `taskEvent`: `id: ctx.newId()`; убрать импорт `uuid`, если больше не нужен.
  - `groups.ts` `newGroup`: `id: ctx.newId()`.
  - `steps.ts`: `id: ctx.newId()`; `syncParent` → `doneEvent(parent, allDone, ctx.deviceId, now, today, ctx.newId)`.
  - `capture.ts`, `tasks.ts` (`add_task`, `set_done`), `tasks-move.ts` (оба `doneEvent`): передать `ctx.newId` последним аргументом.
  - `result.ts` `Reason`: добавить
    ```ts
    /** The server saw this call before (one of its x-imprint-ids exists): nothing ran again (ADR 011). */
    | "replayed"
    ```
  - `apps/worker/src/store/sqlStore.ts` `context()`: временно `newId: () => crypto.randomUUID()` (Task 2 заменит), чтобы typecheck был зелёным.
- [ ] **Step 4:** `npm run test -w @imprint/domain` → PASS (все старые тесты тоже); `npm run typecheck` → PASS.
- [ ] **Step 5: ADR 011** `platform/docs/adr/011-caller-ids.md` по шаблону `000-template.md`: контекст (оптимистичный прогон и сервер дают разные id → перемонтирование, `not_found` на действии по свежей строке, дубль при повторе); решение (`ToolContext.newId`, браузер шлёт id прогона в `x-imprint-ids`, сервер раздаёт их по порядку, занятый id = повтор → `replayed`); последствия (id совпадают, пока состояния совпадают; при расхождении серверный снимок заменяет вид; `delete_group` единственный неидемпотентный — store принимает отказ сетевого повтора молча).
- [ ] **Step 6: Commit** `domain: ids come from the caller (ToolContext.newId, ADR 011)`.

---

### Task 2: Домен — быстрые даты чипов

**Files:**
- Create: `packages/domain/src/time/quick.ts`, `packages/domain/src/time/quick.test.ts`
- Modify: `packages/domain/src/time/index.ts`

**Interfaces:**
- Produces: `type QuickDate = "tomorrow" | "weekend" | "week"`; `quickDate(kind: QuickDate, today: string): string`; `quickDates(today): Record<QuickDate, string>`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from "vitest";
import { quickDate, quickDates } from "./quick";

// 2026-09-28 is a Monday.
describe("quickDate (v1 DueDates, SPEC §6.3)", () => {
  it("tomorrow and +7 days", () => {
    expect(quickDate("tomorrow", "2026-09-28")).toBe("2026-09-29");
    expect(quickDate("week", "2026-09-28")).toBe("2026-10-05");
  });
  it("weekend: Mon–Fri → this Saturday, Sat → Sunday, Sun → next Saturday", () => {
    expect(quickDate("weekend", "2026-09-28")).toBe("2026-10-03");
    expect(quickDate("weekend", "2026-10-02")).toBe("2026-10-03");
    expect(quickDate("weekend", "2026-10-03")).toBe("2026-10-04");
    expect(quickDate("weekend", "2026-10-04")).toBe("2026-10-10");
  });
  it("quickDates gives all three", () => {
    expect(quickDates("2026-09-28")).toEqual({ tomorrow: "2026-09-29", weekend: "2026-10-03", week: "2026-10-05" });
  });
});
```

- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: Implement** `time/quick.ts`:

```ts
import { addDays, weekday } from "./day";

/** The input field's date chips (UX §3; v1 `DueDates`): always strictly after today. */
export type QuickDate = "tomorrow" | "weekend" | "week";

export function quickDate(kind: QuickDate, today: string): string {
  if (kind === "tomorrow") return addDays(today, 1);
  if (kind === "week") return addDays(today, 7);
  let d = addDays(today, 1);
  // weekday(): 0 = Monday … 6 = Sunday (recurrence bit order)
  while (weekday(d) < 5) d = addDays(d, 1);
  return d;
}

export function quickDates(today: string): Record<QuickDate, string> {
  return { tomorrow: quickDate("tomorrow", today), weekend: quickDate("weekend", today), week: quickDate("week", today) };
}
```
  Перед этим проверить в `time/day.ts`, что `weekday` возвращает 0 = понедельник; если иначе — поправить условие (суббота/воскресенье) и комментарий.
  `time/index.ts`: `export * from "./quick";`
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `domain: quick dates for the input chips (tomorrow, weekend, +7)`.

---

### Task 3: Сервер — id от клиента и узнавание повтора

**Files:**
- Create: `apps/worker/src/store/ids.ts`, `apps/worker/test/ids.test.ts`, `apps/worker/test/replay.test.ts`
- Modify: `apps/worker/src/store/sqlStore.ts`, `apps/worker/src/userStore.ts`, `apps/worker/src/api/routes.ts`

**Interfaces:**
- Consumes: `ToolContext.newId`, `Reason "replayed"` (Task 1).
- Produces: `IDS_HEADER = "x-imprint-ids"`; `parseIds(raw: string | null | undefined): string[]`; `SqlStore.execute(name, input, tools = ALL_TOOLS, ids: readonly string[] = [])`; `UserStore.callTool(name, input, conn?, ids?: string[])`.

- [ ] **Step 1: Failing tests.** `test/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_IDS, parseIds } from "../src/store/ids";

const u = () => crypto.randomUUID();

describe("parseIds", () => {
  it("reads comma-separated UUIDs", () => {
    const a = u(), b = u();
    expect(parseIds(`${a}, ${b}`)).toEqual([a, b]);
  });
  it("absent, empty, malformed, duplicated or too long → none", () => {
    const a = u();
    expect(parseIds(null)).toEqual([]);
    expect(parseIds("")).toEqual([]);
    expect(parseIds(`${a},nope`)).toEqual([]);
    expect(parseIds(`${a},${a}`)).toEqual([]);
    expect(parseIds(Array.from({ length: MAX_IDS + 1 }, u).join(","))).toEqual([]);
  });
});
```

  `test/replay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SqlStore } from "../src/store/sqlStore";
import { NOON_UTC, api, freshStub, newSub, openLive, sessionCookie, withStorage } from "./helpers";

const at = { read: () => NOON_UTC };

describe("caller ids (ADR 011)", () => {
  it("rows take the ids in order", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const [t, e] = [crypto.randomUUID(), crypto.randomUUID()];
      const call = s.execute("capture_task", { title: "Milk", view: "day" }, undefined, [t, e]);
      expect(call.result).toMatchObject({ ok: true, task: { id: t } });
      expect(s.snapshot().events.map((x) => x.id)).toEqual([e]);
    }));

  it("a call whose id already exists is a replay: nothing runs, rev stays", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const ids = [crypto.randomUUID(), crypto.randomUUID()];
      s.execute("capture_task", { title: "Milk", view: "day" }, undefined, ids);
      const again = s.execute("capture_task", { title: "Milk", view: "day" }, undefined, ids);
      expect(again).toMatchObject({ result: { ok: true, changed: false, reason: "replayed" }, rev: 1, committed: false });
      expect(s.snapshot().tasks).toHaveLength(1);
    }));

  it("more calls than ids fall back to fresh UUIDs", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const t = crypto.randomUUID();
      s.execute("capture_task", { title: "Milk", view: "day" }, undefined, [t]);
      const snap = s.snapshot();
      expect(snap.tasks[0].id).toBe(t);
      expect(snap.events[0].id).not.toBe(t);
    }));

  it("POST /api/tools reads x-imprint-ids; the replay is not broadcast", async () => {
    const sub = newSub();
    const cookie = await sessionCookie(sub);
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const post = () =>
      api("/api/tools/capture_task", cookie, {
        method: "POST",
        headers: { "content-type": "application/json", "x-imprint-ids": ids.join(",") },
        body: JSON.stringify({ title: "Milk", view: "day" }),
      });
    const first = (await (await post()).json()) as { result: { task: { id: string } }; rev: number };
    expect(first.result.task.id).toBe(ids[0]);
    const second = (await (await post()).json()) as { result: { reason: string }; rev: number };
    expect(second).toMatchObject({ result: { reason: "replayed" }, rev: first.rev });
  });
});
```
  (`freshStub`, `openLive` импортированы для единообразия с соседними тестами — если не понадобятся, убрать из импорта, чтобы не падал `noUnusedLocals`.)

- [ ] **Step 2:** `npm run test -w @imprint/worker -- ids replay` → FAIL.
- [ ] **Step 3: Implement.**
  `store/ids.ts`:
  ```ts
  /** `x-imprint-ids`: the ids a tab's optimistic run handed out (ADR 011). */
  export const IDS_HEADER = "x-imprint-ids";
  export const MAX_IDS = 128;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** The listed UUIDs, or none when the header is absent or anything in it is off — the server then picks its own. */
  export function parseIds(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const ids = raw.split(",").map((s) => s.trim());
    if (ids.length > MAX_IDS || new Set(ids).size !== ids.length || !ids.every((id) => UUID.test(id))) return [];
    return ids;
  }
  ```
  `sqlStore.ts`:
  - `execute(name, input, tools = ALL_TOOLS, ids: readonly string[] = [])`: в начале
    ```ts
    if (ids.some((id) => this.tasks.has(id) || this.groups.has(id) || this.events.has(id))) {
      return { result: { ok: true, changed: false, reason: "replayed" }, rev: this.rev, committed: false };
    }
    ```
    затем `this.context(pending, [...ids])`.
  - `context(p, ids: string[])`: `newId: () => ids.shift() ?? crypto.randomUUID()`.
  `userStore.ts` `callTool(name, input, conn?, ids: string[] = [])` → `this.store.execute(name, input, undefined, ids)` (серверные tools id не берут).
  `routes.ts`: `import { IDS_HEADER, parseIds } from "../store/ids";` и передать `parseIds(c.req.header(IDS_HEADER))` четвёртым аргументом.
- [ ] **Step 4:** `npm run test -w @imprint/worker` → PASS целиком (старые тесты не меняются).
- [ ] **Step 5: Commit** `platform: x-imprint-ids — rows take the tab's ids, a known id is a replay (ADR 011)`.

---

### Task 4: Сервер — эпоха

**Files:**
- Modify: `apps/worker/src/store/sqlStore.ts`
- Create: `apps/worker/test/epoch.test.ts`

**Interfaces:**
- Produces: `StateSnapshot.epoch: string`; `SqlStore.epoch` (getter).

- [ ] **Step 1: Failing test:**

```ts
import { describe, expect, it } from "vitest";
import { SqlStore } from "../src/store/sqlStore";
import { api, newSub, sessionCookie, withStorage } from "./helpers";

describe("epoch", () => {
  it("is created once and kept across wakes", () =>
    withStorage((storage) => {
      const a = new SqlStore(storage).snapshot().epoch;
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
      expect(new SqlStore(storage).snapshot().epoch).toBe(a);
    }));

  it("changes after DELETE /api/account", async () => {
    const cookie = await sessionCookie(newSub());
    const state = async () => ((await (await api("/api/state", cookie)).json()) as { epoch: string }).epoch;
    const before = await state();
    await api("/api/account", cookie, { method: "DELETE" });
    expect(await state()).not.toBe(before);
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** в `SqlStore`: поле `private readonly epochId: string`; в конструкторе после `migrate`:
  ```ts
  // A deleted account starts again at rev 0; the epoch tells a tab that rev 0 is a new history (W2 risk).
  this.epochId = readMeta(storage.sql, "epoch") ?? (() => {
    const e = crypto.randomUUID();
    writeMeta(storage.sql, "epoch", e);
    return e;
  })();
  ```
  `StateSnapshot` + `epoch: string`; `snapshot()` отдаёт `epoch: this.epochId`. (`deleteAccount` уже сбрасывает `sqlStore`, `deleteAll` стирает `meta` — новая эпоха появится при следующей загрузке.)
- [ ] **Step 4:** `npm run test -w @imprint/worker` → PASS.
- [ ] **Step 5: Commit** `platform: state carries an epoch; a deleted account starts a new one`.

---

### Task 5: Веб — инструменты, платформа (api, live)

**Files:**
- Modify: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `platform/eslint.config.js`
- Create: `apps/web/vitest.config.ts`, `apps/web/src/platform/api.ts`, `apps/web/src/platform/api.test.ts`, `apps/web/src/platform/live.ts`, `apps/web/src/platform/live.test.ts`

**Interfaces:**
- Consumes: `fetchMe`, `liveUrl`, `parseLive`, `Me` из `src/account.ts` (как есть).
- Produces:
  ```ts
  export interface Snapshot { tasks: Task[]; groups: Group[]; events: TaskEvent[]; settings: Record<string, unknown>; rev: number; epoch: string }
  export type CallOutcome = { kind: "done"; result: ToolResult; rev: number } | { kind: "network" } | { kind: "unauthorized" };
  export type StateOutcome = { kind: "ok"; snapshot: Snapshot } | { kind: "network" } | { kind: "unauthorized" };
  export interface Api {
    me(): Promise<Me>;
    state(): Promise<StateOutcome>;
    call(name: string, input: unknown, opts: { conn: string; ids: readonly string[] }): Promise<CallOutcome>;
    logout(): Promise<void>;
  }
  export function httpApi(fetchImpl?: typeof fetch): Api;
  export interface LiveHandlers { open(): void; changed(rev: number): void; deleted(): void }
  export interface LiveOptions { socket?: (url: string) => WebSocket; wait?: (ms: number) => Promise<void> }
  export function connectLive(url: string, h: LiveHandlers, opts?: LiveOptions): { close(): void };
  ```

- [ ] **Step 1: Deps** (из `platform/`):
  ```bash
  npm.cmd install -w @imprint/web @radix-ui/react-popover @phosphor-icons/react @formkit/auto-animate @fontsource-variable/onest @fontsource/playfair-display
  npm.cmd install -D -w @imprint/web happy-dom @testing-library/react @testing-library/user-event @playwright/test vitest
  ```
- [ ] **Step 2: Config.**
  `vite.config.ts`: `const API = process.env.IMPRINT_API ?? "http://localhost:8787";` и все три прокси на `API` (`/api` с `ws: true`). Порт — `Number(process.env.IMPRINT_WEB_PORT ?? 5173)`.
  `vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  export default defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      environmentMatchGlobs: [["src/**/*.dom.test.tsx", "happy-dom"]],
    },
  });
  ```
  (если `environmentMatchGlobs` в vitest 3.2 помечен устаревшим — `// @vitest-environment happy-dom` в начале каждого `*.dom.test.tsx`.)
  `tsconfig.json`: `"include": ["src", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]`.
  `eslint.config.js`: `ignores` для max-lines — `"**/*.test.{ts,tsx}"`; новый блок P1:
  ```js
  {
    files: ["apps/web/src/screens/**/*.{ts,tsx}", "apps/web/src/components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        paths: [{ name: "@imprint/domain", allowTypeImports: true, message: "P1: rules live in the domain — go through store/." }],
        patterns: [{ group: ["date-fns*", "dayjs*", "moment*", "luxon*"], message: "P1: no date libraries in the UI." }],
      }],
      "no-restricted-globals": ["error", { name: "Date", message: "P1: time comes from store/ (domain time/)." }, { name: "Intl", message: "P1: formatting lives in store/ and i18n/." }],
    },
  },
  ```
  (плагин `@typescript-eslint` уже подключён через `tseslint.configs.recommended` для `apps/**`.)
- [ ] **Step 3: Failing tests** `platform/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { httpApi } from "./api";

const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const snap = { tasks: [], groups: [], events: [], settings: {}, rev: 3, epoch: "e1" };

describe("httpApi", () => {
  it("state: ok / 401 / network / malformed", async () => {
    expect(await httpApi(respond(200, snap)).state()).toEqual({ kind: "ok", snapshot: snap });
    expect(await httpApi(respond(401, {})).state()).toEqual({ kind: "unauthorized" });
    expect(await httpApi(async () => { throw new TypeError("offline"); }).state()).toEqual({ kind: "network" });
    expect(await httpApi(respond(200, { rev: 1 })).state()).toEqual({ kind: "network" });
  });

  it("call sends conn and ids, returns result + rev", async () => {
    let seen: RequestInit | undefined;
    const api = httpApi(async (_u, init) => { seen = init; return new Response(JSON.stringify({ result: { ok: true, changed: true }, rev: 4 })); });
    const out = await api.call("capture_task", { title: "x", view: "day" }, { conn: "c1", ids: ["a", "b"] });
    expect(out).toEqual({ kind: "done", result: { ok: true, changed: true }, rev: 4 });
    const h = new Headers(seen?.headers);
    expect(h.get("x-imprint-conn")).toBe("c1");
    expect(h.get("x-imprint-ids")).toBe("a,b");
  });

  it("call: 5xx and network → network; 401 → unauthorized; other 4xx → a failed result", async () => {
    expect((await httpApi(respond(503, {})).call("x", {}, { conn: "c", ids: [] })).kind).toBe("network");
    expect((await httpApi(respond(401, {})).call("x", {}, { conn: "c", ids: [] })).kind).toBe("unauthorized");
    expect(await httpApi(respond(413, { error: "too_large" })).call("x", {}, { conn: "c", ids: [] }))
      .toEqual({ kind: "done", result: { ok: false, error: "invalid_input", message: "too_large" }, rev: -1 });
  });
});
```

  `platform/live.test.ts` — фейковый сокет:

```ts
import { describe, expect, it } from "vitest";
import { connectLive } from "./live";

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(m: string) { this.sent.push(m); }
  close() { this.onclose?.({ code: 1000 }); }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("connectLive", () => {
  it("open → open(); push → changed(rev); 4001 → deleted() and reconnect", async () => {
    FakeSocket.all = [];
    const log: string[] = [];
    const live = connectLive("ws://x/api/live", {
      open: () => log.push("open"), changed: (r) => log.push(`rev ${r}`), deleted: () => log.push("deleted"),
    }, { socket: (u) => new FakeSocket(u) as unknown as WebSocket, wait: async () => {} });
    const s = FakeSocket.all[0];
    s.onopen?.();
    s.onmessage?.({ data: JSON.stringify({ changed: true, rev: 7 }) });
    s.onmessage?.({ data: "pong" });
    s.onclose?.({ code: 4001 });
    await tick();
    expect(log).toEqual(["open", "rev 7", "deleted"]);
    expect(FakeSocket.all).toHaveLength(2); // reconnected
    live.close();
    await tick();
    expect(FakeSocket.all).toHaveLength(2); // closed for good
  });
});
```
- [ ] **Step 4:** `npm run test -w @imprint/web` → FAIL (modules missing).
- [ ] **Step 5: Implement** `platform/api.ts`:

```ts
import type { Group, Task, TaskEvent, ToolResult } from "@imprint/domain";
import { fetchMe, type Me } from "../account";

/** The server over HTTP (W2 API). Nothing throws: every outcome is data. */
export interface Snapshot { tasks: Task[]; groups: Group[]; events: TaskEvent[]; settings: Record<string, unknown>; rev: number; epoch: string }
export type CallOutcome = { kind: "done"; result: ToolResult; rev: number } | { kind: "network" } | { kind: "unauthorized" };
export type StateOutcome = { kind: "ok"; snapshot: Snapshot } | { kind: "network" } | { kind: "unauthorized" };
export interface Api {
  me(): Promise<Me>;
  state(): Promise<StateOutcome>;
  call(name: string, input: unknown, opts: { conn: string; ids: readonly string[] }): Promise<CallOutcome>;
  logout(): Promise<void>;
}
type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const isSnapshot = (v: unknown): v is Snapshot => {
  const s = v as Partial<Snapshot> | null;
  return !!s && Array.isArray(s.tasks) && Array.isArray(s.groups) && Array.isArray(s.events) && typeof s.rev === "number" && typeof s.epoch === "string";
};

async function send(fetchImpl: FetchImpl, url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const r = await fetchImpl(url, init);
    let body: unknown = null;
    try { body = await r.json(); } catch { /* not JSON */ }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export function httpApi(fetchImpl: FetchImpl = (u, i) => fetch(u, i)): Api {
  return {
    me: () => fetchMe(fetchImpl),
    async state() {
      const { status, body } = await send(fetchImpl, "/api/state");
      if (status === 401) return { kind: "unauthorized" };
      return status === 200 && isSnapshot(body) ? { kind: "ok", snapshot: body } : { kind: "network" };
    },
    async call(name, input, { conn, ids }) {
      const headers: Record<string, string> = { "content-type": "application/json", "x-imprint-conn": conn };
      if (ids.length > 0) headers["x-imprint-ids"] = ids.join(",");
      const { status, body } = await send(fetchImpl, `/api/tools/${encodeURIComponent(name)}`, { method: "POST", headers, body: JSON.stringify(input) });
      if (status === 401) return { kind: "unauthorized" };
      if (status === 0 || status >= 500) return { kind: "network" };
      const b = body as { result?: ToolResult; rev?: number; error?: string } | null;
      if (status === 200 && b?.result && typeof b.rev === "number") return { kind: "done", result: b.result, rev: b.rev };
      return { kind: "done", result: { ok: false, error: "invalid_input", message: b?.error ?? `http ${status}` }, rev: -1 };
    },
    async logout() {
      await send(fetchImpl, "/auth/logout", { method: "POST" });
    },
  };
}
```

  `platform/live.ts`:

```ts
import { parseLive } from "../account";

/** `/api/live`: server → tab pushes; reconnects with backoff; a ping keeps idle proxies from closing it. */
export interface LiveHandlers { open(): void; changed(rev: number): void; deleted(): void }
export interface LiveOptions { socket?: (url: string) => WebSocket; wait?: (ms: number) => Promise<void> }

const ACCOUNT_DELETED = 4001;
const PING_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;

export function connectLive(url: string, h: LiveHandlers, opts: LiveOptions = {}): { close(): void } {
  const socket = opts.socket ?? ((u) => new WebSocket(u));
  const wait = opts.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let closed = false;
  let backoff = 1000;
  let ws: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    if (closed) return;
    const s = socket(url);
    ws = s;
    s.onopen = () => {
      backoff = 1000;
      ping = setInterval(() => s.send("ping"), PING_MS);
      h.open();
    };
    s.onmessage = (e) => {
      const rev = parseLive(e.data);
      if (rev !== null) h.changed(rev);
    };
    s.onclose = (e) => {
      if (ping) clearInterval(ping);
      ping = null;
      if (e.code === ACCOUNT_DELETED) h.deleted();
      if (closed) return;
      const delay = backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      void wait(delay).then(connect);
    };
  };
  connect();
  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}
```
- [ ] **Step 6:** `npm run test -w @imprint/web` → PASS; `npm run check` → PASS.
- [ ] **Step 7: Commit** `web: tooling (Radix, Phosphor, auto-animate, fonts, Playwright), P1 lint, platform api + live`.

---

### Task 6: Store — песочница и вид

**Files:**
- Create: `apps/web/src/store/sandbox.ts`, `store/view.ts`, `store/look.ts`, `store/sandbox.test.ts`, `store/view.test.ts`

**Interfaces:**
- Consumes: `Snapshot` (Task 5), домен: `memoryContext`, `runTool`, `parseSettings`, `projectDay`, `projectBacklog`, `openCountByGroup`, `liveGroups`, `compareGroups`, `withLook`, `dueKey`, `quickDates`, `uuid`.
- Produces:
  ```ts
  // sandbox.ts
  export interface Call { name: string; input: unknown; ids: string[] }
  export interface Sandbox { ctx: MemoryContext; run(name: string, input: unknown, ids?: readonly string[]): { result: ToolResult; ids: string[] } }
  export function sandbox(base: Snapshot | null, clock: () => number, calls?: readonly Call[]): Sandbox;
  // view.ts
  export type GroupRow = Group & GroupLook & { openCount: number };
  export type Row = BacklogItem & { kind: DayKind | null; dueKey: string | null };
  export interface View {
    today: string; settings: UserSettings;
    day: Row[]; backlog: { groups: { group: GroupRow; tasks: Row[] }[]; ungrouped: Row[] };
    groups: GroupRow[]; dayOpen: number; backlogOpen: number;
    quick: Record<QuickDate, string>;
  }
  export function project(ctx: ToolContext): View;
  // look.ts — values the UI may use (re-exported so components never import the domain)
  export { GROUP_COLORS, GROUP_COLOR_KEYS, GROUP_ICONS } from "@imprint/domain";
  export type { GroupColorKey, GroupIconKey } from "@imprint/domain";
  ```

- [ ] **Step 1: Failing tests** `store/sandbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";

const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e" };
const clock = () => Date.UTC(2026, 8, 30, 12);

describe("sandbox", () => {
  it("records the ids a run hands out and replays them", () => {
    const a = sandbox(base, clock);
    const first = a.run("capture_task", { title: "Milk", view: "day" });
    expect(first.ids).toHaveLength(2);
    const b = sandbox(base, clock, [{ name: "capture_task", input: { title: "Milk", view: "day" }, ids: first.ids }]);
    expect(b.ctx.state().tasks[0].id).toBe(first.ids[0]);
  });

  it("a call on a row created by an earlier replayed call works", () => {
    const a = sandbox(base, clock);
    const add = a.run("capture_task", { title: "Milk", view: "day" });
    const taskId = add.ids[0];
    const b = sandbox(base, clock, [{ name: "capture_task", input: { title: "Milk", view: "day" }, ids: add.ids }]);
    expect(b.run("set_done", { taskId, done: true }).result).toMatchObject({ ok: true, changed: true });
  });

  it("reads the user's settings (zone, reset) for today", () => {
    const s = sandbox({ ...base, settings: { timezone: "Asia/Tokyo", resetHour: 4 } }, () => Date.UTC(2026, 8, 30, 20));
    expect(s.ctx.todayKey()).toBe("2026-10-01"); // 05:00 Tokyo, after the 04:00 reset
  });
});
```

  `store/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";
import { project } from "./view";

const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e" };
const clock = () => Date.UTC(2026, 8, 28, 12); // Monday

describe("project", () => {
  it("Day, Backlog sections, group counters, quick dates", () => {
    const s = sandbox(base, clock);
    const g = s.run("create_group", { name: "Home" }).ids[0];
    s.run("capture_task", { title: "Today", view: "day" });
    s.run("capture_task", { title: "Later", view: { group: g }, date: "2026-10-02" });
    s.run("capture_task", { title: "Loose", view: "backlog" });
    const v = project(s.ctx);
    expect(v.today).toBe("2026-09-28");
    expect(v.day.map((r) => r.title)).toEqual(["Today"]);
    expect(v.backlog.groups[0]).toMatchObject({ group: { id: g, name: "Home", icon: "tag", colorKey: "amber" }, tasks: [{ title: "Later", dueKey: "2026-10-02" }] });
    expect(v.backlog.ungrouped.map((r) => r.title)).toEqual(["Loose"]);
    expect(v.groups[0].openCount).toBe(1);
    expect(v.dayOpen).toBe(1);
    expect(v.backlogOpen).toBe(2);
    expect(v.quick).toEqual({ tomorrow: "2026-09-29", weekend: "2026-10-03", week: "2026-10-05" });
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `store/sandbox.ts`:

```ts
import { memoryContext, parseSettings, runTool, uuid, type BackupData, type MemoryContext, type ToolResult } from "@imprint/domain";
import type { Snapshot } from "../platform/api";

/** A call as the queue keeps it: what ran and which ids it handed out (ADR 011). */
export interface Call { name: string; input: unknown; ids: string[] }
export interface Sandbox {
  ctx: MemoryContext;
  /** Run a tool; `ids` are handed out first (a replay), fresh UUIDs after. Returns every id it used. */
  run(name: string, input: unknown, ids?: readonly string[]): { result: ToolResult; ids: string[] };
}

const backup = (s: Snapshot): BackupData => ({ version: 1, tasks: s.tasks, groups: s.groups, events: s.events, settings: {} as BackupData["settings"] });

/** The server's last state with `calls` replayed on top — the optimistic world the UI shows (ADR 003). */
export function sandbox(base: Snapshot | null, clock: () => number, calls: readonly Call[] = []): Sandbox {
  let next: () => string = uuid;
  const ctx = memoryContext({
    peers: base ? [backup(base)] : [],
    clock,
    settings: parseSettings(base?.settings ?? {}),
    ids: () => next(),
  });
  const run: Sandbox["run"] = (name, input, given = []) => {
    const feed = [...given];
    const used: string[] = [];
    next = () => {
      const id = feed.shift() ?? uuid();
      used.push(id);
      return id;
    };
    try {
      return { result: runTool(ctx, name, input), ids: used };
    } finally {
      next = uuid;
    }
  };
  for (const c of calls) run(c.name, c.input, c.ids);
  return { ctx, run };
}
```
  (Проверить, что `uuid` экспортируется из `@imprint/domain` — `compose.ts` через `export *`; да.)
  `memoryContext` сливает `settings` поверх умолчаний с поясом хоста — передаём полный `parseSettings`, поэтому хост не влияет.

  `store/view.ts`:

```ts
import {
  compareGroups, dueKey, liveGroups, openCountByGroup, projectBacklog, projectDay, quickDates, withLook,
  type BacklogItem, type DayKind, type Group, type GroupLook, type QuickDate, type ToolContext, type UserSettings,
} from "@imprint/domain";

export type GroupRow = Group & GroupLook & { openCount: number };
export type Row = BacklogItem & { kind: DayKind | null; dueKey: string | null };
export interface View {
  today: string;
  settings: UserSettings;
  day: Row[];
  backlog: { groups: { group: GroupRow; tasks: Row[] }[]; ungrouped: Row[] };
  groups: GroupRow[];
  dayOpen: number;
  backlogOpen: number;
  quick: Record<QuickDate, string>;
}

/** Everything the screens show, from the domain's projections — the UI never sorts or filters (P1). */
export function project(ctx: ToolContext): View {
  const state = ctx.state();
  const today = ctx.todayKey();
  const settings = ctx.settings();
  const row = (t: BacklogItem, kind: DayKind | null = null): Row => ({ ...t, kind, dueKey: t.dueDate == null ? null : dueKey(t.dueDate, settings) });
  const open = openCountByGroup(state, today, settings);
  const groups = liveGroups(state).sort(compareGroups).map((g) => ({ ...withLook(g), openCount: open.get(g.id) ?? 0 }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const day = projectDay(state, today, settings).map((t) => row(t, t.kind));
  const b = projectBacklog(state, today, settings);
  const backlog = {
    groups: b.groups.map((s) => ({ group: byId.get(s.group.id) ?? { ...withLook(s.group), openCount: 0 }, tasks: s.tasks.map((t) => row(t)) })),
    ungrouped: b.ungrouped.map((t) => row(t)),
  };
  const backlogRows = [...backlog.groups.flatMap((s) => s.tasks), ...backlog.ungrouped];
  return {
    today, settings, day, backlog, groups,
    dayOpen: day.filter((t) => !t.doneToday).length,
    backlogOpen: backlogRows.filter((t) => !t.doneToday).length,
    quick: quickDates(today),
  };
}
```
  Если `projectBacklog` отдаёт пустые секции групп — оставить как есть (колонка их не рисует, Task 10). Если какой-то тип (`GroupLook`, `BacklogItem`, `DayKind`) не экспортирован из индекса домена — добавить экспорт в `packages/domain/src/index.ts`/`day/index.ts` (аддитивно).
  `store/look.ts` — ре-экспорт из Interfaces.
- [ ] **Step 4:** run → PASS; `npm run check` → PASS.
- [ ] **Step 5: Commit** `web: store sandbox (replay with the caller's ids) and the projected view`.

---

### Task 7: Store — очередь, откат, эпоха, live

**Files:**
- Create: `apps/web/src/store/store.ts`, `store/queue.ts`, `store/store.test.ts`, `store/fakeApi.ts` (тестовый помощник, импортируется только тестами)

**Interfaces:**
- Consumes: `Api`, `Snapshot`, `CallOutcome` (Task 5); `sandbox`, `Call`, `project`, `View` (Task 6).
- Produces:
  ```ts
  export type Auth = "unknown" | "in" | "out" | "down";
  export interface Toast { id: number; text: "deleted" | "groupDeleted" | "notSaved"; action?: { name: string; input: unknown } }
  export interface StoreState { auth: Auth; sub: string | null; email: string | null; view: View | null; online: boolean; toasts: Toast[]; fresh: string | null }
  export interface StoreDeps { api: Api; clock: () => number; conn: string; wait(ms: number): Promise<void>; storage: Storage | null; live: (h: LiveHandlers) => { close(): void } }
  export class Store {
    constructor(deps: StoreDeps);
    getState(): StoreState; subscribe(fn: () => void): () => void;
    start(): Promise<void>;                 // me → cache → state → live
    run(name: string, input: unknown): ToolResult;  // optimistic; returns the local result
    toast(t: Omit<Toast, "id">): void; dismiss(id: number): void; act(id: number): void; // act = run(action) + dismiss
    highlight(taskId: string): void;        // fresh = id for 1.1 s
    logout(): Promise<void>;
    refreshDay(): void;                     // re-project (day change, tab visible again)
    stop(): void;
  }
  ```
  `queue.ts`: `backoff(attempt: number): number` → 1000·2ⁿ, максимум 30 000.

- [ ] **Step 1: Test helper** `store/fakeApi.ts`:

```ts
import type { Api, CallOutcome, Snapshot, StateOutcome } from "../platform/api";

/** A scriptable server for store tests: calls wait until the test resolves them. */
export function fakeApi(snapshot: Snapshot) {
  const calls: { name: string; input: unknown; ids: readonly string[]; resolve(o: CallOutcome): void }[] = [];
  let state: StateOutcome = { kind: "ok", snapshot };
  const api: Api = {
    me: async () => ({ kind: "in", sub: "u1", email: "u1@x" }),
    state: async () => state,
    call: (name, input, { ids }) => new Promise((resolve) => calls.push({ name, input, ids, resolve })),
    logout: async () => {},
  };
  return { api, calls, setState: (s: StateOutcome) => (state = s) };
}
```
- [ ] **Step 2: Failing tests** `store/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Store } from "./store";
import { fakeApi } from "./fakeApi";

const snap = (p = {}) => ({ tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e1", ...p });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(s = snap()) {
  const f = fakeApi(s);
  let liveH: { open(): void; changed(rev: number): void; deleted(): void } | null = null;
  const store = new Store({
    api: f.api, clock: () => Date.UTC(2026, 8, 30, 12), conn: "c1", wait: async () => {}, storage: null,
    live: (h) => { liveH = h; return { close() {} }; },
  });
  return { store, f, live: () => liveH! };
}
const titles = (store: Store) => store.getState().view!.day.map((t) => t.title);

describe("Store", () => {
  it("an action shows before the server answers", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "Milk", view: "day" });
    expect(titles(store)).toEqual(["Milk"]);
    await flush();
    expect(f.calls[0]).toMatchObject({ name: "capture_task" });
    expect(f.calls[0].ids).toHaveLength(2);
  });

  it("a refusal rolls back only its own call and toasts notSaved", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "A", view: "day" });
    store.run("capture_task", { title: "B", view: "day" });
    await flush();
    f.calls[0].resolve({ kind: "done", result: { ok: false, error: "storage" }, rev: 0 });
    await flush();
    expect(titles(store)).toEqual(["B"]);
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["notSaved"]);
  });

  it("sends one call at a time, in order", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "A", view: "day" });
    store.run("capture_task", { title: "B", view: "day" });
    await flush();
    expect(f.calls).toHaveLength(1);
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(f.calls).toHaveLength(2);
    expect((f.calls[1].input as { title: string }).title).toBe("B");
  });

  it("action on a pending row: tick a task before its capture is confirmed", async () => {
    const { store, f } = setup();
    await store.start();
    const add = store.run("capture_task", { title: "Milk", view: "day" }) as { task: { id: string } };
    store.run("set_done", { taskId: add.task.id, done: true });
    expect(store.getState().view!.day[0].doneToday).toBe(true);
    await flush();
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(f.calls[1]).toMatchObject({ name: "set_done", input: { taskId: add.task.id } });
  });

  it("an acked call stays visible until the new state arrives", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "Milk", view: "day" });
    await flush();
    f.setState({ kind: "network" }); // the refetch fails for now
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(titles(store)).toEqual(["Milk"]);
  });

  it("network retry: same ids, and a refusal of the retried call is quiet", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("delete_group", { groupId: "g-x" }); // local not_found → never queued
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["notSaved"]);
    store.dismiss(store.getState().toasts[0].id);
    store.run("capture_task", { title: "Milk", view: "day" });
    await flush();
    const ids = f.calls[0].ids;
    f.calls[0].resolve({ kind: "network" });
    await flush();
    expect(store.getState().online).toBe(false);
    expect(f.calls[1].ids).toEqual(ids);
    f.calls[1].resolve({ kind: "done", result: { ok: false, error: "not_found" }, rev: 1 });
    await flush();
    expect(store.getState().toasts).toEqual([]);
    expect(store.getState().online).toBe(true);
  });

  it("push with a newer rev refetches state", async () => {
    const { store, f, live } = setup();
    await store.start();
    f.setState({ kind: "ok", snapshot: snap({ rev: 5, tasks: [{ id: "t1", title: "From B", location: "DAY", dueDate: null, startDate: null, groupId: null, isRepeating: false, recurrenceMask: 0, priority: 0, parentId: null, position: 0, createdAt: 1, enteredDayAt: 1, updatedAt: 1, deletedAt: null }] }) });
    live().changed(5);
    await flush();
    expect(titles(store)).toEqual(["From B"]);
  });

  it("epoch change: the new state replaces everything, even with a lower rev", async () => {
    const { store, f, live } = setup(snap({ rev: 9 }));
    await store.start();
    store.run("capture_task", { title: "Pending", view: "day" });
    f.setState({ kind: "ok", snapshot: snap({ rev: 0, epoch: "e2" }) });
    live().deleted();
    await flush();
    expect(titles(store)).toEqual([]);
  });

  it("first sign-in without a zone sets the browser's", async () => {
    const { store, f } = setup(snap({ settings: {} }));
    await store.start();
    await flush();
    expect(f.calls[0]).toMatchObject({ name: "set_user_settings", input: { timezone: expect.any(String) } });
  });

  it("401 anywhere → auth out", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "Milk", view: "day" });
    await flush();
    f.calls[0].resolve({ kind: "unauthorized" });
    await flush();
    expect(store.getState().auth).toBe("out");
  });
});
```
- [ ] **Step 3:** run → FAIL.
- [ ] **Step 4: Implement** `store/queue.ts`:

```ts
/** Retry delay after the n-th failed attempt (n from 0): 1 s, 2 s, 4 s … 30 s. */
export function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}
/** The «нет связи» mark waits this long, so a blip stays invisible. */
export const OFFLINE_AFTER_MS = 5000;
```

  `store/store.ts` (≤ 300 строк; если растёт — вынести `pump` в `queue.ts` как функцию над интерфейсом):

```ts
import type { ToolResult } from "@imprint/domain";
import type { Api, Snapshot } from "../platform/api";
import type { LiveHandlers } from "../platform/live";
import { readCache, writeCache } from "./cache";
import { OFFLINE_AFTER_MS, backoff } from "./queue";
import { sandbox, type Call, type Sandbox } from "./sandbox";
import { project, type View } from "./view";

export type Auth = "unknown" | "in" | "out" | "down";
export interface Toast { id: number; text: "deleted" | "groupDeleted" | "notSaved"; action?: { name: string; input: unknown } }
export interface StoreState { auth: Auth; sub: string | null; email: string | null; view: View | null; online: boolean; toasts: Toast[]; fresh: string | null }
export interface StoreDeps {
  api: Api; clock: () => number; conn: string; wait(ms: number): Promise<void>;
  storage: Storage | null; live: (h: LiveHandlers) => { close(): void };
}
interface Pending extends Call { retried: boolean }
interface Acked extends Call { rev: number }

const TOAST_MS = 5000;
const FRESH_MS = 1100;

/**
 * The page's one source of state (spec §2): the server's last snapshot, calls it confirmed but whose
 * state has not arrived yet (acked), and calls still waiting (pending). The view is all three replayed.
 */
export class Store {
  private s: StoreState = { auth: "unknown", sub: null, email: null, view: null, online: true, toasts: [], fresh: null };
  private readonly subs = new Set<() => void>();
  private base: Snapshot | null = null;
  private acked: Acked[] = [];
  private pending: Pending[] = [];
  private box: Sandbox | null = null;
  private sending = false;
  private seenRev = -1;
  private stale = false;
  private toastSeq = 0;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private live: { close(): void } | null = null;

  constructor(private readonly d: StoreDeps) {}

  getState = (): StoreState => this.s;
  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };

  async start(): Promise<void> {
    const me = await this.d.api.me();
    if (me.kind !== "in") return this.set({ auth: me.kind });
    this.set({ auth: "in", sub: me.sub, email: me.email });
    const cached = readCache(this.d.storage, me.sub);
    if (cached) this.accept(cached);
    await this.fetchState();
    this.live = this.d.live({
      open: () => void this.fetchState(),
      changed: (rev) => {
        if (rev > this.seenRev) this.requestState();
      },
      deleted: () => {
        this.pending = [];
        this.acked = [];
        void this.fetchState();
      },
    });
  }

  run(name: string, input: unknown): ToolResult {
    const box = this.box ?? this.rebuildBox();
    const { result, ids } = box.run(name, input);
    if (!result.ok) {
      this.toast({ text: "notSaved", action: { name, input } });
      this.rebuild(); // the failed run may have left writes in the sandbox
      return result;
    }
    if (!result.changed) return result;
    this.pending.push({ name, input, ids, retried: false });
    this.publish();
    void this.pump();
    return result;
  }

  toast(t: Omit<Toast, "id">): void {
    const toast = { ...t, id: ++this.toastSeq };
    this.set({ toasts: [...this.s.toasts.filter((x) => x.text !== t.text), toast] });
    setTimeout(() => this.dismiss(toast.id), TOAST_MS);
  }
  dismiss(id: number): void {
    if (this.s.toasts.some((t) => t.id === id)) this.set({ toasts: this.s.toasts.filter((t) => t.id !== id) });
  }
  act(id: number): void {
    const t = this.s.toasts.find((x) => x.id === id);
    this.dismiss(id);
    if (t?.action) this.run(t.action.name, t.action.input);
  }
  highlight(taskId: string): void {
    this.set({ fresh: taskId });
    setTimeout(() => this.s.fresh === taskId && this.set({ fresh: null }), FRESH_MS);
  }
  refreshDay(): void {
    this.rebuild();
  }
  async logout(): Promise<void> {
    await this.d.api.logout();
    this.stop();
    this.set({ auth: "out", view: null, sub: null, email: null });
  }
  stop(): void {
    this.live?.close();
    this.live = null;
  }

  // ---- server ----

  private async pump(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    let attempt = 0;
    while (this.pending.length > 0 && this.s.auth === "in") {
      const p = this.pending[0];
      const out = await this.d.api.call(p.name, p.input, { conn: this.d.conn, ids: p.ids });
      if (out.kind === "unauthorized") {
        this.set({ auth: "out" });
        break;
      }
      if (out.kind === "network") {
        p.retried = true;
        this.markOffline();
        await this.d.wait(backoff(attempt++));
        continue;
      }
      attempt = 0;
      this.markOnline();
      this.pending.shift();
      if (out.result.ok) {
        this.acked.push({ ...p, rev: out.rev });
        if (out.rev > this.seenRev) this.stale = true;
      } else {
        // A refused retry means the first attempt already landed (ADR 011): stay quiet, re-read.
        if (p.retried) this.stale = true;
        else this.toast({ text: "notSaved", action: { name: p.name, input: p.input } });
        this.rebuild();
      }
    }
    this.sending = false;
    if (this.stale && this.pending.length === 0) await this.fetchState();
  }

  private requestState(): void {
    this.stale = true;
    if (this.pending.length === 0) void this.fetchState();
  }

  private async fetchState(): Promise<void> {
    const out = await this.d.api.state();
    if (out.kind === "unauthorized") return this.set({ auth: "out" });
    if (out.kind === "network") return this.markOffline();
    this.markOnline();
    this.stale = false;
    this.accept(out.snapshot);
    if (!("timezone" in out.snapshot.settings)) {
      this.run("set_user_settings", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    }
  }

  /** Newer rev, or another epoch (the account was deleted elsewhere): the state replaces what we had. */
  private accept(next: Snapshot): void {
    const newEpoch = this.base !== null && next.epoch !== this.base.epoch;
    if (!newEpoch && this.base !== null && next.rev <= this.base.rev) return;
    if (newEpoch) {
      this.pending = [];
      this.acked = [];
    }
    this.base = next;
    this.seenRev = next.rev;
    this.acked = this.acked.filter((a) => a.rev > next.rev);
    if (this.s.sub) writeCache(this.d.storage, this.s.sub, next);
    this.rebuild();
  }

  // ---- view ----

  private rebuildBox(): Sandbox {
    this.box = sandbox(this.base, this.d.clock, [...this.acked, ...this.pending]);
    return this.box;
  }
  private rebuild(): void {
    this.rebuildBox();
    this.publish();
  }
  private publish(): void {
    if (this.box) this.set({ view: project(this.box.ctx) });
  }

  private markOffline(): void {
    if (this.offlineTimer || !this.s.online) return;
    this.offlineTimer = setTimeout(() => this.set({ online: false }), OFFLINE_AFTER_MS);
  }
  private markOnline(): void {
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
    if (!this.s.online) this.set({ online: true });
  }

  private set(patch: Partial<StoreState>): void {
    this.s = { ...this.s, ...patch };
    for (const fn of this.subs) fn();
  }
}
```
  Замечания к реализации:
  - Тест «network retry» ждёт `online=false` сразу, а `markOffline` откладывает метку на 5 с. Поэтому `OFFLINE_AFTER_MS` становится зависимостью: добавить в `StoreDeps` поле `offlineAfterMs?: number` (по умолчанию `OFFLINE_AFTER_MS`), в тестовом `setup` передать `0`, а в `markOffline` при `0` ставить метку синхронно.
  - В тесте «epoch change» при `deleted` очередь сбрасывается до ответа: у `capture_task` висит неразрешённый промис. Цикл `pump` при этом уже держит `p`. Поэтому после ответа проверять `this.pending[0] === p`, прежде чем делать `shift`, и выбрасывать ответ, если очередь сменилась.
  - `store/cache.ts` пишется в Task 8. На этом шаге завести заглушку с `readCache(): null` и `writeCache(): void`, в Task 8 заменить на полноценную.
- [ ] **Step 5:** run → PASS; `npm run check` → PASS.
- [ ] **Step 6: Commit** `web: store — optimistic queue, one call at a time, rollback, retry with the same ids, epoch, live`.

---

### Task 8: Store — кэш, смена дня, хуки

**Files:**
- Modify: `apps/web/src/store/cache.ts`, `apps/web/src/store/store.ts`
- Create: `apps/web/src/store/cache.test.ts`, `apps/web/src/store/hooks.ts`, `apps/web/src/store/day.test.ts`

**Interfaces:**
- Produces: `readCache(storage: Storage | null, sub: string): Snapshot | null`; `writeCache(storage, sub, snap)`; хуки `useStore<T>(sel: (s: StoreState) => T): T`, `useView(): View | null`, `StoreContext` (React context с `Store`); `msUntilNextDay(view: View, now: number): number` (в `store/view.ts`, через `dayStart(addDays(today, 1), settings)`).

- [ ] **Step 1: Failing tests** `cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readCache, writeCache } from "./cache";

class Mem implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
const snap = { tasks: [], groups: [], events: [], settings: {}, rev: 2, epoch: "e" };

describe("cache", () => {
  it("round-trips per user", () => {
    const s = new Mem();
    writeCache(s, "u1", snap);
    expect(readCache(s, "u1")).toEqual(snap);
    expect(readCache(s, "u2")).toBeNull();
  });
  it("garbage or no storage → null, never throws", () => {
    const s = new Mem();
    s.setItem("imprint.snapshot.u1", "{nope");
    expect(readCache(s, "u1")).toBeNull();
    expect(readCache(null, "u1")).toBeNull();
    expect(() => writeCache(null, "u1", snap)).not.toThrow();
  });
});
```
  `day.test.ts` (Review Focus 3):

```ts
import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";
import { msUntilNextDay, project } from "./view";

it("day rollover timer: ms until the user's next reset", () => {
  const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 4 }, rev: 0, epoch: "e" };
  const now = Date.UTC(2026, 8, 30, 23, 0);
  const v = project(sandbox(base, () => now).ctx);
  expect(msUntilNextDay(v, now)).toBe(5 * 3600_000); // 23:00 → 04:00
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  `cache.ts`:
  ```ts
  import type { Snapshot } from "../platform/api";
  const key = (sub: string) => `imprint.snapshot.${sub}`;
  /** The last accepted state, read-only after a reload (spec §2); anything odd reads as nothing. */
  export function readCache(storage: Storage | null, sub: string): Snapshot | null {
    try {
      const v = JSON.parse(storage?.getItem(key(sub)) ?? "null") as Partial<Snapshot> | null;
      return v && Array.isArray(v.tasks) && Array.isArray(v.groups) && Array.isArray(v.events) && typeof v.rev === "number" && typeof v.epoch === "string"
        ? (v as Snapshot) : null;
    } catch { return null; }
  }
  export function writeCache(storage: Storage | null, sub: string, snap: Snapshot): void {
    try { storage?.setItem(key(sub), JSON.stringify(snap)); } catch { /* quota, private mode */ }
  }
  ```
  `view.ts`: `export function msUntilNextDay(v: View, now: number): number { return Math.max(1000, dayStart(addDays(v.today, 1), v.settings) - now); }`.
  `store.ts`: после каждой `publish` перевести таймер `dayTimer = setTimeout(() => this.rebuild(), msUntilNextDay(view, clock()))`, прежний сбросить. В `stop` — `clearTimeout`.
  `hooks.ts`:
  ```ts
  import { createContext, useContext, useSyncExternalStore } from "react";
  import type { Store, StoreState } from "./store";
  export const StoreContext = createContext<Store | null>(null);
  export function useStoreApi(): Store {
    const s = useContext(StoreContext);
    if (!s) throw new Error("StoreContext missing");
    return s;
  }
  export function useStore<T>(sel: (s: StoreState) => T): T {
    const store = useStoreApi();
    return useSyncExternalStore(store.subscribe, () => sel(store.getState()));
  }
  export const useView = () => useStore((s) => s.view);
  ```
- [ ] **Step 4:** run → PASS; `npm run check` → PASS.
- [ ] **Step 5: Commit** `web: read cache, logical-day timer, store hooks`.

---

### Task 9: Каркас — вход, роутер, темы, шрифты, i18n, оболочка

**Files:**
- Create: `apps/web/src/app/main.tsx`, `app/App.tsx`, `app/router.ts`, `app/router.test.ts`, `app/theme.ts`, `app/groupColors.ts`, `i18n/index.ts`, `i18n/ru.ts`, `i18n/en.ts`, `styles/tokens.css`, `styles/base.css`, `styles/fonts.ts`, `screens/LoginScreen.tsx`, `screens/MetaStub.tsx`, `screens/DayScreen.tsx` (пока колонки-заглушки), `components/Shell.tsx`, `components/Shell.module.css`
- Modify: `apps/web/index.html` (entry → `/src/app/main.tsx`), удалить `src/main.tsx` и `src/App.tsx` (у них нет тестов)

**Interfaces:**
- Produces:
  ```ts
  // router.ts
  export type Route = { screen: "day"; filter: "all" | string } | { screen: "history" } | { screen: "settings" };
  export function parseRoute(path: string): Route;
  export function routePath(r: Route): string;
  export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void];
  export const FILTER_KEY = "imprint.filter";
  // i18n
  export type Lang = "ru" | "en";
  export function useT(): Strings; // Strings = typeof ru
  ```

- [ ] **Step 1: Failing test** `app/router.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./router";

describe("routes (UX §2)", () => {
  it.each([
    ["/", { screen: "day", filter: "all" }],
    ["/g/abc", { screen: "day", filter: "abc" }],
    ["/history", { screen: "history" }],
    ["/settings", { screen: "settings" }],
    ["/nope", { screen: "day", filter: "all" }],
  ])("%s", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
    if (path !== "/nope") expect(routePath(route as never)).toBe(path);
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `router.ts`: `parseRoute`/`routePath` по таблице; `useRoute` — `useSyncExternalStore` на `popstate` + собственное событие; навигация `history.pushState` (или `replaceState`); при `screen: "day"` пишет фильтр в `localStorage[FILTER_KEY]` (try/catch).
  - `App.tsx`:
    - создаёт `Store` один раз (`useState(() => new Store({...}))`) с `httpApi()`, `clock: Date.now`, `conn: crypto.randomUUID()`, `wait` на `setTimeout`, `storage: localStorage`, `live: (h) => connectLive(liveUrl(location, conn), h)`; `useEffect(() => { void store.start(); return () => store.stop(); }, [])`;
    - `visibilitychange` → `store.refreshDay()`;
    - `auth === "out"` → `LoginScreen`; `"unknown"` → пустой фон мира (без спиннера); `"down"` → `LoginScreen` с тихой строкой «сервер недоступен»;
    - `route.screen === "day"`: фильтр — группа, которой нет в `view.groups` (после загрузки вида) → `navigate({ screen: "day", filter: "all" }, { replace: true })` (Review Focus 5); при первом рендере `/` и сохранённом фильтре-группе, которая есть в `view.groups`, → `replace` на `/g/<id>`;
    - `<html data-world>`: `day` для экрана День, `meta` для Истории и Настроек.
  - `theme.ts`: `data-theme` не ставится (тема по `prefers-color-scheme`); экспорт `applyWorld(world)`.
  - `groupColors.ts`: при старте вставляет `<style id="group-colors">` с `:root{--g-<key>:<light>}` и `@media (prefers-color-scheme: dark){:root{--g-<key>:<dark>}}` из `GROUP_COLORS` (через `store/look.ts`) — одно место правды палитры.
  - `styles/tokens.css`: переменные мира День (светлый по умолчанию) — `--bg #E2E6EC`, `--surf #F7F5F1`, `--ink #1E2749`, `--muted #6F7690`, `--hair #E0DCD3`, `--done #9AA0AB`, `--amber #F2922A`, `--amber-n #F0A24E`, `--soft #FBE9D4`, `--colline #CFD4DD`; тёмный День (`@media (prefers-color-scheme: dark)`): `--bg #14161C`, `--surf #1C1F27`, `--ink #ECEEF3`, `--muted #9AA1AF`, `--hair #2A2E38`, `--done #6B7180`, `--soft #3A3452`, `--colline #2A2E38`; мир Meta (`[data-world="meta"]`, всегда): `--bg #2A3255`, `--surf #343D63`, `--ink #EAECF5`, `--muted #A6ADCC`, `--hair #414A75`; сайдбар `--side #232A4B`, `--side-surf #343D63`, `--side-ink #EAECF5`, `--side-muted #A6ADCC`, `--side-lab #8088B0`; шрифты `--f-disp: "Playfair Display", Georgia, serif`, `--f-ui: "Onest Variable", "Segoe UI", system-ui, sans-serif`; радиусы `--r-row 12px`, `--r-pop 14px`; `transition: background .7s, color .7s` на `body`; `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`.
  - `styles/base.css`: `html, body, #root { height: 100%; margin: 0; overflow: hidden }`, `body { background: var(--bg); color: var(--ink); font: 400 14px/1.35 var(--f-ui); font-feature-settings: "tnum" }`, сброс кнопок как в лендинге, `:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px }`.
  - `styles/fonts.ts`: `import "@fontsource-variable/onest"; import "@fontsource/playfair-display/900.css"; import "@fontsource/playfair-display/700-italic.css";`
  - `i18n`: `ru.ts` — объект строк (`day: "День"`, `history: "История"`, `settings: "Настройки"`, `backlog: "Бэклог"`, `allTasks: "Все задачи"`, `noGroup: "Без группы"`, `newGroup: "Новая группа"`, `group: "Группа"`, `placeholder: "Что не забыть?"`, `tomorrow: "Завтра"`, `weekend: "Выходные"`, `week: "+7 дней"`, `date: "Дата"`, `delete: "Удалить"`, `deleted: "Задача удалена"`, `groupDeleted: "Группа удалена"`, `notSaved: "Не сохранилось"`, `undo: "Отменить"`, `retry: "Повторить"`, `offline: "нет связи"`, `signIn: "Войти через Google"`, `signOut: "Выйти"`, `serverDown: "сервер недоступен"`, `dayAccent: "…что важно сегодня"`, `historyAccent: "…как идут дела"`, `settingsAccent: "…под себя"`, `soon: "Скоро"`, `markDone`, `markUndone`, `months: ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"]`, `dateLabel(key)` → `"3 окт"`); `en.ts` — те же ключи (`months: ["Jan", …]`, `dateLabel` → `"Oct 3"`); `useT()` берёт язык из `view.settings.language`, до входа — из `navigator.language` (`ru*` → ru, иначе en).
  - `Shell.tsx`: сетка `grid-template-columns: 210px 1fr` внутри блока `width: clamp(960px, 62vw, 1200px); height: 100vh; margin-inline: auto`; фон по бокам — `body` (цвет мира). Слоты `sidebar`, `children`.
  - `MetaStub.tsx`: заголовок Playfair 30/34 + янтарная подпись + «Скоро».
  - `LoginScreen.tsx`: по центру логотип Imprint (Playfair 900), `<a href="/auth/login">` кнопкой-пилюлей «Войти через Google»; `?login=failed` → тихая строка.
- [ ] **Step 4:** `npm run test -w @imprint/web` → PASS; `npm run check` → PASS; `npm run dev` + браузер (preview): вход-экран на :5173 рендерится, после входа — оболочка, `/history` — мир Meta.
- [ ] **Step 5: Commit** `web: app shell — sign-in, routes, worlds and tokens, fonts, ru/en`.

---

### Task 10: Сайдбар

**Files:**
- Create: `components/Sidebar.tsx`, `Sidebar.module.css`, `components/GroupIcon.tsx`, `components/NewGroupField.tsx`, `components/Sidebar.dom.test.tsx`
- Modify: `app/App.tsx` (вставить `Sidebar` в `Shell`)

**Interfaces:**
- Consumes: `useView`, `useStore`, `useStoreApi`, `useRoute`, `useT`, `GroupRow`.
- Produces: `<GroupIcon icon={GroupIconKey} colorKey={GroupColorKey | null} size?: number />` (fill, цвет `var(--g-<key>)`, без цвета — `var(--muted)`); `<NewGroupField onCreated?(groupId: string) placeholder />` — поле, Enter → `store.run("create_group", { name })`, возвращает id из `result.group.id`, Esc/blur пустым → закрыть.

- [ ] **Step 1: Failing test** `Sidebar.dom.test.tsx` — рендер с фейковым Store (через `fakeApi` + `Store.start()`):
  - пункты «День» со счётчиком `dayOpen`, «История», «Настройки», метка «Бэклог», «Все задачи», группы с `openCount`, «+ Группа»;
  - клик по «+ Группа» → поле, ввод «Дом» + Enter → в сайдбаре появилась «Дом» (оптимистично);
  - экран подсвечен `aria-current="page"`, фильтр — `aria-pressed="true"`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** по UX §2 и стилям лендинга (`.sb`, `.it`, `.sel` с `box-shadow: inset 3px 0 0 var(--amber-n)`, `.flt`): клик по группе → `navigate({ screen: "day", filter: id })` (в том числе с Истории); «Все задачи» → `filter: "all"`. Внизу — `{t.offline}` мелко, когда `online === false`, и «Выйти» (`store.logout()`). Иконки экранов: `Sun`, `ChartBar`, `GearSix`, `Tray` из Phosphor. `GroupIcon` — статическая карта 16 ключей → компоненты Phosphor (`Tag`, `House`, `Briefcase`, `Heartbeat`, `ShoppingCart`, `BookOpen`, `Users`, `Moon`, `PawPrint`, `Car`, `Airplane`, `Barbell`, `Plant`, `Wrench`, `GraduationCap`, `Baby`), `weight="fill"`.
- [ ] **Step 4:** run → PASS; `npm run check` → PASS; проверка в превью.
- [ ] **Step 5: Commit** `web: sidebar — screens, backlog filters with counters, + group, sign-out, offline mark`.

---

### Task 11: Колонки День и Бэклог, строка в покое, отметка

**Files:**
- Create: `components/ScrollList.tsx` (+css), `components/TaskRow.tsx` (+css), `components/Checkbox.tsx` (+css), `components/DayColumn.tsx`, `components/BacklogColumn.tsx`, `components/Column.module.css`, `components/TaskRow.dom.test.tsx`
- Modify: `screens/DayScreen.tsx`

**Interfaces:**
- Consumes: `Row`, `View`, `useT().dateLabel`.
- Produces: `<TaskRow row={Row} where="day" | "backlog" actions?: ReactNode />`; `<ScrollList>` (маска краёв по `scrollTop`, класс `top`/`bottom`); `<Checkbox done label onToggle />`.

- [ ] **Step 1: Failing test** `TaskRow.dom.test.tsx`:
  - клик по кружку → `store.run("set_done", { taskId, done: !doneToday })`; клик по тексту ничего не вызывает (CMP-4);
  - в Дне у задачи с группой — иконка группы без текста; в Бэклоге — `dateLabel(dueKey)`; у повторяющейся (`isRepeating`) в Бэклоге — `↻` + дни (дни — строкой из i18n по `recurrenceMask`: форматирование маски — функция `repeatLabel(mask)` в `store/format.ts`, тестируется там же);
  - `doneToday` → класс выполненной строки (зачёркнуто).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `DayScreen`: заголовок «День» (Playfair 900 30/34) + подпись `dayAccent`; две колонки `1fr 1fr`, хайрлайн `--colline` слева у Бэклога; под заголовком Бэклога — янтарная подпись фильтра («Все задачи» или имя группы); внизу место под `Composer` (Task 12) на ширину обеих колонок.
  - `DayColumn`: `view.day` → `TaskRow where="day"`; список обёрнут `useAutoAnimate()` (FLIP: выполненная уезжает вниз).
  - `BacklogColumn`: фильтр `all` → секции `view.backlog.groups` с задачами (заголовок секции: `GroupIcon` + имя, стиль `.lbl`), затем «Без группы» (`ungrouped`), пустые секции не рисуются; фильтр-группа → только задачи этой секции.
  - `TaskRow`: разметка и стили `.row/.line/.c/.t/.rep/.date` лендинга; `data-fresh` при `fresh === row.id` → анимация `arrive` 1.1 с; `Checkbox` — кнопка с зоной 44×44 (псевдоэлемент), «pop»: `@keyframes tick { 0% { transform: scale(.82) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }` c `animation-timing-function: linear(...)`-пружиной; заливка к `--amber`, галочка `Check` Phosphor проявляется.
  - `store/format.ts` (+`format.test.ts`): `repeatLabel(mask: number, lang: Lang): string` через `isOn` домена и короткие имена дней из i18n — если нужно, i18n отдаёт массив, а функция живёт в `store/`.
- [ ] **Step 4:** run → PASS; `npm run check`; превью: строки, отметка, анимация, 1024×768 без прокрутки страницы.
- [ ] **Step 5: Commit** `web: Day and Backlog columns, task row at rest, check-off with the phone's pop`.

---

### Task 12: Ввод задачи

**Files:**
- Create: `components/Composer.tsx` (+css), `components/GroupPicker.tsx` (+css), `components/Popover.tsx` (+css), `components/DateButton.tsx` (+css), `components/Composer.dom.test.tsx`, `components/Popover.dom.test.tsx`
- Modify: `screens/DayScreen.tsx`

**Interfaces:**
- Consumes: `view.quick`, `view.today`, `view.groups`, `NewGroupField`, `GroupIcon`.
- Produces:
  - `<Popover trigger={ReactNode} open onOpenChange children align? />` — Radix `Popover.Root/Trigger/Portal/Content` с `avoidCollisions`, `collisionPadding={8}`, `sideOffset={6}`; `Content` глушит всплытие (`onPointerDown`, `onClick` → `e.stopPropagation()`); анимация появления 120 мс.
  - `<GroupPicker value={string | null | undefined} onPick(groupId: string | null) />` — «Без группы», группы (`GroupIcon` + имя, отмеченная — `.opt.on`), `NewGroupField` («Новая группа», Enter → создать и сразу `onPick(newId)`).
  - `<DateButton value={string | null} min={string} onPick(key: string | null) label children />` — прозрачный `<input type="date">` поверх иконки + `showPicker()` в `onClick` (try/catch); пустое значение → `null`.
  - `Composer` вызывает `capture_task` с `view` = `"day"` при фильтре `all`, `{ group: id }` при фильтре-группе; `groupId` из чипа (`undefined`, если чип не трогали; `null` для «Без группы»); `date` из чипа.

- [ ] **Step 1: Failing tests** `Composer.dom.test.tsx` (таблица UX §3, десктоп):
  - «Все задачи», без даты → задача в `view.day`, без группы;
  - «Все задачи» + «Завтра» → в Бэклоге, `dueKey = quick.tomorrow`;
  - фильтр «Дом», без даты → Бэклог «Дом»;
  - «Все задачи» + чип группы «Дом», без даты → День, группа «Дом»;
  - повторный клик по чипу даты снимает его; после добавления чипы сброшены, поле пустое и в фокусе;
  - пустой/пробельный ввод — `run` не вызывается;
  - `N` вне поля ввода ставит фокус; `N` в другом `input` — нет; `Esc` снимает фокус;
  - новая строка получает `fresh` (`store.highlight(result.task.id)`).
  `Popover.dom.test.tsx`: клик внутри открытого окна не вызывает `onClick` родителя строки; окно закрывается по `Esc`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** по UX §3 и `.pill/.chip/.chips/.plus` лендинга: чипы `Завтра · Выходные · +7 дней · [календарь] · [группа]`; чип календаря с выбранной датой показывает `dateLabel`; чип группы — пунктирный с `Tag` без текста, выбранный — иконка + имя. Глобальный `keydown` (`N`) — в `Composer` через `useEffect`, проверка `document.activeElement` (не `input`/`textarea`/`[contenteditable]`).
- [ ] **Step 4:** run → PASS; `npm run check`; превью.
- [ ] **Step 5: Commit** `web: input field — date and group chips, native calendar, N/Esc, new-row glow`.

---

### Task 13: Действия строки по наведению, плашки

**Files:**
- Create: `components/RowActions.tsx` (+css), `components/Toasts.tsx` (+css), `components/RowActions.dom.test.tsx`
- Modify: `components/TaskRow.tsx`, `app/App.tsx` (вставить `Toasts`)

**Interfaces:**
- Consumes: `GroupPicker`, `DateButton`, `Popover`, `store.toast/act/dismiss`.
- Produces: `<RowActions row={Row} onOpenChange(open: boolean) />`.

- [ ] **Step 1: Failing test** `RowActions.dom.test.tsx`:
  - лейбл группы: у задачи без группы — пунктирное окошко с `+` без текста; выбор группы → `set_task_group`;
  - дата: `input[type=date]` c `min = today`; будущая дата задаче из Дня → `set_due_date`, задача исчезает из `view.day` и появляется в Бэклоге; очистка → `date: null`;
  - удалить → `delete_task`, плашка «Задача удалена · Отменить»; «Отменить» → `restore_task`, задача вернулась;
  - пока открыто окно (группа), строка держит подсветку и иконки видимыми (`data-active`).
  `Toasts`: «Не сохранилось · Повторить» повторяет вызов (`store.act`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Иконки ложатся поверх конца строки (`.acts`: absolute, градиент от прозрачного к `--surf`, `opacity 0 → 1` за 150 мс) при `:hover`/`:focus-within`/`data-active`; текст под ними `white-space: nowrap; text-overflow: ellipsis` — строка не прыгает (высота фиксируется: в покое тоже одна строка? — нет: в покое текст переносится; при наведении обрезается — как в лендинге; тест e2e «наведение не сдвигает текст» — W4b). Порядок: лейбл группы, дата, удалить (повтор и шаги — W4b). `Toasts` — внизу по центру над полем ввода, пилюля `--ink` фон / `--surf` текст, кнопка действия янтарём; 5 с.
- [ ] **Step 4:** run → PASS; `npm run check`; превью у правого края окна — окно не вылезает.
- [ ] **Step 5: Commit** `web: row actions on hover — group, native date, delete with undo; toasts`.

---

### Task 14: e2e

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/session.ts`, `apps/web/e2e/fixtures.ts`, `apps/web/e2e/input.spec.ts`, `e2e/row.spec.ts`, `e2e/groups.spec.ts`, `e2e/routes.spec.ts`, `e2e/tabs.spec.ts`, `e2e/layout.spec.ts`
- Modify: `apps/web/package.json` (`"e2e": "playwright test"`), `platform/package.json` (`"e2e": "npm run e2e -w @imprint/web"`), `.gitignore` (`test-results/`, `playwright-report/`), `.github/workflows/platform.yml` (job `e2e`: `npx playwright install --with-deps chromium` + `npm run e2e`)

**Interfaces:**
- Produces: фикстура `signedIn` — `{ page, sub, newTab(): Promise<Page> }`: свежий `sub = "e2e-" + uuid`, cookie `imprint_session` подписан `encodeSession(E2E_SECRET, { sub, email })` из `../../worker/src/auth/session` (чистый WebCrypto).

- [ ] **Step 1: Config** `playwright.config.ts`:
  ```ts
  import { defineConfig, devices } from "@playwright/test";
  export const E2E_SECRET = "e2e-session-secret";
  const WEB = "http://localhost:5174";
  if (!/^http:\/\/localhost:\d+$/.test(WEB)) throw new Error("e2e runs on localhost only (CRIT-1)");
  export default defineConfig({
    testDir: "e2e",
    use: { baseURL: WEB, ...devices["Desktop Chrome"] },
    webServer: [
      {
        command: `npx wrangler dev --port 8788 --persist-to .wrangler/e2e --var SESSION_SECRET:${E2E_SECRET} --var APP_ORIGIN:${WEB} --var GEMINI_API_KEY:`,
        cwd: "../worker", port: 8788, reuseExistingServer: false,
      },
      { command: "npx vite --port 5174 --strictPort", env: { IMPRINT_API: "http://localhost:8788" }, port: 5174, reuseExistingServer: false },
    ],
  });
  ```
  Проверить, что `--var` перекрывает `.dev.vars` (wrangler 4): если нет — `--env-file` на файл `e2e/.dev.vars.e2e` (коммитится: там только тестовые значения).
- [ ] **Step 2: Specs** (каждый тест — свой `sub`):
  - `input.spec.ts`: таблица ввода десктопа (4 случая выше) + календарь открывает `input[type=date]` (`locator('input[type=date]')` у чипа).
  - `row.spec.ts`: отметка и снятие (перезагрузка — состояние сохранилось); дата с иконки строки → задача в Бэклоге; удалить → «Отменить» → вернулась.
  - `groups.spec.ts`: «+ Группа» в сайдбаре → группа, счётчик; «Новая группа» из чипа ввода → назначена задаче.
  - `routes.spec.ts`: клик по группе → `/g/<id>`; «История» → `/history`, мир Meta; «Назад» → `/g/<id>`; перезагрузка сохраняет место; удалённая группа в адресе → `/` (Review Focus 5 — удалить группу через `request.post('/api/tools/delete_group')` с cookie).
  - `tabs.spec.ts`: два контекста с одним `sub`; добавить задачу в первом → появилась во втором без действий (`expect(...).toBeVisible({ timeout: 5000 })`).
  - `layout.spec.ts`: 1440×900, 1280×720, 1024×768 — `document.scrollingElement.scrollHeight <= innerHeight`, видны все пункты сайдбара и поле ввода; 30 задач — прокручивается список, не страница; окно выбора группы у строки у правого/нижнего края — `boundingBox` внутри вьюпорта.
- [ ] **Step 3:** `npm run e2e` (из `platform/`) → PASS; при падениях — чинить код, не тесты (новые тесты можно уточнять, существующие — нет).
- [ ] **Step 4: Commit** `web: e2e — input table, row actions, groups, routes, two tabs, layout (Playwright, signed test session)`.

---

### Task 15: Закрытие W4a

**Files:**
- Modify: `imprint2.0/W4-web-ui.md` (отметить закрытые пункты W4a), `imprint2.0/README.md` (строка W4: W4a готов), `HISTORY.md` (запись W4a с граблями), `docs/superpowers/specs/2026-09-30-w4-web-ui-design.md` (статус)

- [ ] **Step 1:** `npm run check` и `npm run e2e` → PASS (вывод приложить в отчёт).
- [ ] **Step 2:** Превью локально (`npm run dev`): скриншоты День/Бэклог в светлой и тёмной теме — пользователю.
- [ ] **Step 3:** Документы: грабли, найденные по ходу (в `HISTORY.md`), статус W4a.
- [ ] **Step 4: Commit** `docs: W4a closed`.
- [ ] **Step 5: Спросить пользователя** (внешние действия): push в `master` → CI деплоит dev; тег `web-w4a`. Ручная проверка на dev с входом через Google — вместе с пользователем.
