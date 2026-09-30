# W2 — Server Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tools run on the server inside the user's Durable Object over SQLite, reachable over an authenticated HTTP API (Google sign-in, signed session cookie), with a hibernatable WebSocket telling the user's other tabs that something changed.

**Architecture:** `UserStore` (one DO per Google `sub`) owns a `SqlStore`: rows live in memory (loaded from SQLite when the object wakes, events only for a 35-day window) and are exposed to the domain through a `ToolContext` whose writes go to a pending buffer; after `runTool` the buffer commits in one `transactionSync` together with `meta.rev + 1`. The Hono worker is a thin router: `requireSession` middleware → `idFromName(sub)` → DO RPC (`callTool`, `getState`, `deleteAccount`) or DO `fetch` (WebSocket upgrade). Sign-in is Google OAuth authorization code + PKCE in the worker; the session is a stateless HMAC-signed cookie.

**Tech Stack:** Cloudflare Workers + SQLite Durable Objects (hibernation WebSocket API), Hono ^4.13 (`hono/cookie`, `hono/factory`, `hono/body-limit`), WebCrypto (HMAC-SHA256, SHA-256), `@cloudflare/vitest-pool-workers` ^0.8.71 (`SELF`, `env`, `runInDurableObject`), Vitest ~3.2, React 19 (dev probe only). No new npm dependencies.

**Spec:** [imprint2.0/W2-server-hub.md](../../../imprint2.0/W2-server-hub.md) · roadmap [docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md](../specs/2026-09-28-web-platform-roadmap-design.md) (sections «Вызов tool от начала до конца», «Хранилище объекта», «Время», «Вход и сессии», «Ошибки») · ADR [001](../../../platform/docs/adr/001-server-hub-durable-objects.md), [002](../../../platform/docs/adr/002-v1-rows-day-projection.md), [006](../../../platform/docs/adr/006-environments.md)

## Global Constraints

- All paths are relative to the repo root. Run platform commands from `platform/` with the Bash tool (Git Bash: `npm` works) or `npm.cmd` in PowerShell.
- **Never touch** `web/` (frozen) or `app/`. **Never stage** `PLAN.md`, `.claude/launch.json`, `app/**`, `gradle/**` (the user's uncommitted work). Commit only the exact paths each task lists.
- **Never modify or delete existing tests without asking** (user policy). The one planned deletion — the `/api/hello` test case in `platform/apps/worker/test/worker.test.ts` (Task 5, Step 7) — runs **only if the user approved it at plan review**. New test files are fine.
- **P1:** no date, recurrence, completion or placement logic in `apps/*`. The worker takes `todayDayKey`, `windowStartKey` and `monotonicClock` from `@imprint/domain`. `todayKey()` is UTC until W3a (workerd's local zone is UTC, so `todayDayKey(new Date(ms))` is UTC there).
- `packages/domain` stays pure (`purity.test.ts`). The only domain change in W2 is one re-export in `src/index.ts`.
- Tool results are data: a rule refusal or bad tool input is **HTTP 200** with the `ToolResult`. Transport problems get HTTP errors: `401 unauthorized`, `400 invalid_json`, `413 too_large`, `426 expected_websocket`, `403 forbidden_origin`, `500 auth_not_configured`.
- Tables `tasks`, `groups`, `events` — columns **one to one with `types.ts`, same camelCase names**; `settings` — one row (`id = 1`, JSON `value`); `meta` — key/value (`schemaVersion`, `rev`). Every identifier is double-quoted in SQL (`groups` is an SQLite keyword).
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`. Session cookie `imprint_session` (`Path=/`, 30 days); login cookie `imprint_oauth` (`Path=/auth`, 10 minutes).
- Secrets (`SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are **never committed**: wrangler secrets per env; `apps/worker/.dev.vars` (gitignored) locally; fake values in `vitest.config.ts` for tests. Separate Google OAuth clients for dev and prod (P8). **The user sets real secrets and signs in to Google themselves** — an agent never types credentials.
- Non-test files ≤ 300 lines (eslint `max-lines`). Stay on the Workers Free plan.
- Worker tests: `isolatedStorage: false` (hibernatable WebSockets); every test uses fresh ids (`newSub()`, `freshStub()`), never a shared name.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gate per task: `npm run check` from `platform/` is green before the commit (typecheck + lint + all tests + build).

## Review Focus

1. **A tool that writes and then fails** — throws, returns `ok:false`, or its commit hits an SQLite constraint mid-transaction. Expected: nothing in SQLite, nothing in the in-memory rows (the next call does not see phantom rows), `rev` unchanged, result `storage`. Pinned in Task 2 (`sqlStore.test.ts`: throwing tool, failing commit, fail-after-write).
2. **A forged, tampered, expired, other-secret or wrong-kind session cookie; or user A's valid session aimed at user B's task id.** Expected: 401 for the cookie cases; `not_found` and an empty state for the cross-user case. Pinned in Task 4 (`token.test.ts`) and Task 5 (`api.test.ts` «isolation»).
3. **A cross-site page opening `/api/live` with the victim's cookie** (cross-site WebSocket hijacking). Expected: 403 when `Origin` is neither the worker's origin nor `APP_ORIGIN`. Pinned in Task 5.
4. **Garbage request bodies:** invalid JSON → 400, empty body → input `{}`, body > 64 KiB → 413, unknown tool name → 200 `unknown_tool`. Pinned in Task 5.
5. **A broken or replayed OAuth callback:** mismatched `state`, a missing or expired `imprint_oauth` cookie, `?error=access_denied`, token endpoint 4xx or network failure, an ID token for another `aud`. Expected: redirect to `/?login=failed`, no session cookie, and the token endpoint is not called when `state` is wrong. Pinned in Task 6 (`auth.test.ts`).

---

## File Structure

| File | Responsibility |
|---|---|
| `platform/packages/domain/src/index.ts` (modify) | Re-export `monotonicClock` |
| `platform/apps/worker/src/store/schema.ts` | `meta` bootstrap, `MIGRATIONS`, `migrate()`, `readMeta`/`writeMeta` |
| `platform/apps/worker/src/store/rows.ts` | Column lists, row encode/decode, `writeTask`/`writeGroup`/`insertEvent`, `loadRows`, `readSettings` |
| `platform/apps/worker/src/store/sqlStore.ts` | `SqlStore`: in-memory rows, `ToolContext` with a pending buffer, atomic commit + `rev`, `snapshot()` |
| `platform/apps/worker/src/userStore.ts` (rewrite) | DO: RPC `callTool`/`getState`/`deleteAccount`, hibernatable `/live` socket, broadcast |
| `platform/apps/worker/src/auth/token.ts` | base64url, HMAC-signed tokens, `isRecord` |
| `platform/apps/worker/src/auth/session.ts` | Session cookie name/TTL/options, `encodeSession`/`decodeSession` |
| `platform/apps/worker/src/auth/google.ts` | PKCE, Google auth URL, code exchange, ID-token claims |
| `platform/apps/worker/src/auth/middleware.ts` | `requireSession` |
| `platform/apps/worker/src/auth/routes.ts` | `/auth/login`, `/auth/callback`, `/auth/logout` |
| `platform/apps/worker/src/api/routes.ts` | `/api/me`, `/api/tools/:name`, `/api/state`, `/api/live`, `/api/account` |
| `platform/apps/worker/src/app.ts` | `createApp(fetchFn)` — route table |
| `platform/apps/worker/src/index.ts` (rewrite) | `export default createApp()`, export `UserStore` |
| `platform/apps/worker/src/env.ts` (modify) | Secrets/vars in `Env`; `AppEnv` |
| `platform/apps/worker/vitest.config.ts` (modify) | `isolatedStorage: false`; fake auth bindings |
| `platform/apps/worker/test/env.d.ts` | `ProvidedEnv extends Env` |
| `platform/apps/worker/test/helpers.ts` | Fresh stubs/subs, sample rows, cookies, HTTP + WebSocket helpers |
| `platform/apps/worker/test/{rows,schema,sqlStore,userStore,token,google,api,auth}.test.ts` | Tests on workerd |
| `platform/apps/worker/.dev.vars.example`, `platform/.gitignore` (modify) | Local secrets template; ignore `.dev.vars` |
| `platform/apps/web/src/account.ts`, `account.test.ts`, `App.tsx` (modify), `vite.config.ts` (modify) | Dev probe: sign-in, task count + rev, live reload |
| `platform/docs/adr/005-auth-sessions.md` | ADR 005 |
| `platform/README.md`, `platform/CLAUDE.md` (modify) | Auth setup, new rules |
| `imprint2.0/W2-server-hub.md`, `HISTORY.md` (modify, Task 8) | Close the phase |

---

### Task 1: SQLite schema, rows and migrations

**Files:**
- Create: `platform/apps/worker/src/store/schema.ts`, `platform/apps/worker/src/store/rows.ts`
- Create: `platform/apps/worker/test/env.d.ts`, `platform/apps/worker/test/helpers.ts`
- Modify: `platform/apps/worker/vitest.config.ts`
- Test: `platform/apps/worker/test/rows.test.ts`, `platform/apps/worker/test/schema.test.ts`

**Interfaces:**
- Consumes: `Task`, `Group`, `TaskEvent` types from `@imprint/domain`.
- Produces:
  - `schema.ts`: `interface Migration { version: number; up(sql: SqlStorage): void }`, `MIGRATIONS: readonly Migration[]`, `SCHEMA_VERSION: number`, `migrate(storage: DurableObjectStorage, migrations?: readonly Migration[]): number`, `readMeta(sql: SqlStorage, key: string): string | null`, `writeMeta(sql: SqlStorage, key: string, value: string): void`.
  - `rows.ts`: `TASK_COLUMNS`, `GROUP_COLUMNS`, `EVENT_COLUMNS`, `writeTask(sql, t: Task)`, `writeGroup(sql, g: Group)`, `insertEvent(sql, e: TaskEvent)`, `interface Rows { tasks: Task[]; groups: Group[]; events: TaskEvent[] }`, `loadRows(sql, sinceDayKey: string): Rows`, `readSettings(sql): Record<string, unknown>`.
  - `test/helpers.ts`: `BASE`, `NOON_UTC`, `freshStub()`, `newSub()`, `withStorage(fn)`, `sampleTask(p?)`, `sampleGroup(p?)`, `sampleEvent(p?)`.

- [ ] **Step 1: Test plumbing — typed `env`, fresh storage, sample rows**

`platform/apps/worker/test/env.d.ts`:

```ts
import type { Env } from "../src/env";

declare module "cloudflare:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
```

`platform/apps/worker/test/helpers.ts`:

```ts
import { env, runInDurableObject } from "cloudflare:test";
import type { Group, Task, TaskEvent } from "@imprint/domain";
import type { UserStore } from "../src/userStore";

export const BASE = "https://imprint.test";
/** 2026-09-28 12:00 UTC — the pinned wall clock for store tests. */
export const NOON_UTC = Date.UTC(2026, 8, 28, 12, 0, 0);

/** Storage is shared across tests (isolatedStorage is off): every test takes fresh ids. */
export function freshStub() {
  return env.USER_STORE.get(env.USER_STORE.newUniqueId());
}

export function newSub(): string {
  return `test-${crypto.randomUUID()}`;
}

/** Run against the SQLite storage of a brand-new object. */
export async function withStorage(fn: (storage: DurableObjectStorage) => void | Promise<void>): Promise<void> {
  await runInDurableObject(freshStub(), (_instance: UserStore, state: DurableObjectState) => fn(state.storage));
}

export function sampleTask(p: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "Task", location: "BACKLOG", dueDate: null, startDate: null, groupId: null,
    isRepeating: false, recurrenceMask: 0, priority: 0, parentId: null, position: 0,
    createdAt: 1, enteredDayAt: null, updatedAt: 1, deletedAt: null, ...p,
  };
}

export function sampleGroup(p: Partial<Group> = {}): Group {
  return { id: "g1", name: "Group", position: 0, isCollapsed: false, color: 0, createdAt: 1, updatedAt: 1, deletedAt: null, ...p };
}

export function sampleEvent(p: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: "e1", taskId: "t1", type: "CREATED", at: 1, dayKey: "2026-09-28", title: "Task", groupId: null,
    isRepeating: false, surface: null, deviceId: "server", ...p,
  };
}
```

`platform/apps/worker/vitest.config.ts` — replace the file:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        // Hibernatable WebSockets don't mix with per-test storage stacks; tests use fresh ids instead.
        isolatedStorage: false,
      },
    },
  },
});
```

- [ ] **Step 2: Write the failing row tests**

`platform/apps/worker/test/rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EVENT_COLUMNS, GROUP_COLUMNS, TASK_COLUMNS, insertEvent, loadRows, readSettings, writeGroup, writeTask,
} from "../src/store/rows";
import { migrate } from "../src/store/schema";
import { sampleEvent, sampleGroup, sampleTask, withStorage } from "./helpers";

describe("rows", () => {
  it("column lists name every contract field, one to one", () => {
    expect([...TASK_COLUMNS].sort()).toEqual(Object.keys(sampleTask()).sort());
    expect([...GROUP_COLUMNS].sort()).toEqual(Object.keys(sampleGroup()).sort());
    expect([...EVENT_COLUMNS].sort()).toEqual(Object.keys(sampleEvent()).sort());
  });

  it("tasks, groups and events round-trip through SQLite exactly (booleans, nulls, reals, negatives)", () =>
    withStorage((storage) => {
      migrate(storage);
      const t = sampleTask({ isRepeating: true, dueDate: 1_790_000_000_000, groupId: "g1", position: 2.5 });
      const g = sampleGroup({ isCollapsed: true, color: -16777216 });
      const e = sampleEvent({ surface: "overlay", title: null, taskId: null });
      writeTask(storage.sql, t);
      writeGroup(storage.sql, g);
      insertEvent(storage.sql, e);
      expect(loadRows(storage.sql, "2000-01-01")).toEqual({ tasks: [t], groups: [g], events: [e] });
    }));

  it("writeTask replaces the whole row by id", () =>
    withStorage((storage) => {
      migrate(storage);
      writeTask(storage.sql, sampleTask({ title: "Old", groupId: "g1" }));
      writeTask(storage.sql, sampleTask({ title: "New", groupId: null, updatedAt: 2 }));
      expect(loadRows(storage.sql, "2000-01-01").tasks).toEqual([sampleTask({ title: "New", groupId: null, updatedAt: 2 })]);
    }));

  it("insertEvent keeps the first row for a repeated id (append-only journal)", () =>
    withStorage((storage) => {
      migrate(storage);
      insertEvent(storage.sql, sampleEvent({ type: "DONE" }));
      insertEvent(storage.sql, sampleEvent({ type: "UNDONE" }));
      expect(loadRows(storage.sql, "2000-01-01").events.map((e) => e.type)).toEqual(["DONE"]);
    }));

  it("loadRows reads events from sinceDayKey on; tasks and groups always", () =>
    withStorage((storage) => {
      migrate(storage);
      writeTask(storage.sql, sampleTask());
      insertEvent(storage.sql, sampleEvent({ id: "old", dayKey: "2026-08-01" }));
      insertEvent(storage.sql, sampleEvent({ id: "edge", dayKey: "2026-08-25" }));
      insertEvent(storage.sql, sampleEvent({ id: "new", dayKey: "2026-09-28" }));
      const rows = loadRows(storage.sql, "2026-08-25");
      expect(rows.events.map((e) => e.id).sort()).toEqual(["edge", "new"]);
      expect(rows.tasks).toHaveLength(1);
    }));

  it("readSettings is {} when empty or malformed, the stored object otherwise", () =>
    withStorage((storage) => {
      migrate(storage);
      expect(readSettings(storage.sql)).toEqual({});
      storage.sql.exec(`INSERT INTO "settings" ("id", "value") VALUES (1, 'not json')`);
      expect(readSettings(storage.sql)).toEqual({});
      storage.sql.exec(`UPDATE "settings" SET "value" = '[1,2]' WHERE "id" = 1`);
      expect(readSettings(storage.sql)).toEqual({});
      storage.sql.exec(`UPDATE "settings" SET "value" = '{"resetHour":4}' WHERE "id" = 1`);
      expect(readSettings(storage.sql)).toEqual({ resetHour: 4 });
    }));
});
```

- [ ] **Step 3: Write the failing migration tests**

`platform/apps/worker/test/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadRows, writeTask } from "../src/store/rows";
import { MIGRATIONS, SCHEMA_VERSION, migrate, readMeta, type Migration } from "../src/store/schema";
import { sampleTask, withStorage } from "./helpers";

const tables = (storage: DurableObjectStorage) =>
  storage.sql
    .exec<{ name: string }>(`SELECT "name" FROM sqlite_master WHERE "type" = 'table'`)
    .toArray()
    .map((r) => r.name);

describe("migrations", () => {
  it("a fresh object migrates to SCHEMA_VERSION with every table", () =>
    withStorage((storage) => {
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(tables(storage)).toEqual(expect.arrayContaining(["meta", "tasks", "groups", "events", "settings"]));
      expect(readMeta(storage.sql, "schemaVersion")).toBe(String(SCHEMA_VERSION));
    }));

  it("migrating again is a no-op", () =>
    withStorage((storage) => {
      migrate(storage);
      writeTask(storage.sql, sampleTask());
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(loadRows(storage.sql, "2000-01-01").tasks).toHaveLength(1);
    }));

  it("a W1 object (meta with hello_count, no schemaVersion) migrates and keeps its meta", () =>
    withStorage((storage) => {
      storage.sql.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      storage.sql.exec("INSERT INTO meta (key, value) VALUES ('hello_count', '3')");
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(readMeta(storage.sql, "hello_count")).toBe("3");
    }));

  it("a later migration runs only the missing step; old code ignores the new column (P7)", () =>
    withStorage((storage) => {
      migrate(storage);
      const t = sampleTask({ title: "Kept" });
      writeTask(storage.sql, t);
      const v2: Migration = { version: SCHEMA_VERSION + 1, up: (sql) => void sql.exec(`ALTER TABLE "tasks" ADD COLUMN "note" TEXT`) };
      expect(migrate(storage, [...MIGRATIONS, v2])).toBe(SCHEMA_VERSION + 1);
      expect(loadRows(storage.sql, "2000-01-01").tasks).toEqual([t]);
    }));

  it("a failing migration rolls back entirely and keeps the old version", () =>
    withStorage((storage) => {
      migrate(storage);
      const bad: Migration = {
        version: SCHEMA_VERSION + 1,
        up: (sql) => {
          sql.exec(`CREATE TABLE "scratch" ("x" INTEGER)`);
          throw new Error("boom");
        },
      };
      expect(() => migrate(storage, [...MIGRATIONS, bad])).toThrow("boom");
      expect(readMeta(storage.sql, "schemaVersion")).toBe(String(SCHEMA_VERSION));
      expect(tables(storage)).not.toContain("scratch");
    }));
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run (from `platform/`): `npm run test -w @imprint/worker -- rows schema`
Expected: FAIL — `Cannot find module '../src/store/rows'` / `'../src/store/schema'`.

- [ ] **Step 5: Implement `schema.ts`**

`platform/apps/worker/src/store/schema.ts`:

```ts
/**
 * The user's SQLite schema (W2 · ADR 002). `meta` is key/value (`schemaVersion`, `rev`) and predates
 * the migrations (W1 created it), so it is bootstrapped outside them. Each migration commits together
 * with its `schemaVersion`; one that throws leaves the previous version intact. Dropping a column
 * only ever happens in a separate release (DB-1).
 */

export interface Migration {
  version: number;
  up(sql: SqlStorage): void;
}

const V1: readonly string[] = [
  `CREATE TABLE "tasks" ("id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "location" TEXT NOT NULL,
    "dueDate" INTEGER, "startDate" INTEGER, "groupId" TEXT, "isRepeating" INTEGER NOT NULL,
    "recurrenceMask" INTEGER NOT NULL, "priority" INTEGER NOT NULL, "parentId" TEXT,
    "position" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL, "enteredDayAt" INTEGER,
    "updatedAt" INTEGER NOT NULL, "deletedAt" INTEGER)`,
  `CREATE TABLE "groups" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "position" INTEGER NOT NULL,
    "isCollapsed" INTEGER NOT NULL, "color" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL, "deletedAt" INTEGER)`,
  `CREATE TABLE "events" ("id" TEXT PRIMARY KEY, "taskId" TEXT, "type" TEXT NOT NULL,
    "at" INTEGER NOT NULL, "dayKey" TEXT NOT NULL, "title" TEXT, "groupId" TEXT,
    "isRepeating" INTEGER NOT NULL, "surface" TEXT, "deviceId" TEXT NOT NULL)`,
  `CREATE INDEX "events_dayKey" ON "events" ("dayKey")`,
  `CREATE TABLE "settings" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "value" TEXT NOT NULL)`,
];

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, up: (sql) => V1.forEach((statement) => sql.exec(statement)) },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function readMeta(sql: SqlStorage, key: string): string | null {
  const rows = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray();
  return rows[0]?.value ?? null;
}

export function writeMeta(sql: SqlStorage, key: string, value: string): void {
  sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

/** Bring the object's SQLite up to the newest schema (on wake). Returns the version reached. */
export function migrate(storage: DurableObjectStorage, migrations: readonly Migration[] = MIGRATIONS): number {
  storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  let version = Number(readMeta(storage.sql, "schemaVersion") ?? 0);
  for (const m of migrations) {
    if (m.version <= version) continue;
    storage.transactionSync(() => {
      m.up(storage.sql);
      writeMeta(storage.sql, "schemaVersion", String(m.version));
    });
    version = m.version;
  }
  return version;
}
```

- [ ] **Step 6: Implement `rows.ts`**

`platform/apps/worker/src/store/rows.ts`:

```ts
import type { Group, Task, TaskEvent } from "@imprint/domain";

/**
 * SQLite rows ⇄ the v1 contract (`types.ts`): one column per field, same names (ADR 002). Decoders read
 * only these columns, so a column added by a later migration is ignored by older code (P7).
 */

type Row = Record<string, SqlStorageValue>;

export const TASK_COLUMNS = [
  "id", "title", "location", "dueDate", "startDate", "groupId", "isRepeating", "recurrenceMask",
  "priority", "parentId", "position", "createdAt", "enteredDayAt", "updatedAt", "deletedAt",
] as const satisfies readonly (keyof Task)[];

export const GROUP_COLUMNS = [
  "id", "name", "position", "isCollapsed", "color", "createdAt", "updatedAt", "deletedAt",
] as const satisfies readonly (keyof Group)[];

export const EVENT_COLUMNS = [
  "id", "taskId", "type", "at", "dayKey", "title", "groupId", "isRepeating", "surface", "deviceId",
] as const satisfies readonly (keyof TaskEvent)[];

const q = (name: string) => `"${name}"`;

function values(row: object, columns: readonly string[]): SqlStorageValue[] {
  const r = row as Record<string, unknown>;
  return columns.map((c) => {
    const v = r[c];
    if (typeof v === "boolean") return v ? 1 : 0;
    return (v ?? null) as SqlStorageValue;
  });
}

function insertSql(verb: string, table: string, columns: readonly string[]): string {
  return `${verb} INTO ${q(table)} (${columns.map(q).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
}

/** Whole-row replace by id: the object serialises writes, so the newest write is the winner. */
function upsert(sql: SqlStorage, table: string, columns: readonly string[], row: object): void {
  const updates = columns.filter((c) => c !== "id").map((c) => `${q(c)} = excluded.${q(c)}`);
  sql.exec(`${insertSql("INSERT", table, columns)} ON CONFLICT("id") DO UPDATE SET ${updates.join(", ")}`, ...values(row, columns));
}

export const writeTask = (sql: SqlStorage, t: Task): void => upsert(sql, "tasks", TASK_COLUMNS, t);
export const writeGroup = (sql: SqlStorage, g: Group): void => upsert(sql, "groups", GROUP_COLUMNS, g);

/** Events are append-only; a repeated id keeps the first row (union by id, as `mergeSnapshots`). */
export function insertEvent(sql: SqlStorage, e: TaskEvent): void {
  sql.exec(insertSql("INSERT OR IGNORE", "events", EVENT_COLUMNS), ...values(e, EVENT_COLUMNS));
}

const str = (v: SqlStorageValue): string => String(v);
const optStr = (v: SqlStorageValue): string | null => (v === null ? null : String(v));
const num = (v: SqlStorageValue): number => Number(v);
const optNum = (v: SqlStorageValue): number | null => (v === null ? null : Number(v));
const bool = (v: SqlStorageValue): boolean => v === 1;

function decodeTask(r: Row): Task {
  return {
    id: str(r.id), title: str(r.title), location: str(r.location), dueDate: optNum(r.dueDate),
    startDate: optNum(r.startDate), groupId: optStr(r.groupId), isRepeating: bool(r.isRepeating),
    recurrenceMask: num(r.recurrenceMask), priority: num(r.priority), parentId: optStr(r.parentId),
    position: num(r.position), createdAt: num(r.createdAt), enteredDayAt: optNum(r.enteredDayAt),
    updatedAt: num(r.updatedAt), deletedAt: optNum(r.deletedAt),
  };
}

function decodeGroup(r: Row): Group {
  return {
    id: str(r.id), name: str(r.name), position: num(r.position), isCollapsed: bool(r.isCollapsed),
    color: num(r.color), createdAt: num(r.createdAt), updatedAt: num(r.updatedAt), deletedAt: optNum(r.deletedAt),
  };
}

function decodeEvent(r: Row): TaskEvent {
  return {
    id: str(r.id), taskId: optStr(r.taskId), type: str(r.type), at: num(r.at), dayKey: str(r.dayKey),
    title: optStr(r.title), groupId: optStr(r.groupId), isRepeating: bool(r.isRepeating),
    surface: optStr(r.surface), deviceId: str(r.deviceId),
  };
}

export interface Rows {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
}

/** Everything the object keeps in memory: all tasks and groups, events from `sinceDayKey` on. */
export function loadRows(sql: SqlStorage, sinceDayKey: string): Rows {
  return {
    tasks: sql.exec<Row>(`SELECT * FROM "tasks"`).toArray().map(decodeTask),
    groups: sql.exec<Row>(`SELECT * FROM "groups"`).toArray().map(decodeGroup),
    events: sql.exec<Row>(`SELECT * FROM "events" WHERE "dayKey" >= ?`, sinceDayKey).toArray().map(decodeEvent),
  };
}

/** The settings row as an object; `{}` until W3a writes `UserSettings`. */
export function readSettings(sql: SqlStorage): Record<string, unknown> {
  const row = sql.exec<{ value: string }>(`SELECT "value" FROM "settings" WHERE "id" = 1`).toArray()[0];
  if (!row) return {};
  try {
    const v: unknown = JSON.parse(row.value);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test -w @imprint/worker -- rows schema`
Expected: PASS (10 tests). Then `npm run check` — green (the existing `worker.test.ts` still passes with `isolatedStorage: false`: its counter check is relative).

- [ ] **Step 8: Commit**

```bash
git add platform/apps/worker/src/store/schema.ts platform/apps/worker/src/store/rows.ts platform/apps/worker/test/env.d.ts platform/apps/worker/test/helpers.ts platform/apps/worker/test/rows.test.ts platform/apps/worker/test/schema.test.ts platform/apps/worker/vitest.config.ts
git commit -m "platform: user SQLite schema — v1 rows one to one, migrations by schemaVersion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `SqlStore` — tools over SQLite, atomic commit, `rev`

**Files:**
- Modify: `platform/packages/domain/src/index.ts` (one export line)
- Create: `platform/apps/worker/src/store/sqlStore.ts`
- Test: `platform/apps/worker/test/sqlStore.test.ts`

**Interfaces:**
- Consumes: Task 1 (`migrate`, `readMeta`, `writeMeta`, `loadRows`, `readSettings`, `writeTask`, `writeGroup`, `insertEvent`); domain `ALL_TOOLS`, `runTool`, `monotonicClock`, `todayDayKey`, `windowStartKey`, types `ToolContext`, `ToolDef`, `ToolResult`, `MergedState`.
- Produces (`sqlStore.ts`):
  - `EVENT_WINDOW_DAYS = 35`, `SERVER_DEVICE_ID = "server"`
  - `interface ToolCall { result: ToolResult; rev: number }`
  - `interface StateSnapshot { tasks: Task[]; groups: Group[]; events: TaskEvent[]; settings: Record<string, unknown>; rev: number }`
  - `interface SqlStoreOptions { read?: () => number }`
  - `class SqlStore { constructor(storage: DurableObjectStorage, opts?: SqlStoreOptions); execute(name: string, input: unknown, tools?: readonly ToolDef[]): ToolCall & { committed: boolean }; snapshot(): StateSnapshot }`

- [ ] **Step 1: Re-export the domain's monotonic clock**

In `platform/packages/domain/src/index.ts`, after the line `export { ALL_TOOLS, runTool } from "./tools/index";` add:

```ts
export { monotonicClock } from "./tools/support";
```

- [ ] **Step 2: Write the failing tests**

`platform/apps/worker/test/sqlStore.test.ts`:

```ts
import { ALL_TOOLS, defineTool, type ToolDef } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { SqlStore } from "../src/store/sqlStore";
import { NOON_UTC, sampleEvent, sampleTask, withStorage } from "./helpers";

const EMPTY_INPUT = ALL_TOOLS.find((t) => t.name === "list_groups")!.input;
const testTool = (name: string, run: ToolDef["run"]): ToolDef[] => [
  ...ALL_TOOLS,
  defineTool({ name, description: name, input: EMPTY_INPUT, run }),
];
const at = (ms: number) => ({ read: () => ms });
const count = (storage: DurableObjectStorage, table: string) =>
  storage.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`).one().n;

describe("SqlStore", () => {
  it("a changing call commits its rows and bumps rev by exactly 1", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const call = s.execute("add_task", { title: "Buy milk", where: "backlog" });
      expect(call.result).toMatchObject({ ok: true, changed: true });
      expect(call).toMatchObject({ rev: 1, committed: true });
      expect(count(storage, "tasks")).toBe(1);
      expect(count(storage, "events")).toBe(1); // CREATED — task and event share one rev
      expect(s.snapshot()).toMatchObject({ rev: 1, tasks: [{ title: "Buy milk" }] });
    }));

  it("queries and rule refusals leave rev alone", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const add = s.execute("add_task", { title: "Same", where: "backlog" });
      if (!add.result.ok) throw new Error("add_task failed");
      const taskId = (add.result.task as { id: string }).id;
      expect(s.execute("list_backlog", {})).toMatchObject({ rev: 1, committed: false });
      const same = s.execute("rename_task", { taskId, title: "Same" });
      expect(same.result).toMatchObject({ ok: true, changed: false, reason: "same_value" });
      expect(same.rev).toBe(1);
    }));

  it("a tool that throws after writing leaves nothing — result storage, rev 0", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("boom", (ctx) => {
        ctx.upsertTask(sampleTask());
        throw new Error("kaput");
      });
      const call = s.execute("boom", {}, tools);
      expect(call.result).toMatchObject({ ok: false, error: "storage", message: "kaput" });
      expect(call).toMatchObject({ rev: 0, committed: false });
      expect(count(storage, "tasks")).toBe(0);
      expect(s.snapshot().tasks).toEqual([]);
    }));

  it("a tool that writes and then returns ok:false leaves nothing", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("half", (ctx) => {
        ctx.upsertTask(sampleTask());
        return { ok: false, error: "not_found" };
      });
      expect(s.execute("half", {}, tools)).toMatchObject({ rev: 0, committed: false });
      expect(count(storage, "tasks")).toBe(0);
      expect(s.snapshot().tasks).toEqual([]);
    }));

  it("a commit that fails in SQLite rolls back every row and keeps memory clean", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("bad_row", (ctx) => {
        ctx.upsertTask(sampleTask({ id: "fine" }));
        ctx.upsertTask(sampleTask({ id: "broken", title: null as unknown as string })); // NOT NULL
        return { ok: true, changed: true };
      });
      const call = s.execute("bad_row", {}, tools);
      expect(call.result).toMatchObject({ ok: false, error: "storage" });
      expect(call).toMatchObject({ rev: 0, committed: false });
      expect(count(storage, "tasks")).toBe(0);
      expect(s.snapshot()).toMatchObject({ tasks: [], rev: 0 });
    }));

  it("a tool reads its own pending writes within the run", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("write_then_read", (ctx) => {
        ctx.upsertTask(sampleTask({ id: "a" }));
        ctx.appendEvent(sampleEvent({ id: "ea" }));
        const st = ctx.state();
        return { ok: true, changed: true, tasks: st.tasks.length, events: st.events.length };
      });
      expect(s.execute("write_then_read", {}, tools).result).toMatchObject({ tasks: 1, events: 1 });
    }));

  it("a woken object (new SqlStore, same storage) sees the same rows and rev", () =>
    withStorage((storage) => {
      const first = new SqlStore(storage, at(NOON_UTC));
      first.execute("add_task", { title: "Persisted", where: "day" });
      const woken = new SqlStore(storage, at(NOON_UTC));
      expect(woken.snapshot()).toMatchObject({ rev: 1, tasks: [{ title: "Persisted" }] });
      expect(woken.execute("add_task", { title: "Next", where: "day" }).rev).toBe(2);
    }));

  it("state carries events for the 35-day window only; older ones stay in SQLite", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC)); // today = 2026-09-28 → window from 2026-08-25
      const tools = testTool("journal", (ctx) => {
        ctx.appendEvent(sampleEvent({ id: "old", dayKey: "2026-08-24" }));
        ctx.appendEvent(sampleEvent({ id: "edge", dayKey: "2026-08-25" }));
        return { ok: true, changed: true };
      });
      s.execute("journal", {}, tools);
      expect(s.snapshot().events.map((e) => e.id)).toEqual(["edge"]);
      expect(new SqlStore(storage, at(NOON_UTC)).snapshot().events.map((e) => e.id)).toEqual(["edge"]);
      expect(count(storage, "events")).toBe(2);
    }));

  it("now() never repeats even when the wall clock stands still", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("tick", (ctx) => ({ ok: true, changed: false, a: ctx.now(), b: ctx.now() }));
      const one = s.execute("tick", {}, tools).result as unknown as { a: number; b: number };
      const two = s.execute("tick", {}, tools).result as unknown as { a: number; b: number };
      expect(one.b).toBeGreaterThan(one.a);
      expect(two.a).toBeGreaterThan(one.b);
    }));

  it("todayKey is the UTC day until W3a", () =>
    withStorage((storage) => {
      const late = new SqlStore(storage, at(Date.UTC(2026, 8, 28, 23, 30)));
      late.execute("add_task", { title: "Late", where: "day" });
      const early = new SqlStore(storage, at(Date.UTC(2026, 8, 29, 0, 30)));
      early.execute("add_task", { title: "Early", where: "day" });
      expect(early.snapshot().events.map((e) => e.dayKey).sort()).toEqual(["2026-09-28", "2026-09-29"]);
    }));

  it("server-run tools stamp deviceId 'server'", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      s.execute("add_task", { title: "X", where: "day" });
      expect(s.snapshot().events.map((e) => e.deviceId)).toEqual(["server"]);
    }));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -w @imprint/worker -- sqlStore`
Expected: FAIL — `Cannot find module '../src/store/sqlStore'`.

- [ ] **Step 4: Implement `sqlStore.ts`**

`platform/apps/worker/src/store/sqlStore.ts`:

```ts
import {
  ALL_TOOLS, monotonicClock, runTool, todayDayKey, windowStartKey,
  type Group, type MergedState, type Task, type TaskEvent, type ToolContext, type ToolDef, type ToolResult,
} from "@imprint/domain";
import { insertEvent, loadRows, readSettings, writeGroup, writeTask } from "./rows";
import { migrate, readMeta, writeMeta } from "./schema";

/** Days of journal the state carries — what the Day/history projections read (W2 spec). */
export const EVENT_WINDOW_DAYS = 35;
/** `deviceId` on events written by server-run tools. */
export const SERVER_DEVICE_ID = "server";

export interface ToolCall {
  result: ToolResult;
  rev: number;
}

export interface StateSnapshot {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
  settings: Record<string, unknown>;
  rev: number;
}

export interface SqlStoreOptions {
  /** Wall clock, epoch ms. Tests pin it. */
  read?: () => number;
}

interface Pending {
  tasks: Map<string, Task>;
  groups: Map<string, Group>;
  events: Map<string, TaskEvent>;
}

function overlay<T>(base: Map<string, T>, over: Map<string, T>): T[] {
  if (over.size === 0) return [...base.values()];
  const all = new Map(base);
  for (const [id, row] of over) all.set(id, row);
  return [...all.values()];
}

/**
 * The user's rows behind a `ToolContext` (W2 §A). Reads come from memory, loaded from SQLite when the
 * object wakes; a tool's writes go to a pending buffer that commits in one `transactionSync` together
 * with `meta.rev + 1`. A failing or throwing tool, or a failed commit, leaves SQLite and memory as
 * they were.
 */
export class SqlStore {
  private readonly read: () => number;
  private readonly now: () => number;
  private readonly tasks = new Map<string, Task>();
  private readonly groups = new Map<string, Group>();
  private readonly events = new Map<string, TaskEvent>();
  private rev: number;

  constructor(
    private readonly storage: DurableObjectStorage,
    opts: SqlStoreOptions = {},
  ) {
    this.read = opts.read ?? (() => Date.now());
    this.now = monotonicClock(this.read);
    migrate(storage);
    this.rev = Number(readMeta(storage.sql, "rev") ?? 0);
    const rows = loadRows(storage.sql, this.windowStart());
    for (const t of rows.tasks) this.tasks.set(t.id, t);
    for (const g of rows.groups) this.groups.set(g.id, g);
    for (const e of rows.events) this.events.set(e.id, e);
  }

  execute(name: string, input: unknown, tools: readonly ToolDef[] = ALL_TOOLS): ToolCall & { committed: boolean } {
    const pending: Pending = { tasks: new Map(), groups: new Map(), events: new Map() };
    const result = runTool(this.context(pending), name, input, tools);
    const wrote = pending.tasks.size + pending.groups.size + pending.events.size > 0;
    if (!result.ok || !wrote) return { result, rev: this.rev, committed: false };

    const rev = this.rev + 1;
    try {
      this.storage.transactionSync(() => {
        const sql = this.storage.sql;
        for (const t of pending.tasks.values()) writeTask(sql, t);
        for (const g of pending.groups.values()) writeGroup(sql, g);
        for (const e of pending.events.values()) insertEvent(sql, e);
        writeMeta(sql, "rev", String(rev));
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { result: { ok: false, error: "storage", message }, rev: this.rev, committed: false };
    }
    for (const [id, t] of pending.tasks) this.tasks.set(id, t);
    for (const [id, g] of pending.groups) this.groups.set(id, g);
    for (const [id, e] of pending.events) this.events.set(id, e);
    this.rev = rev;
    return { result, rev, committed: true };
  }

  /** `GET /api/state`: every task and group (tombstones kept), the event window, settings, rev. */
  snapshot(): StateSnapshot {
    const since = this.windowStart();
    return {
      tasks: [...this.tasks.values()],
      groups: [...this.groups.values()],
      events: [...this.events.values()].filter((e) => e.dayKey >= since),
      settings: readSettings(this.storage.sql),
      rev: this.rev,
    };
  }

  /** UTC until W3a: workerd's local zone is UTC. W3a passes the user's zone and resetHour. */
  private todayKey(): string {
    return todayDayKey(new Date(this.read()));
  }

  private windowStart(): string {
    return windowStartKey(this.todayKey(), EVENT_WINDOW_DAYS);
  }

  private context(p: Pending): ToolContext {
    return {
      deviceId: SERVER_DEVICE_ID,
      state: (): MergedState => ({
        tasks: overlay(this.tasks, p.tasks),
        groups: overlay(this.groups, p.groups),
        events: [...this.events.values(), ...p.events.values()],
        sourceCount: 1,
      }),
      upsertTask: (t) => void p.tasks.set(t.id, t),
      upsertGroup: (g) => void p.groups.set(g.id, g),
      appendEvent: (e) => {
        if (!this.events.has(e.id) && !p.events.has(e.id)) p.events.set(e.id, e);
      },
      now: () => this.now(),
      todayKey: () => this.todayKey(),
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -w @imprint/worker -- sqlStore`
Expected: PASS (11 tests). Then `npm run check` — green (domain tests unchanged and passing).

- [ ] **Step 6: Commit**

```bash
git add platform/packages/domain/src/index.ts platform/apps/worker/src/store/sqlStore.ts platform/apps/worker/test/sqlStore.test.ts
git commit -m "platform: SqlStore — tools over the object's SQLite, one transaction + rev per call

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `UserStore` — RPC, live WebSocket, account deletion

**Files:**
- Rewrite: `platform/apps/worker/src/userStore.ts`
- Modify: `platform/apps/worker/test/helpers.ts` (append the WebSocket helpers)
- Test: `platform/apps/worker/test/userStore.test.ts`

**Interfaces:**
- Consumes: Task 2 `SqlStore`, `ToolCall`, `StateSnapshot`; Task 1 `migrate` (for the W1 `hello()` probe until Task 5).
- Produces:
  - `UserStore` RPC: `callTool(name: string, input: unknown, conn?: string | null): Promise<ToolCall>`, `getState(): Promise<StateSnapshot>`, `deleteAccount(): Promise<void>`; `fetch(request)` → 101 hibernatable socket (query `conn`), 426 otherwise.
  - `ACCOUNT_DELETED = 4001` (close code). Live push payload: `{ "changed": true, "rev": <number> }`, sent to every socket except those tagged with the caller's `conn`.
  - `validConn(conn): string | null` — accepts `/^[A-Za-z0-9_-]{1,64}$/`.
  - `test/helpers.ts`: `acceptLive(res: Response): Live`, `openLive(stub, conn): Promise<Live>`, where `interface Live { next(): Promise<unknown>; closed: Promise<number> }`.

- [ ] **Step 1: Add the WebSocket test helpers**

Append to `platform/apps/worker/test/helpers.ts`:

```ts
export interface Live {
  /** The next push, parsed. */
  next(): Promise<unknown>;
  /** Resolves with the close code. */
  closed: Promise<number>;
}

/** Accept the client end of a 101 response and queue its messages. */
export function acceptLive(res: Response): Live {
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a websocket, got ${res.status}`);
  ws.accept();
  const inbox: unknown[] = [];
  const waiters: ((m: unknown) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m: unknown = JSON.parse(String(e.data));
    const waiter = waiters.shift();
    if (waiter) waiter(m);
    else inbox.push(m);
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  return {
    next: () => (inbox.length > 0 ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiters.push(resolve))),
    closed,
  };
}

export async function openLive(stub: { fetch(input: string, init?: RequestInit): Promise<Response> }, conn: string): Promise<Live> {
  return acceptLive(await stub.fetch(`https://do/live?conn=${conn}`, { headers: { Upgrade: "websocket" } }));
}
```

- [ ] **Step 2: Write the failing tests**

`platform/apps/worker/test/userStore.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETED } from "../src/userStore";
import { newSub, openLive } from "./helpers";

const storeFor = (sub: string) => env.USER_STORE.get(env.USER_STORE.idFromName(sub));
const ADD = { title: "Buy milk", where: "backlog" };

describe("UserStore", () => {
  it("a tool call persists for its user; another user's object stays empty", async () => {
    const a = storeFor(newSub());
    const b = storeFor(newSub());
    const call = await a.callTool("add_task", ADD);
    expect(call).toMatchObject({ result: { ok: true, changed: true }, rev: 1 });
    expect((await a.getState()).tasks.map((t) => t.title)).toEqual(["Buy milk"]);
    expect(await b.getState()).toMatchObject({ tasks: [], groups: [], events: [], settings: {}, rev: 0 });
  });

  it("a committed call notifies the user's other connections, not the caller's", async () => {
    const s = storeFor(newSub());
    const tabA = await openLive(s, "tab-a");
    const tabB = await openLive(s, "tab-b");
    await s.callTool("add_task", ADD, "tab-a");
    expect(await tabB.next()).toEqual({ changed: true, rev: 1 });
    await s.callTool("add_task", ADD, "tab-b");
    expect(await tabA.next()).toEqual({ changed: true, rev: 2 }); // tab-a never got rev 1
  });

  it("a call that changes nothing notifies nobody", async () => {
    const s = storeFor(newSub());
    const tab = await openLive(s, "tab");
    await s.callTool("list_groups", {});
    await s.callTool("add_task", ADD);
    expect(await tab.next()).toEqual({ changed: true, rev: 1 });
  });

  it("deleteAccount closes live sockets and wipes the object; the next call starts clean", async () => {
    const s = storeFor(newSub());
    await s.callTool("add_task", ADD);
    const tab = await openLive(s, "tab");
    await s.deleteAccount();
    expect(await tab.closed).toBe(ACCOUNT_DELETED);
    expect(await s.getState()).toMatchObject({ tasks: [], events: [], rev: 0 });
    expect((await s.callTool("add_task", ADD)).rev).toBe(1);
  });

  it("a non-upgrade fetch is 426", async () => {
    const r = await storeFor(newSub()).fetch("https://do/live");
    expect(r.status).toBe(426);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -w @imprint/worker -- userStore`
Expected: FAIL — `ACCOUNT_DELETED` is not exported / `callTool is not a function`.

- [ ] **Step 4: Rewrite `userStore.ts`**

`platform/apps/worker/src/userStore.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { memoryContext, runTool, type ToolResult } from "@imprint/domain";
import type { Env } from "./env";
import { migrate } from "./store/schema";
import { SqlStore, type StateSnapshot, type ToolCall } from "./store/sqlStore";

/** Close code a tab sees when the account is deleted. */
export const ACCOUNT_DELETED = 4001;

const CONN = /^[A-Za-z0-9_-]{1,64}$/;

/** A tab's connection id, or null when absent or malformed. */
export function validConn(conn: string | null | undefined): string | null {
  return conn && CONN.test(conn) ? conn : null;
}

/**
 * One Durable Object per user (`idFromName(Google sub)`, ADR 001). Requests are serialised by the
 * object, so tool calls never race. Other tabs learn about a commit over a hibernatable WebSocket.
 */
export class UserStore extends DurableObject<Env> {
  private sqlStore?: SqlStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** Loaded on first use (migrations + rows); dropped by `deleteAccount`. */
  private get store(): SqlStore {
    this.sqlStore ??= new SqlStore(this.ctx.storage);
    return this.sqlStore;
  }

  async callTool(name: string, input: unknown, conn?: string | null): Promise<ToolCall> {
    const { result, rev, committed } = this.store.execute(name, input);
    if (committed) this.broadcast(rev, validConn(conn));
    return { result, rev };
  }

  async getState(): Promise<StateSnapshot> {
    return this.store.snapshot();
  }

  async deleteAccount(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(ACCOUNT_DELETED, "account_deleted");
      } catch {
        // already closing
      }
    }
    await this.ctx.storage.deleteAll();
    this.sqlStore = undefined;
  }

  /** `GET /api/live` upgrade (the worker checked the session): a socket tagged with the tab's id. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const conn = validConn(new URL(request.url).searchParams.get("conn"));
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, conn ? [conn] : []);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The channel is server → client; anything a tab sends (besides the auto-answered ping) is ignored. */
  async webSocketMessage(): Promise<void> {
    // no-op
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  /** W1 plumbing probe; removed together with `/api/hello` in W2 Task 5. */
  hello(): { count: number; tool: ToolResult } {
    migrate(this.ctx.storage);
    const sql = this.ctx.storage.sql;
    sql.exec(
      "INSERT INTO meta (key, value) VALUES ('hello_count', '1') " +
        "ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
    );
    const row = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'hello_count'").one();
    return { count: Number(row.value), tool: runTool(memoryContext(), "list_groups", {}) };
  }

  private broadcast(rev: number, conn: string | null): void {
    const message = JSON.stringify({ changed: true, rev });
    for (const ws of this.ctx.getWebSockets()) {
      if (conn && this.ctx.getTags(ws).includes(conn)) continue;
      try {
        ws.send(message);
      } catch {
        // a closing socket; that tab re-reads state when it reconnects
      }
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -w @imprint/worker -- userStore worker`
Expected: PASS (5 new + the 4 existing `worker.test.ts` cases). Then `npm run check` — green.

- [ ] **Step 6: Commit**

```bash
git add platform/apps/worker/src/userStore.ts platform/apps/worker/test/helpers.ts platform/apps/worker/test/userStore.test.ts
git commit -m "platform: UserStore — callTool/getState/deleteAccount RPC + hibernatable live socket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Signed tokens, sessions, Google OAuth primitives

**Files:**
- Create: `platform/apps/worker/src/auth/token.ts`, `platform/apps/worker/src/auth/session.ts`, `platform/apps/worker/src/auth/google.ts`
- Test: `platform/apps/worker/test/token.test.ts`, `platform/apps/worker/test/google.test.ts`

**Interfaces:**
- Consumes: WebCrypto only.
- Produces:
  - `token.ts`: `b64url(bytes: ArrayBuffer | Uint8Array): string`, `fromB64url(s: string): Uint8Array` (throws on bad input), `signToken(secret: string, payload: object): Promise<string>`, `verifyToken(secret: string, token: string): Promise<unknown | null>`, `isRecord(v: unknown): v is Record<string, unknown>`.
  - `session.ts`: `SESSION_COOKIE = "imprint_session"`, `SESSION_TTL_SEC` (30 days), `COOKIE_OPTIONS` (`httpOnly`, `secure`, `sameSite: "Lax"`, `path: "/"`), `nowSec(): number`, `interface Session { sub: string; email: string | null; exp: number }`, `encodeSession(secret, who: { sub: string; email: string | null }, issuedAt?: number): Promise<string>`, `decodeSession(secret, token, at?: number): Promise<Session | null>`.
  - `google.ts`: `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `class AuthError extends Error`, `type FetchFn = (input: string, init: RequestInit) => Promise<Response>`, `randomToken(bytes?: number): string`, `pkceChallenge(verifier: string): Promise<string>`, `authUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string`, `exchangeCode(p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }, fetchFn: FetchFn): Promise<string>` (the `id_token`), `idTokenClaims(idToken: string, clientId: string, nowSec: number): { sub: string; email: string | null }`.

- [ ] **Step 1: Write the failing token/session tests**

`platform/apps/worker/test/token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SEC, decodeSession, encodeSession } from "../src/auth/session";
import { b64url, fromB64url, signToken, verifyToken } from "../src/auth/token";

const SECRET = "unit-secret";
const NOW = 1_790_000_000;

describe("signed tokens", () => {
  it("base64url round-trips any bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect(fromB64url(b64url(bytes))).toEqual(bytes);
    expect(b64url(bytes)).not.toMatch(/[+/=]/);
  });

  it("verify returns the payload for its own signature only", async () => {
    const token = await signToken(SECRET, { kind: "x", n: 1 });
    expect(await verifyToken(SECRET, token)).toEqual({ kind: "x", n: 1 });
    expect(await verifyToken("other-secret", token)).toBeNull();
  });

  it("a tampered payload, signature or shape is null, never a throw", async () => {
    const token = await signToken(SECRET, { sub: "a" });
    const [body, sig] = token.split(".");
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ sub: "b" })));
    expect(await verifyToken(SECRET, `${forged}.${sig}`)).toBeNull();
    // Flip the first signature char — fully significant (the last char carries unused padding bits).
    expect(await verifyToken(SECRET, `${body}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`)).toBeNull();
    expect(await verifyToken(SECRET, body)).toBeNull();
    expect(await verifyToken(SECRET, `${token}.extra`)).toBeNull();
    expect(await verifyToken(SECRET, "!!!.???")).toBeNull();
    expect(await verifyToken(SECRET, "")).toBeNull();
  });
});

describe("sessions", () => {
  it("round-trips sub and email with a 30-day expiry", async () => {
    const token = await encodeSession(SECRET, { sub: "g-1", email: "me@example.test" }, NOW);
    expect(await decodeSession(SECRET, token, NOW + 1)).toEqual({ sub: "g-1", email: "me@example.test", exp: NOW + SESSION_TTL_SEC });
  });

  it("an expired session is null", async () => {
    const token = await encodeSession(SECRET, { sub: "g-1", email: null }, NOW);
    expect(await decodeSession(SECRET, token, NOW + SESSION_TTL_SEC)).toBeNull();
  });

  it("a validly signed token of another kind (the login cookie) is not a session", async () => {
    const token = await signToken(SECRET, { kind: "oauth", sub: "g-1", exp: NOW + 600 });
    expect(await decodeSession(SECRET, token, NOW)).toBeNull();
  });

  it("an empty sub is not a session", async () => {
    const token = await signToken(SECRET, { kind: "session", sub: "", email: null, exp: NOW + 600 });
    expect(await decodeSession(SECRET, token, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing Google tests**

`platform/apps/worker/test/google.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AuthError, GOOGLE_TOKEN_URL, authUrl, exchangeCode, idTokenClaims, pkceChallenge, randomToken } from "../src/auth/google";
import { b64url } from "../src/auth/token";

const CLIENT = "client-1.apps.googleusercontent.com";
const NOW = 1_790_000_000;
const fakeIdToken = (claims: Record<string, unknown>) =>
  ["e30", b64url(new TextEncoder().encode(JSON.stringify(claims))), "sig"].join(".");
const good = { iss: "https://accounts.google.com", aud: CLIENT, sub: "g-123", email: "me@example.test", email_verified: true, exp: NOW + 3600 };

describe("PKCE and the auth URL", () => {
  it("pkceChallenge matches RFC 7636 appendix B", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("randomToken is 43 url-safe chars for 32 bytes and never repeats", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it("authUrl asks Google for a code with S256 PKCE, openid email scope and our state", () => {
    const u = new URL(authUrl({ clientId: CLIENT, redirectUri: "https://x.test/auth/callback", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: CLIENT, redirect_uri: "https://x.test/auth/callback", response_type: "code",
      scope: "openid email", state: "st", code_challenge: "ch", code_challenge_method: "S256",
    });
  });
});

describe("exchangeCode", () => {
  const params = { code: "c0de", verifier: "v", clientId: CLIENT, clientSecret: "s3cret", redirectUri: "https://x.test/auth/callback" };

  it("posts the code with the verifier and returns the id_token", async () => {
    let seenUrl = "";
    let seenBody = new URLSearchParams();
    const id = await exchangeCode(params, async (url, init) => {
      seenUrl = url;
      seenBody = new URLSearchParams(String(init.body));
      return Response.json({ id_token: "tok" });
    });
    expect(id).toBe("tok");
    expect(seenUrl).toBe(GOOGLE_TOKEN_URL);
    expect(Object.fromEntries(seenBody)).toEqual({
      grant_type: "authorization_code", code: "c0de", code_verifier: "v", client_id: CLIENT,
      client_secret: "s3cret", redirect_uri: "https://x.test/auth/callback",
    });
  });

  it("a non-2xx answer or a missing id_token is an AuthError", async () => {
    await expect(exchangeCode(params, async () => Response.json({ error: "invalid_grant" }, { status: 400 }))).rejects.toBeInstanceOf(AuthError);
    await expect(exchangeCode(params, async () => Response.json({ access_token: "x" }))).rejects.toBeInstanceOf(AuthError);
  });
});

describe("idTokenClaims", () => {
  it("returns sub and the verified email", () => {
    expect(idTokenClaims(fakeIdToken(good), CLIENT, NOW)).toEqual({ sub: "g-123", email: "me@example.test" });
  });

  it("an unverified email is dropped, not trusted", () => {
    expect(idTokenClaims(fakeIdToken({ ...good, email_verified: false }), CLIENT, NOW).email).toBeNull();
  });

  it("wrong audience, wrong issuer, expiry, missing sub or garbage throw AuthError", () => {
    const bad = [
      fakeIdToken({ ...good, aud: "someone-else" }),
      fakeIdToken({ ...good, iss: "https://evil.example" }),
      fakeIdToken({ ...good, exp: NOW }),
      fakeIdToken({ ...good, sub: "" }),
      "not-a-jwt",
      "a.!!!.c",
    ];
    for (const token of bad) expect(() => idTokenClaims(token, CLIENT, NOW)).toThrow(AuthError);
  });

  it("accepts the bare issuer form and an audience array", () => {
    expect(idTokenClaims(fakeIdToken({ ...good, iss: "accounts.google.com", aud: [CLIENT] }), CLIENT, NOW).sub).toBe("g-123");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -w @imprint/worker -- token google`
Expected: FAIL — `Cannot find module '../src/auth/session'` / `'../src/auth/token'` / `'../src/auth/google'`.

- [ ] **Step 4: Implement `token.ts`**

`platform/apps/worker/src/auth/token.ts`:

```ts
/**
 * Compact HMAC-SHA256 tokens for our own cookies: `base64url(JSON).base64url(signature)`. The
 * signature check is `crypto.subtle.verify` (constant time). Anything malformed verifies to null.
 */

const encoder = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Throws on input that is not base64url. */
export function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(secret: string, payload: object): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${b64url(signature)}`;
}

/** The payload when `token` carries our signature over it; null otherwise. */
export async function verifyToken(secret: string, token: string): Promise<unknown | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(parts[1]), encoder.encode(parts[0]));
    return ok ? (JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as unknown) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implement `session.ts`**

`platform/apps/worker/src/auth/session.ts`:

```ts
import { isRecord, signToken, verifyToken } from "./token";

/** The session cookie (ADR 005): stateless, HMAC-signed, `kind: "session"`. */
export const SESSION_COOKIE = "imprint_session";
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
export const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" } as const;

export interface Session {
  /** Google `sub` — the user id and the Durable Object name. */
  sub: string;
  email: string | null;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const nowSec = (): number => Math.floor(Date.now() / 1000);

export function encodeSession(secret: string, who: { sub: string; email: string | null }, issuedAt: number = nowSec()): Promise<string> {
  return signToken(secret, { kind: "session", sub: who.sub, email: who.email, exp: issuedAt + SESSION_TTL_SEC });
}

export async function decodeSession(secret: string, token: string, at: number = nowSec()): Promise<Session | null> {
  const p = await verifyToken(secret, token);
  if (!isRecord(p) || p.kind !== "session") return null;
  if (typeof p.sub !== "string" || p.sub === "" || typeof p.exp !== "number" || p.exp <= at) return null;
  return { sub: p.sub, email: typeof p.email === "string" ? p.email : null, exp: p.exp };
}
```

- [ ] **Step 6: Implement `google.ts`**

`platform/apps/worker/src/auth/google.ts`:

```ts
import { b64url, fromB64url, isRecord } from "./token";

/** Google OAuth 2.0 authorization code + PKCE, server side (ADR 005). */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export class AuthError extends Error {}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

export function authUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Trade the code for tokens; returns the ID token. */
export async function exchangeCode(
  p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string },
  fetchFn: FetchFn,
): Promise<string> {
  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      code_verifier: p.verifier,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
    }).toString(),
  });
  if (!response.ok) throw new AuthError(`token endpoint answered ${response.status}`);
  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body) || typeof body.id_token !== "string") throw new AuthError("no id_token");
  return body.id_token;
}

/**
 * Claims of an ID token that came straight from Google's token endpoint over TLS. OIDC Core §3.1.3.7
 * lets TLS stand in for the signature check in this case; issuer, audience and expiry are still checked.
 */
export function idTokenClaims(idToken: string, clientId: string, nowSec: number): { sub: string; email: string | null } {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new AuthError("malformed id_token");
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    throw new AuthError("malformed id_token");
  }
  if (!isRecord(claims)) throw new AuthError("malformed id_token");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss))) throw new AuthError("wrong issuer");
  if (!audiences.includes(clientId)) throw new AuthError("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) throw new AuthError("expired id_token");
  if (typeof claims.sub !== "string" || claims.sub === "") throw new AuthError("no sub");
  const email = typeof claims.email === "string" && claims.email_verified === true ? claims.email : null;
  return { sub: claims.sub, email };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test -w @imprint/worker -- token google`
Expected: PASS (7 + 10 tests). Then `npm run check` — green.

- [ ] **Step 8: Commit**

```bash
git add platform/apps/worker/src/auth/token.ts platform/apps/worker/src/auth/session.ts platform/apps/worker/src/auth/google.ts platform/apps/worker/test/token.test.ts platform/apps/worker/test/google.test.ts
git commit -m "platform: signed session tokens + Google OAuth PKCE primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Authenticated API — tools, state, live, account

**Files:**
- Modify: `platform/apps/worker/src/env.ts`, `platform/apps/worker/vitest.config.ts`, `platform/apps/worker/src/userStore.ts` (drop `hello()`), `platform/apps/worker/test/helpers.ts` (append HTTP helpers)
- Create: `platform/apps/worker/src/auth/middleware.ts`, `platform/apps/worker/src/api/routes.ts`, `platform/apps/worker/src/app.ts`
- Rewrite: `platform/apps/worker/src/index.ts`
- Modify (**only with the user's approval from plan review**): `platform/apps/worker/test/worker.test.ts` — delete the `/api/hello` case
- Test: `platform/apps/worker/test/api.test.ts`

**Interfaces:**
- Consumes: Task 3 `UserStore` RPC + `fetch`; Task 4 `SESSION_COOKIE`, `decodeSession`, `encodeSession`, `Session`.
- Produces:
  - `env.ts`: `Env` gains `SESSION_SECRET?`, `GOOGLE_CLIENT_ID?`, `GOOGLE_CLIENT_SECRET?`, `APP_ORIGIN?` (all `string`); `type AppEnv = { Bindings: Env; Variables: { session: Session } }`.
  - `requireSession` (Hono middleware; 500 `auth_not_configured` without a secret, 401 `unauthorized` without a valid session).
  - HTTP: `GET /api/me` → `{ sub, email }`; `POST /api/tools/:name` (JSON body, optional header `x-imprint-conn`) → `{ result, rev }`; `GET /api/state` → `StateSnapshot`; `GET /api/live?conn=<id>` (Upgrade) → 101; `DELETE /api/account` → `{ ok: true }` + cleared session cookie.
  - `api/routes.ts`: `CONN_HEADER = "x-imprint-conn"`, `MAX_BODY_BYTES = 65536`, `apiRoutes(): Hono<AppEnv>`.
  - `app.ts`: `createApp(): Hono<AppEnv>` (Task 6 adds a `fetchFn` parameter).
  - `test/helpers.ts`: `sessionCookie(sub, secret?)`, `api(path, cookie, init?)`, `postTool(name, cookie, body, headers?)`.

- [ ] **Step 1: Env and test bindings**

`platform/apps/worker/src/env.ts` — replace:

```ts
import type { Session } from "./auth/session";
import type { UserStore } from "./userStore";

/** Worker bindings (wrangler.jsonc). ASSETS exists only in the dev/prod environments. */
export interface Env {
  USER_STORE: DurableObjectNamespace<UserStore>;
  ASSETS?: Fetcher;
  /** HMAC key for our cookies (wrangler secret). */
  SESSION_SECRET?: string;
  /** Google OAuth web client of this environment (wrangler secrets; dev and prod differ, P8). */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** The browser's origin when it is not the worker's own — local Vite: http://localhost:5173. */
  APP_ORIGIN?: string;
}

export type AppEnv = { Bindings: Env; Variables: { session: Session } };
```

`platform/apps/worker/vitest.config.ts` — add fake auth bindings (they also override any local `.dev.vars`):

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        // Hibernatable WebSockets don't mix with per-test storage stacks; tests use fresh ids instead.
        isolatedStorage: false,
        miniflare: {
          bindings: {
            SESSION_SECRET: "test-session-secret",
            GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
            GOOGLE_CLIENT_SECRET: "test-client-secret",
            APP_ORIGIN: "https://imprint.test",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 2: HTTP test helpers**

Append to `platform/apps/worker/test/helpers.ts` (and add `SELF` to the existing `cloudflare:test` import, `encodeSession`/`SESSION_COOKIE` import from `../src/auth/session`):

```ts
/** A `Cookie` header value carrying a valid session for `sub`. */
export async function sessionCookie(sub: string, secret: string = env.SESSION_SECRET ?? ""): Promise<string> {
  return `${SESSION_COOKIE}=${await encodeSession(secret, { sub, email: `${sub}@example.test` })}`;
}

export function api(path: string, cookie: string | null, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return SELF.fetch(`${BASE}${path}`, { ...init, headers });
}

export function postTool(name: string, cookie: string | null, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return api(`/api/tools/${name}`, cookie, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
```

The import lines at the top of `helpers.ts` become:

```ts
import { SELF, env, runInDurableObject } from "cloudflare:test";
import type { Group, Task, TaskEvent } from "@imprint/domain";
import { SESSION_COOKIE, encodeSession } from "../src/auth/session";
import type { UserStore } from "../src/userStore";
```

- [ ] **Step 3: Write the failing API tests**

`platform/apps/worker/test/api.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SEC, encodeSession, nowSec } from "../src/auth/session";
import { signToken } from "../src/auth/token";
import { BASE, acceptLive, api, newSub, postTool, sessionCookie } from "./helpers";

type Call = { result: Record<string, unknown>; rev: number };
type State = { tasks: { id: string; title: string }[]; rev: number };
const ADD = { title: "Buy milk", where: "backlog" };

describe("API without a valid session", () => {
  const routes: [string, RequestInit][] = [
    ["/api/me", {}],
    ["/api/state", {}],
    ["/api/tools/list_day", { method: "POST", body: "{}" }],
    ["/api/account", { method: "DELETE" }],
    ["/api/live", { headers: { Upgrade: "websocket" } }],
  ];

  it("every user route is 401 without a cookie", async () => {
    for (const [path, init] of routes) {
      const r = await api(path, null, init);
      expect(r.status, path).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("a cookie from another secret, an expired one or a login cookie is 401", async () => {
    const sub = newSub();
    const cookies = [
      await sessionCookie(sub, "some-other-secret"),
      `imprint_session=${await encodeSession(env.SESSION_SECRET ?? "", { sub, email: null }, nowSec() - SESSION_TTL_SEC - 1)}`,
      `imprint_session=${await signToken(env.SESSION_SECRET ?? "", { kind: "oauth", sub, exp: nowSec() + 600 })}`,
      "imprint_session=garbage",
    ];
    for (const cookie of cookies) expect((await api("/api/state", cookie)).status).toBe(401);
  });
});

describe("tools over HTTP", () => {
  it("/api/me names the session's user", async () => {
    const sub = newSub();
    expect(await (await api("/api/me", await sessionCookie(sub))).json()).toEqual({ sub, email: `${sub}@example.test` });
  });

  it("a changing call answers { result, rev } and state shows it; rev grows by 1 per change only", async () => {
    const cookie = await sessionCookie(newSub());
    const add = await (await postTool("add_task", cookie, ADD)).json<Call>();
    expect(add).toMatchObject({ result: { ok: true, changed: true }, rev: 1 });
    const taskId = (add.result.task as { id: string }).id;

    const same = await (await postTool("rename_task", cookie, { taskId, title: "Buy milk" })).json<Call>();
    expect(same).toMatchObject({ result: { ok: true, changed: false, reason: "same_value" }, rev: 1 });

    const rename = await (await postTool("rename_task", cookie, { taskId, title: "Buy oat milk" })).json<Call>();
    expect(rename.rev).toBe(2);

    const state = await (await api("/api/state", cookie)).json<State>();
    expect(state.rev).toBe(2);
    expect(state.tasks.map((t) => t.title)).toEqual(["Buy oat milk"]);
  });

  it("rule and input errors are 200 ToolResults", async () => {
    const cookie = await sessionCookie(newSub());
    const unknown = await postTool("no_such_tool", cookie, {});
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ result: { ok: false, error: "unknown_tool" }, rev: 0 });
    const invalid = await (await postTool("add_task", cookie, { title: "  ", where: "day" })).json<Call>();
    expect(invalid.result).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("an empty body is input {}; invalid JSON is 400; a body over 64 KiB is 413", async () => {
    const cookie = await sessionCookie(newSub());
    const empty = await postTool("list_groups", cookie, "");
    expect(await empty.json()).toMatchObject({ result: { ok: true, groups: [] } });
    const broken = await postTool("add_task", cookie, "{not json");
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "invalid_json" });
    const huge = await postTool("add_task", cookie, { title: "x".repeat(70_000), where: "day" });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: "too_large" });
  });

  it("isolation: user A's session never reads or writes user B's rows", async () => {
    const a = await sessionCookie(newSub());
    const b = await sessionCookie(newSub());
    const add = await (await postTool("add_task", b, { title: "B's secret", where: "day" })).json<Call>();
    const bTaskId = (add.result.task as { id: string }).id;

    const aState = await (await api("/api/state", a)).json<State>();
    expect(aState).toMatchObject({ tasks: [], rev: 0 });
    const aRename = await (await postTool("rename_task", a, { taskId: bTaskId, title: "hijacked" })).json<Call>();
    expect(aRename.result).toMatchObject({ ok: false, error: "not_found" });
    const bState = await (await api("/api/state", b)).json<State>();
    expect(bState.tasks.map((t) => t.title)).toEqual(["B's secret"]);
  });
});

describe("live channel and account", () => {
  it("another tab's socket gets { changed, rev } after a tool call", async () => {
    const cookie = await sessionCookie(newSub());
    const tab = acceptLive(await api("/api/live?conn=tab1", cookie, { headers: { Upgrade: "websocket", Origin: BASE } }));
    await postTool("add_task", cookie, ADD, { "x-imprint-conn": "tab2" });
    expect(await tab.next()).toEqual({ changed: true, rev: 1 });
  });

  it("a cross-site Origin is 403; a plain GET is 426", async () => {
    const cookie = await sessionCookie(newSub());
    const evil = await api("/api/live", cookie, { headers: { Upgrade: "websocket", Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    expect((await api("/api/live", cookie)).status).toBe(426);
  });

  it("DELETE /api/account wipes the user's data and clears the session cookie", async () => {
    const cookie = await sessionCookie(newSub());
    await postTool("add_task", cookie, ADD);
    const del = await api("/api/account", cookie, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });
    expect(del.headers.getSetCookie().some((c) => c.startsWith("imprint_session=;") && /Max-Age=0/i.test(c))).toBe(true);
    expect(await (await api("/api/state", cookie)).json()).toMatchObject({ tasks: [], rev: 0 });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test -w @imprint/worker -- api`
Expected: FAIL — `/api/me` etc. answer 404 JSON instead of 401 / 200.

- [ ] **Step 5: Implement middleware, API routes and the app factory**

`platform/apps/worker/src/auth/middleware.ts`:

```ts
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { SESSION_COOKIE, decodeSession } from "./session";

/** Every user route: a valid session cookie, or 401 (W2 §C). Puts the session on `c.get("session")`. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const secret = c.env.SESSION_SECRET;
  if (!secret) return c.json({ error: "auth_not_configured" }, 500);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await decodeSession(secret, token) : null;
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("session", session);
  await next();
});
```

`platform/apps/worker/src/api/routes.ts`:

```ts
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie } from "hono/cookie";
import { requireSession } from "../auth/middleware";
import { SESSION_COOKIE } from "../auth/session";
import type { AppEnv } from "../env";

/** A tab sends its connection id with tool calls so its own live socket is not told about its own write. */
export const CONN_HEADER = "x-imprint-conn";
export const MAX_BODY_BYTES = 64 * 1024;

/** The caller's object — the only way a route reaches user data (isolation by construction). */
const userStore = (c: Context<AppEnv>) => c.env.USER_STORE.get(c.env.USER_STORE.idFromName(c.get("session").sub));

/** An empty body is `{}`; anything else must be JSON. */
async function readInput(c: Context<AppEnv>): Promise<{ input: unknown } | null> {
  const text = await c.req.text();
  if (text.trim() === "") return { input: {} };
  try {
    return { input: JSON.parse(text) as unknown };
  } catch {
    return null;
  }
}

/** Blocks cross-site WebSocket hijacking; non-browser clients send no Origin. */
function allowedOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header("origin");
  return !origin || origin === new URL(c.req.url).origin || origin === c.env.APP_ORIGIN;
}

export function apiRoutes(): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.get("/me", requireSession, (c) => {
    const { sub, email } = c.get("session");
    return c.json({ sub, email });
  });

  api.post(
    "/tools/:name",
    requireSession,
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "too_large" }, 413) }),
    async (c) => {
      const body = await readInput(c);
      if (!body) return c.json({ error: "invalid_json" }, 400);
      return c.json(await userStore(c).callTool(c.req.param("name"), body.input, c.req.header(CONN_HEADER)));
    },
  );

  api.get("/state", requireSession, async (c) => c.json(await userStore(c).getState()));

  api.get("/live", requireSession, async (c) => {
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "expected_websocket" }, 426);
    if (!allowedOrigin(c)) return c.json({ error: "forbidden_origin" }, 403);
    return userStore(c).fetch(c.req.raw);
  });

  api.delete("/account", requireSession, async (c) => {
    await userStore(c).deleteAccount();
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ ok: true });
  });

  return api;
}
```

`platform/apps/worker/src/app.ts`:

```ts
import { ALL_TOOLS } from "@imprint/domain";
import { Hono } from "hono";
import { apiRoutes } from "./api/routes";
import type { AppEnv } from "./env";

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ ok: true, tools: ALL_TOOLS.length }));
  app.route("/api", apiRoutes());

  /** API misses must never fall through to the SPA's index.html. */
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  /** Everything else is the web app (SPA fallback is configured on the assets binding). */
  app.all("*", (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

  return app;
}
```

`platform/apps/worker/src/index.ts` — replace:

```ts
import { createApp } from "./app";

export { UserStore } from "./userStore";

export default createApp();
```

- [ ] **Step 6: Drop the W1 `hello()` probe from `UserStore`**

In `platform/apps/worker/src/userStore.ts`: delete the `hello()` method (with its KDoc), and change the first imports to:

```ts
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { SqlStore, type StateSnapshot, type ToolCall } from "./store/sqlStore";
```

(`memoryContext`, `runTool`, `ToolResult` and `migrate` are no longer used there.)

- [ ] **Step 7: Remove the `/api/hello` test case — ONLY with the user's approval**

If the user approved at plan review: in `platform/apps/worker/test/worker.test.ts` delete exactly the `it("the Durable Object keeps a counter in SQLite and runs a domain tool", …)` block; leave the other three cases untouched.
If the user did not approve: stop and ask before continuing — without the route that test fails, and keeping an unauthenticated route breaks «Без сессии API отвечает 401».

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test -w @imprint/worker`
Expected: PASS — `api.test.ts` (12 tests) and every earlier file; `worker.test.ts` keeps `/health`, `/api/nope` → 404 JSON (an unknown path is 404, not 401, because only real routes carry `requireSession`), and the no-assets 404. Then `npm run check` — green.

- [ ] **Step 9: Commit**

```bash
git add platform/apps/worker/src/env.ts platform/apps/worker/src/app.ts platform/apps/worker/src/index.ts platform/apps/worker/src/userStore.ts platform/apps/worker/src/auth/middleware.ts platform/apps/worker/src/api/routes.ts platform/apps/worker/vitest.config.ts platform/apps/worker/test/helpers.ts platform/apps/worker/test/api.test.ts platform/apps/worker/test/worker.test.ts
git commit -m "platform: authenticated API — tools, state, live socket, account deletion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Google sign-in routes, ADR 005, local secrets

**Files:**
- Create: `platform/apps/worker/src/auth/routes.ts`, `platform/apps/worker/.dev.vars.example`, `platform/docs/adr/005-auth-sessions.md`
- Modify: `platform/apps/worker/src/app.ts`, `platform/.gitignore`, `platform/README.md`, `platform/CLAUDE.md`
- Test: `platform/apps/worker/test/auth.test.ts`

**Interfaces:**
- Consumes: Task 4 (`authUrl`, `exchangeCode`, `idTokenClaims`, `pkceChallenge`, `randomToken`, `AuthError`, `FetchFn`, `signToken`, `verifyToken`, `isRecord`, `encodeSession`, `COOKIE_OPTIONS`, `SESSION_COOKIE`, `SESSION_TTL_SEC`, `nowSec`); Task 5 (`createApp`, `AppEnv`).
- Produces:
  - `GET /auth/login` → 302 to Google, sets `imprint_oauth` (`Path=/auth`, 10 min, `{ kind: "oauth", state, verifier, exp }`).
  - `GET /auth/callback?code&state` → 302 to `${appOrigin}/` with `imprint_session`, or 302 to `${appOrigin}/?login=failed` with no session.
  - `POST /auth/logout` → `{ ok: true }`, session cookie cleared.
  - `OAUTH_COOKIE = "imprint_oauth"`, `authRoutes(fetchFn: FetchFn): Hono<AppEnv>`; `createApp(fetchFn?: FetchFn)`.
  - `redirect_uri` = `${APP_ORIGIN ?? request origin}/auth/callback`.

- [ ] **Step 1: Write the failing tests**

`platform/apps/worker/test/auth.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { pkceChallenge, type FetchFn } from "../src/auth/google";
import { nowSec } from "../src/auth/session";
import { b64url } from "../src/auth/token";
import { BASE } from "./helpers";

const CLIENT = env.GOOGLE_CLIENT_ID ?? "";
const idToken = (claims: Record<string, unknown>) => ["e30", b64url(new TextEncoder().encode(JSON.stringify(claims))), "sig"].join(".");
const googleSays = (sub: string): FetchFn => async () =>
  Response.json({ id_token: idToken({ iss: "https://accounts.google.com", aud: CLIENT, sub, email: "me@example.test", email_verified: true, exp: nowSec() + 3600 }) });

/** `name=value` of a Set-Cookie on the response, or null. */
function cookieFrom(res: Response, name: string): string | null {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return line ? line.split(";")[0] : null;
}

async function startLogin(app: ReturnType<typeof createApp>) {
  const res = await app.request(`${BASE}/auth/login`, {}, env);
  const location = new URL(res.headers.get("location") ?? "");
  return { res, location, state: location.searchParams.get("state") ?? "", oauth: cookieFrom(res, "imprint_oauth") ?? "" };
}

const callback = (app: ReturnType<typeof createApp>, query: string, cookie: string) =>
  app.request(`${BASE}/auth/callback?${query}`, { headers: { cookie } }, env);

describe("Google sign-in", () => {
  it("login redirects to Google with PKCE S256 and sets a short-lived login cookie", async () => {
    const { res, location } = await startLogin(createApp(googleSays("x")));
    expect(res.status).toBe(302);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe(CLIENT);
    expect(location.searchParams.get("redirect_uri")).toBe(`${BASE}/auth/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const line = res.headers.getSetCookie().find((c) => c.startsWith("imprint_oauth=")) ?? "";
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/Secure/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\/auth/i);
    expect(line).toMatch(/Max-Age=600/i);
  });

  it("callback exchanges the code with the matching verifier, sets the session and lands on /", async () => {
    let body = new URLSearchParams();
    const app = createApp(async (url, init) => {
      body = new URLSearchParams(String(init.body));
      return googleSays("g-123")(url, init);
    });
    const { location, state, oauth } = await startLogin(app);
    const res = await callback(app, `code=abc&state=${state}`, oauth);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/`);
    expect(body.get("code")).toBe("abc");
    expect(await pkceChallenge(body.get("code_verifier") ?? "")).toBe(location.searchParams.get("code_challenge"));

    const line = res.headers.getSetCookie().find((c) => c.startsWith("imprint_session=")) ?? "";
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/Secure/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
    const me = await app.request(`${BASE}/api/me`, { headers: { cookie: cookieFrom(res, "imprint_session") ?? "" } }, env);
    expect(await me.json()).toEqual({ sub: "g-123", email: "me@example.test" });
  });

  it("a mismatched state fails without calling Google", async () => {
    let called = false;
    const app = createApp(async (url, init) => {
      called = true;
      return googleSays("x")(url, init);
    });
    const { oauth } = await startLogin(app);
    const res = await callback(app, "code=abc&state=forged", oauth);
    expect(res.headers.get("location")).toBe(`${BASE}/?login=failed`);
    expect(cookieFrom(res, "imprint_session")).toBeNull();
    expect(called).toBe(false);
  });

  it("a missing login cookie, a Google error, a token failure or a foreign id_token all fail cleanly", async () => {
    const cases: [FetchFn, (s: string, oauth: string) => [string, string]][] = [
      [googleSays("x"), (s) => [`code=abc&state=${s}`, ""]],
      [googleSays("x"), (s, o) => [`error=access_denied&state=${s}`, o]],
      [async () => Response.json({ error: "invalid_grant" }, { status: 400 }), (s, o) => [`code=abc&state=${s}`, o]],
      [async () => { throw new TypeError("network down"); }, (s, o) => [`code=abc&state=${s}`, o]],
      [async () => Response.json({ id_token: idToken({ iss: "https://accounts.google.com", aud: "other", sub: "x", exp: nowSec() + 60 }) }), (s, o) => [`code=abc&state=${s}`, o]],
    ];
    for (const [fetchFn, request] of cases) {
      const app = createApp(fetchFn);
      const { state, oauth } = await startLogin(app);
      const [query, cookie] = request(state, oauth);
      const res = await callback(app, query, cookie);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(`${BASE}/?login=failed`);
      expect(cookieFrom(res, "imprint_session")).toBeNull();
    }
  });

  it("logout clears the session cookie", async () => {
    const res = await createApp(googleSays("x")).request(`${BASE}/auth/logout`, { method: "POST" }, env);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.getSetCookie().some((c) => c.startsWith("imprint_session=;") && /Max-Age=0/i.test(c))).toBe(true);
  });

  it("without Google secrets, login is 500 auth_not_configured", async () => {
    const res = await createApp(googleSays("x")).request(`${BASE}/auth/login`, {}, { ...env, GOOGLE_CLIENT_SECRET: undefined });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "auth_not_configured" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w @imprint/worker -- auth`
Expected: FAIL — typecheck/test error: `createApp` takes no arguments, and `/auth/login` is 404.

- [ ] **Step 3: Implement the routes**

`platform/apps/worker/src/auth/routes.ts`:

```ts
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { authUrl, exchangeCode, idTokenClaims, pkceChallenge, randomToken, type FetchFn } from "./google";
import { COOKIE_OPTIONS, SESSION_COOKIE, SESSION_TTL_SEC, encodeSession, nowSec } from "./session";
import { isRecord, signToken, verifyToken } from "./token";

/** Holds `state` and the PKCE verifier between /auth/login and /auth/callback. */
export const OAUTH_COOKIE = "imprint_oauth";
const OAUTH_TTL_SEC = 600;
const OAUTH_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, path: "/auth" } as const;

interface OAuthConfig {
  secret: string;
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  redirectUri: string;
}

function config(c: Context<AppEnv>): OAuthConfig | null {
  const { SESSION_SECRET: secret, GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = c.env;
  if (!secret || !clientId || !clientSecret) return null;
  const appOrigin = c.env.APP_ORIGIN ?? new URL(c.req.url).origin;
  return { secret, clientId, clientSecret, appOrigin, redirectUri: `${appOrigin}/auth/callback` };
}

async function pendingLogin(secret: string, raw: string | undefined): Promise<{ state: string; verifier: string } | null> {
  const p = raw ? await verifyToken(secret, raw) : null;
  if (!isRecord(p) || p.kind !== "oauth" || typeof p.exp !== "number" || p.exp <= nowSec()) return null;
  return typeof p.state === "string" && typeof p.verifier === "string" ? { state: p.state, verifier: p.verifier } : null;
}

/** Google sign-in (ADR 005): authorization code + PKCE; the result is our own session cookie. */
export function authRoutes(fetchFn: FetchFn): Hono<AppEnv> {
  const auth = new Hono<AppEnv>();

  auth.get("/login", async (c) => {
    const cfg = config(c);
    if (!cfg) return c.json({ error: "auth_not_configured" }, 500);
    const state = randomToken();
    const verifier = randomToken();
    const pending = await signToken(cfg.secret, { kind: "oauth", state, verifier, exp: nowSec() + OAUTH_TTL_SEC });
    setCookie(c, OAUTH_COOKIE, pending, { ...OAUTH_COOKIE_OPTIONS, maxAge: OAUTH_TTL_SEC });
    const challenge = await pkceChallenge(verifier);
    return c.redirect(authUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, challenge }), 302);
  });

  auth.get("/callback", async (c) => {
    const cfg = config(c);
    if (!cfg) return c.json({ error: "auth_not_configured" }, 500);
    const pending = await pendingLogin(cfg.secret, getCookie(c, OAUTH_COOKIE));
    deleteCookie(c, OAUTH_COOKIE, OAUTH_COOKIE_OPTIONS);
    const failed = () => c.redirect(`${cfg.appOrigin}/?login=failed`, 302);

    const code = c.req.query("code");
    if (!pending || !code || c.req.query("state") !== pending.state) return failed();
    try {
      const idToken = await exchangeCode(
        { code, verifier: pending.verifier, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri },
        fetchFn,
      );
      const who = idTokenClaims(idToken, cfg.clientId, nowSec());
      setCookie(c, SESSION_COOKIE, await encodeSession(cfg.secret, who), { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_SEC });
      return c.redirect(`${cfg.appOrigin}/`, 302);
    } catch (e) {
      console.warn("sign-in failed:", e instanceof Error ? e.message : String(e));
      return failed();
    }
  });

  auth.post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
    return c.json({ ok: true });
  });

  return auth;
}
```

`platform/apps/worker/src/app.ts` — take the fetch function and mount `/auth`:

```ts
import { ALL_TOOLS } from "@imprint/domain";
import { Hono } from "hono";
import { apiRoutes } from "./api/routes";
import type { FetchFn } from "./auth/google";
import { authRoutes } from "./auth/routes";
import type { AppEnv } from "./env";

/** `fetchFn` reaches Google's token endpoint; tests pass a fake. */
export function createApp(fetchFn: FetchFn = (input, init) => fetch(input, init)): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => c.json({ ok: true, tools: ALL_TOOLS.length }));
  app.route("/auth", authRoutes(fetchFn));
  app.route("/api", apiRoutes());

  /** API misses must never fall through to the SPA's index.html. */
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  /** Everything else is the web app (SPA fallback is configured on the assets binding). */
  app.all("*", (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

  return app;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -w @imprint/worker -- auth`
Expected: PASS (6 tests).

- [ ] **Step 5: Local secrets template and gitignore**

Append to `platform/.gitignore`:

```
.dev.vars
```

`platform/apps/worker/.dev.vars.example`:

```
# Copy to .dev.vars (gitignored) for `npm run dev`. Never commit real values.
# Google client: the DEV OAuth client (redirect URI http://localhost:5173/auth/callback registered on it).
SESSION_SECRET=local-dev-only-not-a-secret
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APP_ORIGIN=http://localhost:5173
```

Run: `git check-ignore -v platform/apps/worker/.dev.vars`
Expected: prints the `.gitignore` rule (the file is ignored).

- [ ] **Step 6: ADR 005**

`platform/docs/adr/005-auth-sessions.md`:

```markdown
# 005 — Вход через Google и сессии

**Статус:** принято · **Дата:** 2026-09-29

## Контекст
Платформа многопользовательская с первого дня (W2). Нужен вход без своих паролей, изоляция данных
по пользователю и сессия, которая переживает перезагрузку страницы (урок v1: токен в памяти
терялся). Позже (W5) тот же вход оборачивается OAuth-провайдером для MCP-клиентов.

## Решение
- Google OAuth 2.0, authorization code + PKCE (S256) **в воркере**: `/auth/login` → Google →
  `/auth/callback`. `state` и `code_verifier` живут 10 минут в подписанной cookie `imprint_oauth`
  (`Path=/auth`). Отдельные OAuth-клиенты для dev и prod; `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` —
  wrangler secrets своего окружения.
- `userId` = Google `sub`; объект пользователя — `idFromName(sub)`. Email хранится в сессии только
  если Google отметил его подтверждённым.
- ID-токен приходит напрямую с token endpoint по TLS, поэтому подпись не проверяется (OIDC Core
  §3.1.3.7); `iss`, `aud`, `exp` и `sub` проверяются всегда.
- Сессия — **без состояния на сервере**: cookie `imprint_session` = `base64url(JSON).HMAC-SHA256`
  с `kind: "session"`, `sub`, `email`, `exp` (30 дней). `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`. Ключ — wrangler secret `SESSION_SECRET`.
- Защита от CSRF: `SameSite=Lax` + изменения только `POST`/`DELETE`; WebSocket `/api/live` сверяет
  `Origin` с origin воркера или `APP_ORIGIN`.
- Каждый пользовательский маршрут требует сессию (`requireSession`), без неё — 401.
  `DELETE /api/account` → `deleteAll()` в объекте + удаление cookie; `POST /auth/logout` удаляет cookie.

## Последствия
- Никакой таблицы сессий: проверка — одна HMAC-операция, без обращения к хранилищу.
- Украденную cookie нельзя отозвать до `exp`; выход «везде» — только сменой `SESSION_SECRET`
  (выходят все). Пересмотреть, когда понадобится отзыв одной сессии (например, в W5 или W7).
- После удаления аккаунта старая cookie, если где-то сохранилась, откроет **пустой** объект —
  данных в нём нет.
- Локально `APP_ORIGIN=http://localhost:5173`: Vite проксирует `/auth` и `/api` на воркер, а
  redirect URI этого адреса зарегистрирован в dev-клиенте.
```

- [ ] **Step 7: README and CLAUDE.md**

In `platform/README.md`, append a section:

```markdown
## Вход через Google (настройка окружения)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID → Web application**,
   по клиенту на окружение:
   - **Imprint dev** — redirect URIs `https://imprint-dev.imprint-worker.workers.dev/auth/callback` и
     `http://localhost:5173/auth/callback`;
   - **Imprint prod** — `https://imprint-prod.imprint-worker.workers.dev/auth/callback`.
   Экран согласия: scopes `openid`, `email`.
2. Секреты (из `platform/apps/worker`, для prod — `--env prod`):
   `npx wrangler secret put GOOGLE_CLIENT_ID --env dev` · `… GOOGLE_CLIENT_SECRET --env dev` ·
   `… SESSION_SECRET --env dev` (значение: `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`).
3. Локально: скопируйте `apps/worker/.dev.vars.example` в `apps/worker/.dev.vars` и впишите данные
   dev-клиента. `.dev.vars` в git не попадает.

API: `GET /api/me` · `POST /api/tools/:name` → `{ result, rev }` · `GET /api/state` · WebSocket
`/api/live?conn=<id>` → `{ changed, rev }` · `DELETE /api/account`. Без сессии — 401.
```

In `platform/CLAUDE.md`, add to the `## Rules` list:

```markdown
- User data is reached only through `requireSession` → `idFromName(session.sub)`; never add an
  unauthenticated `/api/*` route. Tool calls go through `SqlStore.execute` (one transaction + `rev`).
- Worker tests: `isolatedStorage` is off — every test uses fresh ids (`newSub()`, `freshStub()`).
  Secrets live in wrangler secrets / `.dev.vars` (gitignored); tests use the fake bindings in `vitest.config.ts`.
```

- [ ] **Step 8: Full gate**

Run: `npm run check`
Expected: typecheck, lint, all tests (domain, worker, web), build — green.

- [ ] **Step 9: Commit**

```bash
git add platform/apps/worker/src/auth/routes.ts platform/apps/worker/src/app.ts platform/apps/worker/test/auth.test.ts platform/apps/worker/.dev.vars.example platform/.gitignore platform/docs/adr/005-auth-sessions.md platform/README.md platform/CLAUDE.md
git commit -m "platform: Google sign-in (code + PKCE) and ADR 005 sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web dev probe — sign-in, state, live reload

**Files:**
- Create: `platform/apps/web/src/account.ts`
- Modify: `platform/apps/web/src/App.tsx`, `platform/apps/web/vite.config.ts`
- Test: `platform/apps/web/src/account.test.ts`

**Interfaces:**
- Consumes: HTTP API of Tasks 5–6.
- Produces (`account.ts`): `type Me = { kind: "in"; sub: string; email: string | null } | { kind: "out" } | { kind: "down" }`, `fetchMe(fetchImpl?)`, `interface Snapshot { tasks: number; rev: number }`, `fetchSnapshot(fetchImpl?): Promise<Snapshot | null>`, `addProbeTask(conn: string, fetchImpl?): Promise<number | null>` (the new `rev`), `liveUrl(loc: { protocol: string; host: string }, conn: string): string`, `parseLive(data: unknown): number | null`. W4 replaces this probe with the real store.

- [ ] **Step 1: Write the failing tests**

`platform/apps/web/src/account.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addProbeTask, fetchMe, fetchSnapshot, liveUrl, parseLive } from "./account";

const respond = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const down = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

describe("fetchMe", () => {
  it("reads the signed-in user", async () => {
    expect(await fetchMe(respond(200, { sub: "g-1", email: "me@example.test" }))).toEqual({ kind: "in", sub: "g-1", email: "me@example.test" });
    expect(await fetchMe(respond(200, { sub: "g-1", email: null }))).toEqual({ kind: "in", sub: "g-1", email: null });
  });

  it("401 is signed out; 500, garbage or a network error is down — never a throw", async () => {
    expect(await fetchMe(respond(401, { error: "unauthorized" }))).toEqual({ kind: "out" });
    expect(await fetchMe(respond(500, {}))).toEqual({ kind: "down" });
    expect(await fetchMe(respond(200, "<html>"))).toEqual({ kind: "down" });
    expect(await fetchMe(down)).toEqual({ kind: "down" });
  });
});

describe("state and tools", () => {
  it("fetchSnapshot counts live tasks and reads rev", async () => {
    const body = { tasks: [{ deletedAt: null }, { deletedAt: 5 }, { deletedAt: null }], rev: 7 };
    expect(await fetchSnapshot(respond(200, body))).toEqual({ tasks: 2, rev: 7 });
    expect(await fetchSnapshot(respond(401, {}))).toBeNull();
    expect(await fetchSnapshot(down)).toBeNull();
  });

  it("addProbeTask posts add_task with the tab's conn id and returns the new rev", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const rev = await addProbeTask("tab-1", async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ result: { ok: true, changed: true }, rev: 3 }));
    });
    expect(rev).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/tools/add_task");
    expect(new Headers(calls[0].init?.headers).get("x-imprint-conn")).toBe("tab-1");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ where: "backlog" });
    expect(await addProbeTask("tab-1", respond(401, {}))).toBeNull();
  });
});

describe("live channel", () => {
  it("liveUrl follows the page's scheme", () => {
    expect(liveUrl({ protocol: "https:", host: "imprint.test" }, "a")).toBe("wss://imprint.test/api/live?conn=a");
    expect(liveUrl({ protocol: "http:", host: "localhost:5173" }, "a")).toBe("ws://localhost:5173/api/live?conn=a");
  });

  it("parseLive reads { changed, rev } and nothing else", () => {
    expect(parseLive('{"changed":true,"rev":4}')).toBe(4);
    expect(parseLive("pong")).toBeNull();
    expect(parseLive('{"rev":4}')).toBeNull();
    expect(parseLive(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -w @imprint/web`
Expected: FAIL — `Cannot find module './account'`.

- [ ] **Step 3: Implement `account.ts`**

`platform/apps/web/src/account.ts`:

```ts
/**
 * W2 dev probe: who is signed in, the server's task count + rev, and the live channel. W4 replaces
 * this with the real store (optimistic `runTool`, ADR 003). Nothing here throws.
 */

export type Me = { kind: "in"; sub: string; email: string | null } | { kind: "out" } | { kind: "down" };
export interface Snapshot {
  tasks: number;
  rev: number;
}
type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchImpl = (url, init) => fetch(url, init);

async function json(fetchImpl: FetchImpl, url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const r = await fetchImpl(url, init);
    return { status: r.status, body: r.ok ? ((await r.json()) as unknown) : null };
  } catch {
    return { status: 0, body: null };
  }
}

const record = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

export async function fetchMe(fetchImpl: FetchImpl = defaultFetch): Promise<Me> {
  const { status, body } = await json(fetchImpl, "/api/me");
  if (status === 401) return { kind: "out" };
  const b = record(body);
  if (!b || typeof b.sub !== "string") return { kind: "down" };
  return { kind: "in", sub: b.sub, email: typeof b.email === "string" ? b.email : null };
}

export async function fetchSnapshot(fetchImpl: FetchImpl = defaultFetch): Promise<Snapshot | null> {
  const b = record((await json(fetchImpl, "/api/state")).body);
  if (!b || !Array.isArray(b.tasks) || typeof b.rev !== "number") return null;
  return { tasks: b.tasks.filter((t) => record(t)?.deletedAt == null).length, rev: b.rev };
}

export async function addProbeTask(conn: string, fetchImpl: FetchImpl = defaultFetch): Promise<number | null> {
  const b = record(
    (
      await json(fetchImpl, "/api/tools/add_task", {
        method: "POST",
        headers: { "content-type": "application/json", "x-imprint-conn": conn },
        body: JSON.stringify({ title: `Проба ${new Date().toLocaleTimeString()}`, where: "backlog" }),
      })
    ).body,
  );
  return b && typeof b.rev === "number" ? b.rev : null;
}

export function liveUrl(loc: { protocol: string; host: string }, conn: string): string {
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/api/live?conn=${encodeURIComponent(conn)}`;
}

/** The rev of a `{ changed: true, rev }` push; null for anything else (e.g. "pong"). */
export function parseLive(data: unknown): number | null {
  if (typeof data !== "string") return null;
  try {
    const m = record(JSON.parse(data));
    return m && m.changed === true && typeof m.rev === "number" ? m.rev : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Wire the probe into `App.tsx` and the Vite proxy**

`platform/apps/web/src/App.tsx` — replace:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { addProbeTask, fetchMe, fetchSnapshot, liveUrl, parseLive, type Me, type Snapshot } from "./account";
import { fetchHealth, type Health } from "./health";
import { probeDomain } from "./probe";

/** One id per tab: the server skips this tab's own socket when it announces this tab's writes. */
const CONN = crypto.randomUUID();

export function App() {
  const [probe] = useState(probeDomain);
  const [health, setHealth] = useState<Health | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const seenRev = useRef(-1);

  const reload = useCallback(async () => {
    const s = await fetchSnapshot();
    if (s && s.rev > seenRev.current) {
      seenRev.current = s.rev;
      setSnap(s);
    }
  }, []);

  useEffect(() => {
    void fetchHealth().then(setHealth);
    void fetchMe().then(setMe);
  }, []);

  useEffect(() => {
    if (me?.kind !== "in") return;
    void reload();
    const ws = new WebSocket(liveUrl(window.location, CONN));
    ws.onmessage = (e) => {
      const rev = parseLive(e.data);
      if (rev !== null && rev > seenRev.current) void reload();
    };
    return () => ws.close();
  }, [me, reload]);

  const server = health === null ? "…" : health.ok ? `работает · ${health.tools} tools` : "сервер недоступен";
  const loginFailed = new URLSearchParams(window.location.search).get("login") === "failed";

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST" });
    setMe({ kind: "out" });
    setSnap(null);
  };

  return (
    <main>
      <h1>Imprint</h1>
      <p>
        Домен: {probe.tools} tools · add_task → День: {probe.dayCount}
      </p>
      <p>Сервер: {server}</p>
      {loginFailed && <p>Вход не удался.</p>}
      <p>
        Вход:{" "}
        {me === null ? "…" : me.kind === "out" ? (
          <a href="/auth/login">Войти через Google</a>
        ) : me.kind === "down" ? (
          "сервер недоступен"
        ) : (
          <>
            {me.email ?? me.sub} · <button onClick={() => void logout()}>Выйти</button>
          </>
        )}
      </p>
      {me?.kind === "in" && (
        <p>
          Задач: {snap?.tasks ?? "…"} · rev {snap?.rev ?? "…"} ·{" "}
          <button onClick={() => void addProbeTask(CONN).then(() => reload())}>Пробная задача</button>
        </p>
      )}
    </main>
  );
}
```

`platform/apps/web/vite.config.ts` — replace the `proxy` entry:

```ts
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true },
      "/auth": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
```

- [ ] **Step 5: Run the tests and the gate**

Run: `npm run test -w @imprint/web` → PASS (7 new + the existing `health`/`probe` tests).
Run: `npm run check` → green.

- [ ] **Step 6: Local smoke (only if the user has filled `apps/worker/.dev.vars`)**

Run `npm run dev` from `platform/` in the background; open http://localhost:5173 in the built-in browser. Expected without signing in: «Вход: Войти через Google». The user clicks it and signs in themselves; after that the page shows their email, «Задач: 0 · rev 0». Stop the dev servers (Windows: kill the whole process tree — see HISTORY W1 rakes). If `.dev.vars` is not filled, skip — Task 8 verifies on the live dev URL.

- [ ] **Step 7: Commit**

```bash
git add platform/apps/web/src/account.ts platform/apps/web/src/account.test.ts platform/apps/web/src/App.tsx platform/apps/web/vite.config.ts
git commit -m "platform: web dev probe — Google sign-in, state rev, live reload across tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Live in dev and phase close

**Files:**
- Modify: `imprint2.0/W2-server-hub.md`, `HISTORY.md`
- No code changes (a failure found here goes back to its task, with its own test and commit).

**Interfaces:**
- Consumes: everything above; the user's Google OAuth dev client and wrangler secrets.
- Produces: the live dev worker with sign-in; tag `web-w2`.

- [ ] **Step 1: The user creates the Google OAuth clients and sets the dev secrets**

Ask the user to follow `platform/README.md` → «Вход через Google»: create **Imprint dev** (and **Imprint prod**) Web clients, then from `platform/apps/worker` run:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --env dev
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET --env dev
```

```bash
npx wrangler secret put SESSION_SECRET --env dev
```

Wait for the user to confirm. Never type or paste these values yourself. (Prod secrets are set the same way with `--env prod` before the first `platform-v*` tag; record in HISTORY whether they are set.)

- [ ] **Step 2: Gate and deploy**

Run from `platform/`: `npm run check` → green. Then `npm run deploy:dev` → wrangler prints `https://imprint-dev.imprint-worker.workers.dev`.

- [ ] **Step 3: Verify the API without a session**

Run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://imprint-dev.imprint-worker.workers.dev/api/state
curl -s https://imprint-dev.imprint-worker.workers.dev/health
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://imprint-dev.imprint-worker.workers.dev/auth/login
```

Expected: `401`; `{"ok":true,"tools":19}` (the current catalog size); `302 https://accounts.google.com/o/oauth2/v2/auth?client_id=…`.

- [ ] **Step 4: Sign in and check live reload with two tabs**

Open https://imprint-dev.imprint-worker.workers.dev in the built-in browser. The **user** clicks «Войти через Google» and completes the Google sign-in themselves. Then:
1. The page shows the user's email and «Задач: N · rev R».
2. Open a second tab on the same URL (same session cookie).
3. In tab 1 click «Пробная задача». Expected: tab 1 shows `rev R+1`; **tab 2 updates to the same count and rev without a reload** (it got `{ changed, rev }` and re-read `/api/state`).
4. Screenshot both tabs as proof.

- [ ] **Step 5: Close the phase docs**

In `imprint2.0/W2-server-hub.md` tick every checkbox that is now true (A, B, C, «Готово, когда»). The «Вход через Google в dev работает с живого URL» box gets the URL, like W1's entry.

Add to the top of `HISTORY.md` (above the W1 entry), filled with what actually happened:

```markdown
## W2 — Server hub (closed YYYY-MM-DD, tag `web-w2`)

Tools run on the server in the user's Durable Object; Google sign-in; live «changed» to other tabs
([phase file](imprint2.0/W2-server-hub.md) · [plan](docs/superpowers/plans/2026-09-29-w2-server-hub.md)).

### What was built
- **Storage** — SQLite tables `tasks`/`groups`/`events` one to one with `types.ts`, `settings` (one JSON
  row), `meta` (`schemaVersion`, `rev`); migrations by `schemaVersion` on wake, each with a test.
- **`SqlStore`** — `ToolContext` over memory + a pending buffer; one `transactionSync` per call with
  `rev + 1`; throwing/failing tools and failed commits leave nothing; events loaded for a 35-day window.
- **`UserStore`** — RPC `callTool`/`getState`/`deleteAccount`; hibernatable `/api/live` with per-tab
  `conn` tags; `deleteAll()` closes sockets (4001).
- **Auth** — Google code + PKCE in the worker, stateless HMAC session cookie (ADR 005), `requireSession`
  on every user route, Origin check on the socket.
- **Web probe** — sign-in, task count + rev, live reload across tabs (W4 replaces it).
- **Live dev:** https://imprint-dev.imprint-worker.workers.dev — sign-in and two-tab reload verified.

### Rakes
- (one bullet per surprise actually hit during Tasks 1–8, as in the W1 entry; «none» if none)
```

Replace `YYYY-MM-DD` with the closing date and the rakes line with the real list.

- [ ] **Step 6: Commit and tag**

```bash
git add imprint2.0/W2-server-hub.md HISTORY.md
git commit -m "W2 closed: server hub live in dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag web-w2
```
