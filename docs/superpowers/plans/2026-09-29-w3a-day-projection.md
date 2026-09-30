# W3a — Day as a Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server computes the Day itself — from rows, the journal and the user's settings (zone, reset time) — without a mutating rollover, and `list_day` returns the same Day the v1 phone shows on the same data.

**Architecture:** A pure `time/` module turns instants into logical days in an explicit IANA zone (`Intl` only). A pure `day/` module folds the journal per task (`indexJournal`) and projects the Day and the Backlog for a given `today` (`projectDay`, `projectBacklog`, `locate`); nothing is written when the day turns over — "time never writes, actions write" (ADR 007). `ToolContext` gains `settings()`/`putSettings()`; tools decide by `locate()`, not by `location`. The worker's `SqlStore` keeps settings, derives `today` from them, and carries a "journal tail" (each task's last DONE/UNDONE older than the 35-day window) so "completed" is right for old tasks.

**Tech Stack:** TypeScript 5.9, zod 3, Vitest 3.2 (domain in Node; worker in `@cloudflare/vitest-pool-workers` on workerd), Cloudflare Durable Object SQLite (`ROW_NUMBER()` window function). No new npm dependencies.

**Spec:** [docs/superpowers/specs/2026-09-29-w3-domain-design.md](../specs/2026-09-29-w3-domain-design.md) (sections «W3a — День как проекция», «Тесты», «ADR») · phase [imprint2.0/W3-domain.md](../../../imprint2.0/W3-domain.md) · v1 sources: `app/src/main/java/com/imprint/app/domain/{LogicalDay,DayAssembly,Rollover,Completion}.kt`, `ChecklistRepository.buildDay` / `moveToDayToday` / `notToday` / `setDueDate` / `setRepeating`.

## Global Constraints

- All paths are relative to the repo root. Run platform commands from `platform/` with the Bash tool (`npm run …`), or `npm.cmd` in PowerShell.
- **Never touch** `web/` (frozen) or `app/` (v1 is read-only reference).
- **Existing tests:** never modify or delete without approval. **Approved for W3a (2026-09-29):** the `list_day` case in `platform/packages/domain/src/tools/queries.test.ts` (Task 5), the `skipped_today` case in `platform/packages/domain/src/tools/tasks-move.test.ts` (Task 5), the «todayKey is the UTC day until W3a» case in `platform/apps/worker/test/sqlStore.test.ts` (Task 2), and **adding** entries to `SAMPLES` in `platform/packages/domain/src/tools/contract.test.ts` (Task 2). Adding new `it(...)` cases to existing files and new test files is fine. Anything else that turns red is a bug in the change — fix the code, not the test.
- `packages/domain` stays pure (`purity.test.ts`): no `window`, `document`, `process`, `node:` imports, Cloudflare or React in non-test files. `Intl` is standard JS and allowed.
- **Time (P5):** tools read "today" and dates only through `time/` with `ctx.settings()`. No `startOfDayMillis`, `todayDayKey`, `windowStartKey` or `new Date()` getters in `tools/*.ts` (pinned by `tools/time-source.test.ts`, Task 5). `compose.ts`/`completion.ts` keep those functions for their existing tests.
- Server default settings: `{ timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" }`. `memoryContext` default: host zone, reset `00:00` (keeps W0 tests' dates equal to `startOfDayMillis`).
- `dueDate` encodes a calendar date as **local midnight in the user's zone** (`dateStart`); `enteredDayAt` of a moved-in task is the **logical day start** (`dayStart`, the reset moment).
- Tool results are data (`ToolResult`), never exceptions. New tools follow `tools/define.ts`.
- Non-test files ≤ 300 lines (eslint `max-lines`, blank lines and comments skipped).
- Worker tests: `isolatedStorage` is off — every test uses a fresh object (`withStorage`, `newSub()`).
- Commit only the paths each task lists. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gate per task: `npm run check` from `platform/` is green before the commit.

## Review Focus

1. **A reset inside the repeated hour of a fall-back night** (reset 01:30 in `America/Los_Angeles` on 2026-11-01). Expected: once the day turns over it never flips back during the second 01:00–01:59. Pinned in Task 1 (`time/day.test.ts`).
2. **Two DONE/UNDONE for one task at the same millisecond from two devices.** Expected: a deterministic winner by `(at, deviceId, id)`. Pinned for the projection in Task 3 (`day/journal.test.ts`); the SQL tail in Task 6 orders by the same keys (device ids are ASCII, so SQLite's binary order and `localeCompare` agree).
3. **A corrupted or hand-edited settings row** (bad JSON, unknown zone, `resetHour: 99`). Expected: defaults apply, tools keep working, no 500. Pinned in Task 2 (`sqlStore.test.ts`).
4. **«Not today» on a routine that is not in today's list** (off-cadence or already skipped). Expected: `already_in_backlog`, no phantom `SKIPPED` event. Pinned in Task 5 (`tools/placement.test.ts`).
5. **A task finished more than 35 days ago, after the object woke up.** Expected: it stays finished (not back in the Day as open). Pinned in Task 6 (`sqlStore.test.ts`).

---

## File Structure

| File | Responsibility |
|---|---|
| `platform/packages/domain/src/time/settings.ts` | `UserSettings`, defaults, `parseSettings`, `isTimeZone`, `LANGUAGES` |
| `platform/packages/domain/src/time/zone.ts` | Wall clock ⇄ instant in an IANA zone via `Intl` (`wallClock`, `instantOf`) |
| `platform/packages/domain/src/time/day.ts` | `logicalDayKey`, `dayStart`, `dateStart`, `dueKey`, `addDays`, `weekday` |
| `platform/packages/domain/src/time/index.ts` | Barrel |
| `platform/packages/domain/src/day/journal.ts` | `indexJournal` (per-task marks), `byJournalOrder`, `journalTail` |
| `platform/packages/domain/src/day/project.ts` | `projectDay`, `projectBacklog`, `locate`, `orderDay`, `doneToday`, `isCompleted` |
| `platform/packages/domain/src/day/fixtures.ts` | Test-only world/settings helpers for `day/*` tests |
| `platform/packages/domain/src/day/index.ts` | Barrel |
| `platform/packages/domain/src/tools/context.ts` (modify) | `settings()`, `putSettings()` |
| `platform/packages/domain/src/tools/memoryContext.ts` (modify) | `settings`, `clock` options; computed `todayKey` |
| `platform/packages/domain/src/tools/settings.ts` | `set_user_settings`, `get_user_settings` |
| `platform/packages/domain/src/tools/support.ts` (modify) | Time/projection helpers for tools (`todayStart`, `dateMillis`, `marksToday`, `locateTask`, `isDoneToday`) |
| `platform/packages/domain/src/tools/tasks-move.ts` | `move_to_day`, `move_to_backlog`, `set_due_date`, `set_repeating` on the projection |
| `platform/packages/domain/src/tools/tasks.ts` (modify) | Remaining task tools; `TASK_TOOLS` |
| `platform/packages/domain/src/tools/queries.ts` (modify) | `list_day` / `list_backlog` = projections |
| `platform/packages/domain/src/tools/index.ts` (modify) | `ALL_TOOLS` + settings tools |
| `platform/packages/domain/src/index.ts` (modify) | Export `time/`, `day/` |
| `platform/apps/worker/src/store/rows.ts` (modify) | `writeSettings`, `loadTail` |
| `platform/apps/worker/src/store/schema.ts` (modify) | Migration 2: index `events(taskId)` |
| `platform/apps/worker/src/store/sqlStore.ts` (modify) | Settings, logical `today`, pending settings, journal tail in memory and `snapshot()` |
| `platform/docs/adr/007-day-projection.md` | ADR 007 |

---

### Task 1: `time/` — settings and the logical day in an explicit zone

**Files:**
- Create: `platform/packages/domain/src/time/settings.ts`, `platform/packages/domain/src/time/zone.ts`, `platform/packages/domain/src/time/day.ts`, `platform/packages/domain/src/time/index.ts`
- Modify: `platform/packages/domain/src/index.ts`
- Test: `platform/packages/domain/src/time/settings.test.ts`, `platform/packages/domain/src/time/day.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface UserSettings { timezone: string; resetHour: number; resetMinute: number; language: Language }`, `type Language = "ru" | "en"`, `LANGUAGES`, `DEFAULT_USER_SETTINGS`, `parseSettings(raw: unknown): UserSettings`, `isTimeZone(v: unknown): v is string`
  - `wallClock(at: number, timeZone: string): Wall`, `instantOf(dateKey: string, hour: number, minute: number, timeZone: string): number`
  - `logicalDayKey(at: number, s: UserSettings): string`, `dayStart(key: string, s: UserSettings): number`, `dateStart(key: string, s: UserSettings): number`, `dueKey(millis: number, s: UserSettings): string`, `addDays(key: string, n: number): string`, `weekday(key: string): number` (0 = Monday … 6 = Sunday)

- [ ] **Step 1: Write the failing settings test**

`platform/packages/domain/src/time/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS, isTimeZone, parseSettings } from "./settings";

describe("parseSettings (P7)", () => {
  it("anything that is not an object gives the defaults", () => {
    for (const raw of [undefined, null, "x", 42, [1, 2]]) expect(parseSettings(raw)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it("the defaults are UTC, a 04:00 reset and Russian", () => {
    expect(parseSettings({})).toEqual({ timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" });
  });

  it("keeps valid fields and drops unknown ones", () => {
    expect(parseSettings({ timezone: "Europe/Moscow", resetHour: 2, resetMinute: 30, language: "en", theme: "dark" })).toEqual({
      timezone: "Europe/Moscow",
      resetHour: 2,
      resetMinute: 30,
      language: "en",
    });
  });

  it("replaces each invalid field with its default and keeps the rest", () => {
    expect(parseSettings({ timezone: "Mars/Olympus", resetHour: 24, resetMinute: 1.5, language: "de" })).toEqual(DEFAULT_USER_SETTINGS);
    expect(parseSettings({ timezone: "Asia/Tokyo", resetHour: "7" })).toEqual({ ...DEFAULT_USER_SETTINGS, timezone: "Asia/Tokyo" });
  });
});

describe("isTimeZone", () => {
  it("knows IANA zones and fixed offsets and rejects the rest", () => {
    expect(["UTC", "Europe/Moscow", "America/Los_Angeles", "Etc/GMT+8"].every(isTimeZone)).toBe(true);
    expect(["", "Mars/Olympus", 3, null].some(isTimeZone)).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing day test**

`platform/packages/domain/src/time/day.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, dateStart, dayStart, dueKey, logicalDayKey, weekday } from "./day";
import type { UserSettings } from "./settings";
import { instantOf } from "./zone";

const zone = (timezone: string, resetHour = 4, resetMinute = 0): UserSettings => ({ timezone, resetHour, resetMinute, language: "ru" });
const UTC = zone("UTC");
const MSK = zone("Europe/Moscow"); // UTC+3, no DST
const LA = zone("America/Los_Angeles"); // UTC−7 in September, UTC−8 in winter

describe("logicalDayKey (SPEC §4.3, LogicalDay.dateOf)", () => {
  it("before the reset belongs to the previous day, in the user's zone", () => {
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 3, 59), UTC)).toBe("2026-09-28");
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 4, 0), UTC)).toBe("2026-09-29");
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 0, 59), MSK)).toBe("2026-09-28"); // 03:59 MSK
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 1, 0), MSK)).toBe("2026-09-29"); // 04:00 MSK
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 10, 59), LA)).toBe("2026-09-28"); // 03:59 PDT
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 11, 0), LA)).toBe("2026-09-29"); // 04:00 PDT
  });

  it("honours reset minutes and a midnight reset", () => {
    const halfPast = zone("Europe/Moscow", 4, 30);
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 1, 29), halfPast)).toBe("2026-09-28"); // 04:29 MSK
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 1, 30), halfPast)).toBe("2026-09-29");
    expect(logicalDayKey(Date.UTC(2026, 8, 28, 23, 59), zone("UTC", 0))).toBe("2026-09-28");
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 0, 0), zone("UTC", 0))).toBe("2026-09-29");
  });

  it("the same instant is a different day in different zones", () => {
    const at = Date.UTC(2026, 8, 29, 2, 0); // 05:00 MSK · 02:00 UTC · 19:00 PDT the day before
    expect([logicalDayKey(at, MSK), logicalDayKey(at, UTC), logicalDayKey(at, LA)]).toEqual(["2026-09-29", "2026-09-28", "2026-09-28"]);
  });

  it("in the repeated hour of a fall-back night the day does not flip back", () => {
    // 2026-11-01 in LA: 01:00–01:59 happens twice (PDT, then PST). Reset at 01:30.
    const s = zone("America/Los_Angeles", 1, 30);
    expect(logicalDayKey(Date.UTC(2026, 10, 1, 8, 29), s)).toBe("2026-10-31"); // 01:29 PDT
    expect(logicalDayKey(Date.UTC(2026, 10, 1, 8, 30), s)).toBe("2026-11-01"); // 01:30 PDT — the reset
    expect(logicalDayKey(Date.UTC(2026, 10, 1, 9, 0), s)).toBe("2026-11-01"); // 01:00 PST, second pass
  });
});

describe("dayStart / dateStart", () => {
  it("dayStart is the reset moment of that date in the zone", () => {
    expect(dayStart("2026-09-29", UTC)).toBe(Date.UTC(2026, 8, 29, 4, 0));
    expect(dayStart("2026-09-29", MSK)).toBe(Date.UTC(2026, 8, 29, 1, 0));
    expect(dayStart("2026-09-29", LA)).toBe(Date.UTC(2026, 8, 29, 11, 0));
  });

  it("dateStart is local midnight — the dueDate encoding (DueDates.startOfDay)", () => {
    expect(dateStart("2026-09-29", MSK)).toBe(Date.UTC(2026, 8, 28, 21, 0));
    expect(dateStart("2026-09-29", LA)).toBe(Date.UTC(2026, 8, 29, 7, 0));
  });

  it("a reset inside the spring-forward gap is the first moment after it", () => {
    // 2026-03-08 in LA: 02:00 PST jumps to 03:00 PDT.
    const s = zone("America/Los_Angeles", 2, 30);
    expect(dayStart("2026-03-08", s)).toBe(Date.UTC(2026, 2, 8, 10, 0));
    expect(logicalDayKey(Date.UTC(2026, 2, 8, 9, 59), s)).toBe("2026-03-07"); // 01:59 PST
  });

  it("a wall time inside the fall-back overlap is its first occurrence", () => {
    expect(instantOf("2026-11-01", 1, 30, "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 1, 8, 30));
  });
});

describe("dueKey", () => {
  it("reads a stored date back in the same zone", () => {
    expect(dueKey(dateStart("2026-10-05", MSK), MSK)).toBe("2026-10-05");
    expect(dueKey(dateStart("2026-10-05", LA), LA)).toBe("2026-10-05");
  });

  it("a date set in one zone keeps its day after a move to another", () => {
    expect(dueKey(dateStart("2026-10-05", MSK), LA)).toBe("2026-10-05");
    expect(dueKey(dateStart("2026-10-05", LA), MSK)).toBe("2026-10-05");
  });

  it("a v1 date stamped at the reset moment reads as that date", () => {
    expect(dueKey(dayStart("2026-10-05", MSK), MSK)).toBe("2026-10-05");
  });
});

describe("addDays / weekday", () => {
  it("steps across months, years and DST without the runtime zone", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-09-28", -34)).toBe("2026-08-25");
  });

  it("weekday is RecurrenceMask's bit index: 0 = Monday … 6 = Sunday", () => {
    expect(weekday("2026-09-28")).toBe(0);
    expect(weekday("2026-01-15")).toBe(3);
    expect(weekday("2026-10-04")).toBe(6);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run (from `platform/`): `npm run test -w @imprint/domain -- src/time`
Expected: FAIL — `Failed to resolve import "./settings"` / `"./day"`.

- [ ] **Step 4: Implement `time/settings.ts`**

```ts
/**
 * The user's settings (SPEC §4.3, P5): the zone and reset time that define the logical day, and the
 * interface language. The server stores them as one JSON row; `parseSettings` turns whatever is stored
 * (or nothing) into a full value, so the server and the browser apply the same defaults (P7).
 */

export const LANGUAGES = ["ru", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export interface UserSettings {
  /** IANA zone, e.g. "Europe/Moscow". */
  timezone: string;
  /** When the logical day turns over (SPEC §4.3, default 04:00). */
  resetHour: number;
  resetMinute: number;
  language: Language;
}

export const DEFAULT_USER_SETTINGS: UserSettings = { timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" };

/** True for a zone the runtime's `Intl` knows. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Stored JSON → full settings: unknown fields are dropped, an invalid field takes its default. */
export function parseSettings(raw: unknown): UserSettings {
  const r = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_USER_SETTINGS;
  return {
    timezone: isTimeZone(r.timezone) ? r.timezone : d.timezone,
    resetHour: intIn(r.resetHour, 0, 23) ? r.resetHour : d.resetHour,
    resetMinute: intIn(r.resetMinute, 0, 59) ? r.resetMinute : d.resetMinute,
    language: LANGUAGES.includes(r.language as Language) ? (r.language as Language) : d.language,
  };
}
```

- [ ] **Step 5: Implement `time/zone.ts`**

```ts
/**
 * Wall clock ⇄ instant in an IANA zone, through `Intl` only — never the runtime's own zone (P5). The
 * server runs in UTC, browsers in whatever zone the machine has; both must compute the same day.
 */

const MINUTE = 60_000;
const HALF_DAY = 12 * 60 * MINUTE;

export interface Wall {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock in `timeZone` at the instant `at` (epoch ms). */
export function wallClock(at: number, timeZone: string): Wall {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(at)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/** The wall clock at `at`, read as if it were UTC — so `wallMs(at) - at` is the zone's offset then. */
function wallMs(at: number, timeZone: string): number {
  const w = wallClock(at, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

function offsetAt(at: number, timeZone: string): number {
  return wallMs(at, timeZone) - Math.floor(at / 1000) * 1000;
}

/**
 * The instant when the wall clock in `timeZone` shows `dateKey hour:minute`. A time that happens twice
 * (fall-back overlap) gives its first occurrence; a time that never happens (spring-forward gap) gives
 * the first instant after the gap.
 */
export function instantOf(dateKey: string, hour: number, minute: number, timeZone: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour, minute);
  // The offset before and after any transition near the target.
  const candidates = [target - offsetAt(target - HALF_DAY, timeZone), target - offsetAt(target + HALF_DAY, timeZone)];
  const exact = candidates.filter((c) => wallMs(c, timeZone) === target);
  if (exact.length > 0) return Math.min(...exact);
  // In a gap: the first minute whose wall clock is past the target.
  let lo = Math.min(...candidates);
  let hi = Math.max(...candidates);
  while (hi - lo > MINUTE) {
    const mid = lo + Math.max(MINUTE, Math.floor((hi - lo) / 2 / MINUTE) * MINUTE);
    if (wallMs(mid, timeZone) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}
```

- [ ] **Step 6: Implement `time/day.ts`**

```ts
import type { UserSettings } from "./settings";
import { instantOf, wallClock } from "./zone";

/**
 * The logical day (SPEC §4.3, `LogicalDay.kt`): the span between two resets, in the user's zone. Keys
 * are `YYYY-MM-DD`; date arithmetic is done on keys through UTC, so no runtime zone leaks in.
 */

const HALF_DAY = 12 * 60 * 60_000;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const keyOf = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday — the bit index of `RecurrenceMask`. */
export function weekday(key: string): number {
  const [y, m, d] = parts(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The instant the logical day `key` begins: its reset time in the user's zone. */
export function dayStart(key: string, s: UserSettings): number {
  return instantOf(key, s.resetHour, s.resetMinute, s.timezone);
}

/** Local midnight of a calendar date in the user's zone — how `dueDate` is stored (`DueDates.startOfDay`). */
export function dateStart(key: string, s: UserSettings): number {
  return instantOf(key, 0, 0, s.timezone);
}

/**
 * The logical day at `at`: the date on the user's wall clock, or the one before when `at` is earlier than
 * that date's reset. Instants are compared (not wall times), so the day never flips back in a repeated hour.
 */
export function logicalDayKey(at: number, s: UserSettings): string {
  const w = wallClock(at, s.timezone);
  const key = keyOf(w.year, w.month, w.day);
  return at < dayStart(key, s) ? addDays(key, -1) : key;
}

/**
 * The calendar date a stored `dueDate` stands for: the date whose midnight is nearest to it. A date set in
 * one zone keeps its day after the user moves to another (offsets differ by less than 12 h), and a v1 date
 * stamped at the reset moment reads as its date too.
 */
export function dueKey(millis: number, s: UserSettings): string {
  const w = wallClock(millis + HALF_DAY, s.timezone);
  return keyOf(w.year, w.month, w.day);
}
```

- [ ] **Step 7: Barrels**

`platform/packages/domain/src/time/index.ts`:

```ts
export * from "./settings";
export * from "./day";
export { instantOf, wallClock, type Wall } from "./zone";
```

In `platform/packages/domain/src/index.ts`, after `export * from "./draft";` add:

```ts
export * from "./time/index";
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test -w @imprint/domain -- src/time`
Expected: PASS (2 files).

- [ ] **Step 9: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/packages/domain/src/time platform/packages/domain/src/index.ts
git commit -m "domain: time/ — user settings and the logical day in an explicit zone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings in the tool context (domain + worker)

**Files:**
- Create: `platform/packages/domain/src/tools/settings.ts`
- Modify: `platform/packages/domain/src/tools/context.ts`, `platform/packages/domain/src/tools/memoryContext.ts`, `platform/packages/domain/src/tools/index.ts`, `platform/packages/domain/src/tools/contract.test.ts` (add two `SAMPLES` entries — approved), `platform/apps/worker/src/store/rows.ts`, `platform/apps/worker/src/store/sqlStore.ts`, `platform/apps/worker/test/sqlStore.test.ts` (replace one approved case, add new cases)
- Test: `platform/packages/domain/src/tools/settings.test.ts`

**Interfaces:**
- Consumes: `UserSettings`, `DEFAULT_USER_SETTINGS`, `LANGUAGES`, `isTimeZone`, `parseSettings`, `logicalDayKey`, `addDays` (Task 1).
- Produces:
  - `ToolContext.settings(): UserSettings`, `ToolContext.putSettings(s: UserSettings): void`
  - `MemoryOptions.clock?: () => number`, `MemoryOptions.settings?: Partial<UserSettings>`; `hostTimeZone(): string` (exported from `tools/memoryContext.ts`)
  - tools `set_user_settings { timezone?, resetHour?, resetMinute?, language? }` → `{ settings }`; `get_user_settings {}` → `{ settings, today }`
  - worker: `writeSettings(sql, settings: object): void`; `SqlStore` today = `logicalDayKey(read(), settings)`

- [ ] **Step 1: Write the failing domain test**

`platform/packages/domain/src/tools/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { UserSettings } from "../time/settings";
import { ok } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };

describe("set_user_settings", () => {
  it("patches only the given fields", () => {
    const ctx = memoryContext({ settings: MSK });
    const r = ok(runTool(ctx, "set_user_settings", { resetHour: 2, language: "en" }));
    expect(r).toMatchObject({ changed: true, settings: { timezone: "Europe/Moscow", resetHour: 2, resetMinute: 0, language: "en" } });
    expect(ctx.settings()).toEqual(r.settings);
  });

  it("the same values, or no fields at all, are same_value", () => {
    const ctx = memoryContext({ settings: MSK });
    expect(runTool(ctx, "set_user_settings", { timezone: "Europe/Moscow" })).toMatchObject({ changed: false, reason: "same_value" });
    expect(runTool(ctx, "set_user_settings", {})).toMatchObject({ changed: false, reason: "same_value" });
  });

  it("an unknown zone or an out-of-range hour is invalid_input and changes nothing", () => {
    const ctx = memoryContext({ settings: MSK });
    expect(runTool(ctx, "set_user_settings", { timezone: "Mars/Olympus" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(runTool(ctx, "set_user_settings", { resetHour: 24 })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(ctx.settings()).toEqual(MSK);
  });

  it("a new reset hour moves today at once (ADR 007)", () => {
    // 03:00 MSK on the 29th: with a 04:00 reset it is still the 28th; with 02:00 it is the 29th.
    const ctx = memoryContext({ clock: () => Date.UTC(2026, 8, 29, 0, 0), settings: MSK });
    expect(ctx.todayKey()).toBe("2026-09-28");
    ok(runTool(ctx, "set_user_settings", { resetHour: 2 }));
    expect(ctx.todayKey()).toBe("2026-09-29");
  });
});

describe("get_user_settings", () => {
  it("returns the settings and today's logical day", () => {
    const ctx = memoryContext({ clock: () => Date.UTC(2026, 8, 29, 2, 0), settings: MSK }); // 05:00 MSK
    expect(ok(runTool(ctx, "get_user_settings", {}))).toMatchObject({ changed: false, settings: MSK, today: "2026-09-29" });
  });
});

describe("memoryContext time", () => {
  it("defaults to the host zone and a midnight reset, so today is the local calendar day", () => {
    const ctx = memoryContext();
    expect(ctx.settings()).toMatchObject({ resetHour: 0, resetMinute: 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    expect(ctx.todayKey()).toBe("2026-09-28");
  });

  it("with a clock, now() follows it without repeating and today moves with it", () => {
    let wall = Date.UTC(2026, 8, 28, 10, 0);
    const ctx = memoryContext({ clock: () => wall, settings: { timezone: "UTC", resetHour: 4 } });
    expect([ctx.now(), ctx.now()]).toEqual([wall, wall + 1]);
    expect(ctx.todayKey()).toBe("2026-09-28");
    wall = Date.UTC(2026, 8, 29, 5, 0);
    expect(ctx.now()).toBe(wall);
    expect(ctx.todayKey()).toBe("2026-09-29");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @imprint/domain -- src/tools/settings.test.ts`
Expected: FAIL — `unknown_tool` for `set_user_settings` and `ctx.settings is not a function`.

- [ ] **Step 3: Extend `ToolContext`**

In `platform/packages/domain/src/tools/context.ts` add the import and replace the `todayKey` member:

```ts
import type { UserSettings } from "../time/settings";
```

```ts
  /** The logical day, YYYY-MM-DD: `logicalDayKey(now, settings())` unless a test pins it. */
  todayKey(): string;
  /** The user's settings — the only source of the zone and reset time (P5). */
  settings(): UserSettings;
  /** Replace the settings; only `set_user_settings` writes them. */
  putSettings(settings: UserSettings): void;
```

- [ ] **Step 4: Rewrite `memoryContext.ts`**

```ts
import { draftToSnapshot, type Draft } from "../draft";
import { mergeSnapshots } from "../merge";
import { logicalDayKey } from "../time/day";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../time/settings";
import type { BackupData } from "../types";
import type { ToolContext } from "./context";
import { monotonicClock } from "./support";

export interface MemoryContext extends ToolContext {
  /** What this peer wrote — inspect it in tests; a Node MCP server would persist it. */
  readonly draft: Draft;
}

export interface MemoryOptions {
  peers?: BackupData[];
  /** First `now()`; each later call returns +1ms. Default 2026-09-28 12:00 local. Ignored with `clock`. */
  start?: number;
  /** A wall clock read by every `now()` (kept strictly increasing) and by `todayKey()` — walks a test through days. */
  clock?: () => number;
  /** Pin the logical day; otherwise it is `logicalDayKey` of the clock in `settings`. */
  todayKey?: string;
  /** Default: the host's zone and a midnight reset, so dates equal the pre-W3 `startOfDayMillis`. */
  settings?: Partial<UserSettings>;
  deviceId?: string;
}

/** The runtime's own zone — only a test default; tools never read it. */
export function hostTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** An in-memory ToolContext: fixed peers, a private draft, a deterministic clock. */
export function memoryContext(opts: MemoryOptions = {}): MemoryContext {
  const peers = opts.peers ?? [];
  const draft: Draft = { tasks: [], groups: [], events: [] };
  const start = opts.start ?? new Date(2026, 8, 28, 12, 0, 0).getTime();
  let tick = start;
  const now = opts.clock ? monotonicClock(opts.clock) : () => tick++;
  const wall = opts.clock ?? (() => start);
  let settings: UserSettings = { ...DEFAULT_USER_SETTINGS, timezone: hostTimeZone(), resetHour: 0, resetMinute: 0, ...opts.settings };

  function upsert<T extends { id: string }>(list: T[], row: T): void {
    const i = list.findIndex((r) => r.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
  }

  return {
    draft,
    deviceId: opts.deviceId ?? "web-test",
    state: () => mergeSnapshots([...peers, draftToSnapshot(draft)]),
    upsertTask: (t) => upsert(draft.tasks, t),
    upsertGroup: (g) => upsert(draft.groups, g),
    appendEvent: (e) => void draft.events.push(e),
    now,
    todayKey: () => opts.todayKey ?? logicalDayKey(wall(), settings),
    settings: () => settings,
    putSettings: (s) => {
      settings = s;
    },
  };
}
```

- [ ] **Step 5: Create `tools/settings.ts`**

```ts
import { z } from "zod";
import { LANGUAGES, isTimeZone, type UserSettings } from "../time/settings";
import { defineTool, type ToolDef } from "./define";
import { changed, found, unchanged } from "./result";

/** Settings tools (SPEC §4.3, P5): the zone and reset time decide what "today" is for every other tool. */

export const setUserSettings = defineTool({
  name: "set_user_settings",
  description:
    "Change the user's settings: timezone (IANA name, e.g. Europe/Moscow), resetHour/resetMinute (when the logical day " +
    "turns over, default 04:00) and language (ru or en). Fields left out stay as they are; past events keep their day.",
  input: z.object({
    timezone: z.string().refine(isTimeZone, "unknown time zone").optional(),
    resetHour: z.number().int().min(0).max(23).optional(),
    resetMinute: z.number().int().min(0).max(59).optional(),
    language: z.enum(LANGUAGES).optional(),
  }),
  run(ctx, i) {
    const current = ctx.settings();
    const next: UserSettings = {
      timezone: i.timezone ?? current.timezone,
      resetHour: i.resetHour ?? current.resetHour,
      resetMinute: i.resetMinute ?? current.resetMinute,
      language: i.language ?? current.language,
    };
    const same = (Object.keys(next) as (keyof UserSettings)[]).every((k) => next[k] === current[k]);
    if (same) return unchanged("same_value", { settings: current });
    ctx.putSettings(next);
    return changed({ settings: next });
  },
});

export const getUserSettings = defineTool({
  name: "get_user_settings",
  description: "Read the user's settings (timezone, reset time, language) and today's logical day as YYYY-MM-DD.",
  input: z.object({}),
  run: (ctx) => found({ settings: ctx.settings(), today: ctx.todayKey() }),
});

export const SETTINGS_TOOLS: ToolDef[] = [setUserSettings, getUserSettings];
```

- [ ] **Step 6: Register the tools and their contract samples**

In `platform/packages/domain/src/tools/index.ts`:

```ts
import { SETTINGS_TOOLS } from "./settings";
```

```ts
export const ALL_TOOLS: ToolDef[] = [...TASK_TOOLS, ...GROUP_TOOLS, ...QUERY_TOOLS, ...SETTINGS_TOOLS];
```

In `platform/packages/domain/src/tools/contract.test.ts` (approved: add entries only), after `list_groups: {},` add:

```ts
  set_user_settings: { resetHour: 5 },
  get_user_settings: {},
```

- [ ] **Step 7: Run the domain tests**

Run: `npm run test -w @imprint/domain`
Expected: PASS (all files, including `contract.test.ts` and the untouched W0 tests).

- [ ] **Step 8: Write the failing worker tests**

In `platform/apps/worker/test/sqlStore.test.ts` **replace** the approved case `it("todayKey is the UTC day until W3a", …)` with:

```ts
  it("todayKey is the logical day in the user's zone and reset hour (default UTC, 04:00)", () =>
    withStorage((storage) => {
      new SqlStore(storage, at(Date.UTC(2026, 8, 29, 3, 30))).execute("add_task", { title: "Before reset", where: "day" });
      new SqlStore(storage, at(Date.UTC(2026, 8, 29, 4, 30))).execute("add_task", { title: "After reset", where: "day" });
      const moscow = new SqlStore(storage, at(Date.UTC(2026, 8, 29, 0, 30))); // 03:30 MSK
      moscow.execute("set_user_settings", { timezone: "Europe/Moscow" });
      moscow.execute("add_task", { title: "Moscow night", where: "day" });
      const days = Object.fromEntries(
        moscow.snapshot().events.filter((e) => e.type === "CREATED").map((e) => [e.title, e.dayKey]),
      );
      expect(days).toEqual({ "Before reset": "2026-09-28", "After reset": "2026-09-29", "Moscow night": "2026-09-28" });
    }));
```

and add, inside the same `describe`:

```ts
  it("set_user_settings commits with rev, survives a wake, and a repeat changes nothing", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      expect(s.execute("set_user_settings", { timezone: "Asia/Tokyo", resetHour: 5 })).toMatchObject({ rev: 1, committed: true });
      expect(s.execute("set_user_settings", { timezone: "Asia/Tokyo" })).toMatchObject({ rev: 1, committed: false });
      const woken = new SqlStore(storage, at(NOON_UTC));
      expect(woken.snapshot().settings).toEqual({ timezone: "Asia/Tokyo", resetHour: 5, resetMinute: 0, language: "ru" });
      expect(woken.execute("get_user_settings", {}).result).toMatchObject({ settings: { timezone: "Asia/Tokyo" }, today: "2026-09-28" });
    }));

  it("a corrupted settings row falls back to the defaults and tools keep working", () =>
    withStorage((storage) => {
      new SqlStore(storage, at(NOON_UTC)); // runs the migrations
      storage.sql.exec(`INSERT INTO "settings" ("id", "value") VALUES (1, '{"timezone":"Mars/Olympus","resetHour":99')`);
      const s = new SqlStore(storage, at(NOON_UTC));
      expect(s.execute("get_user_settings", {}).result).toMatchObject({ settings: { timezone: "UTC", resetHour: 4 } });
      expect(s.execute("add_task", { title: "Still fine", where: "day" }).result).toMatchObject({ ok: true, changed: true });
    }));
```

- [ ] **Step 9: Run them to verify they fail**

Run: `npm run test -w @imprint/worker -- test/sqlStore.test.ts`
Expected: FAIL — typecheck of `SqlStore.context` (missing `settings`/`putSettings`) or `unknown_tool` for `set_user_settings` results not committing.

- [ ] **Step 10: Add `writeSettings` to `rows.ts`**

After `readSettings` in `platform/apps/worker/src/store/rows.ts`:

```ts
/** Replace the settings row (`id = 1`) with `settings` as JSON. */
export function writeSettings(sql: SqlStorage, settings: object): void {
  sql.exec(
    `INSERT INTO "settings" ("id", "value") VALUES (1, ?) ON CONFLICT("id") DO UPDATE SET "value" = excluded."value"`,
    JSON.stringify(settings),
  );
}
```

- [ ] **Step 11: Settings and the logical day in `SqlStore`**

In `platform/apps/worker/src/store/sqlStore.ts`:

1. Replace the domain import with:

```ts
import {
  ALL_TOOLS, addDays, logicalDayKey, monotonicClock, parseSettings, runTool,
  type Group, type MergedState, type Task, type TaskEvent, type ToolContext, type ToolDef, type ToolResult, type UserSettings,
} from "@imprint/domain";
import { insertEvent, loadRows, readSettings, writeGroup, writeSettings, writeTask } from "./rows";
```

2. Add `settings` to `Pending`:

```ts
interface Pending {
  tasks: Map<string, Task>;
  groups: Map<string, Group>;
  events: Map<string, TaskEvent>;
  settings: UserSettings | null;
}
```

3. Add the field and load it in the constructor right after `migrate(storage);`:

```ts
  private settings: UserSettings;
```

```ts
    migrate(storage);
    this.settings = parseSettings(readSettings(storage.sql));
```

4. In `execute`, create the buffer with `settings: null`, count it as a write, persist it and adopt it:

```ts
    const pending: Pending = { tasks: new Map(), groups: new Map(), events: new Map(), settings: null };
    const result = runTool(this.context(pending), name, input, tools);
    const wrote = pending.tasks.size + pending.groups.size + pending.events.size > 0 || pending.settings !== null;
```

inside `transactionSync`, before `writeMeta(sql, "rev", …)`:

```ts
        if (pending.settings) writeSettings(sql, pending.settings);
```

and after the three `for … of pending.*` loops that update memory:

```ts
    if (pending.settings) this.settings = pending.settings;
```

5. Replace `todayKey()` and `windowStart()` with:

```ts
  /** The user's logical day now (P5): their zone and reset time, never the runtime's zone. */
  private todayKey(settings: UserSettings = this.settings): string {
    return logicalDayKey(this.read(), settings);
  }

  private windowStart(): string {
    return addDays(this.todayKey(), -(EVENT_WINDOW_DAYS - 1));
  }
```

6. In `context(p)`, replace the `todayKey` entry with:

```ts
      todayKey: () => this.todayKey(p.settings ?? this.settings),
      settings: () => p.settings ?? this.settings,
      putSettings: (s) => {
        p.settings = s;
      },
```

`snapshot().settings` stays `readSettings(this.storage.sql)` — the stored object as is (`{}` for a new user; the client applies `parseSettings`).

- [ ] **Step 12: Run the worker tests**

Run: `npm run test -w @imprint/worker`
Expected: PASS (including `userStore.test.ts`, whose `settings: {}` for a new user is unchanged).

- [ ] **Step 13: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/packages/domain/src/tools/context.ts platform/packages/domain/src/tools/memoryContext.ts platform/packages/domain/src/tools/settings.ts platform/packages/domain/src/tools/settings.test.ts platform/packages/domain/src/tools/index.ts platform/packages/domain/src/tools/contract.test.ts platform/apps/worker/src/store/rows.ts platform/apps/worker/src/store/sqlStore.ts platform/apps/worker/test/sqlStore.test.ts
git commit -m "platform: user settings in the tool context; today is the logical day in the user's zone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The journal folded per task

**Files:**
- Create: `platform/packages/domain/src/day/journal.ts`
- Test: `platform/packages/domain/src/day/journal.test.ts`

**Interfaces:**
- Consumes: `TaskEvent` (`types.ts`), `ev` fixture (`tools/fixtures.ts`).
- Produces: `type DayChoice = "SKIPPED" | "PULLED_TO_DAY"`; `interface Marks { lastMark: TaskEvent | null; lastMarkToday: TaskEvent | null; choiceToday: DayChoice | null; backlogToday: boolean }`; `type JournalIndex = ReadonlyMap<string, Marks>`; `byJournalOrder(a, b): number`; `indexJournal(events, today): JournalIndex`; `marksOf(index, taskId): Marks`; `journalTail(events, since): TaskEvent[]`

- [ ] **Step 1: Write the failing test**

`platform/packages/domain/src/day/journal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ev } from "../tools/fixtures";
import type { TaskEvent } from "../types";
import { indexJournal, journalTail, marksOf } from "./journal";

const TODAY = "2026-01-15";
let seq = 0;
const e = (taskId: string | null, type: string, at: number, dayKey = TODAY, deviceId = "d"): TaskEvent =>
  ev({ id: `e${seq++}`, taskId, type, at, dayKey, deviceId });
const marks = (events: TaskEvent[], taskId: string) => marksOf(indexJournal(events, TODAY), taskId);
const doneToday = (events: TaskEvent[], taskId: string) => marks(events, taskId).lastMarkToday?.type === "DONE";

// Ported from app/src/test/java/com/imprint/app/domain/CompletionTest.kt (5 tests).
describe("indexJournal — CompletionTest parity", () => {
  it("lastDoneWins_overEarlierUndone", () => {
    expect(doneToday([e("t", "DONE", 1), e("t", "UNDONE", 2), e("t", "DONE", 3)], "t")).toBe(true);
  });

  it("undoneAfterDone_isNotDone", () => {
    expect(doneToday([e("t", "DONE", 1), e("t", "UNDONE", 2)], "t")).toBe(false);
  });

  it("orderingIsByTimestamp_notInsertionOrder", () => {
    expect(doneToday([e("t", "DONE", 5), e("t", "UNDONE", 2)], "t")).toBe(true);
  });

  it("skippedIsCollected_andIndependentOfDone", () => {
    const events = [e("a", "SKIPPED", 1), e("b", "DONE", 1)];
    expect(marks(events, "a")).toMatchObject({ choiceToday: "SKIPPED", lastMarkToday: null });
    expect(doneToday(events, "b")).toBe(true);
    expect(marks(events, "b").choiceToday).toBeNull();
  });

  it("taskIndependentEventsAreIgnored", () => {
    expect(indexJournal([e(null, "SHOWN", 1)], TODAY).size).toBe(0);
  });
});

describe("indexJournal — 2.0 additions (ADR 007)", () => {
  it("lastMark spans days; lastMarkToday is only today's", () => {
    const m = marks([e("t", "DONE", 1, "2026-01-10"), e("t", "UNDONE", 2, "2026-01-12")], "t");
    expect(m.lastMark).toMatchObject({ type: "UNDONE", dayKey: "2026-01-12" });
    expect(m.lastMarkToday).toBeNull();
  });

  it("the later of SKIPPED and PULLED_TO_DAY wins; other days do not count", () => {
    expect(marks([e("r", "SKIPPED", 1), e("r", "PULLED_TO_DAY", 2)], "r").choiceToday).toBe("PULLED_TO_DAY");
    expect(marks([e("r", "PULLED_TO_DAY", 1), e("r", "SKIPPED", 2)], "r").choiceToday).toBe("SKIPPED");
    expect(marks([e("r", "SKIPPED", 1, "2026-01-14")], "r").choiceToday).toBeNull();
  });

  it("MOVED_TO_BACKLOG counts only today", () => {
    expect(marks([e("t", "MOVED_TO_BACKLOG", 1)], "t").backlogToday).toBe(true);
    expect(marks([e("t", "MOVED_TO_BACKLOG", 1, "2026-01-14")], "t").backlogToday).toBe(false);
  });

  it("equal timestamps break ties by deviceId, then id", () => {
    const events = [e("t", "DONE", 5, TODAY, "server"), e("t", "UNDONE", 5, TODAY, "phone")];
    expect(marks(events, "t").lastMark?.type).toBe("DONE"); // "server" sorts after "phone"
  });

  it("a task with no events has empty marks", () => {
    expect(marks([], "nope")).toEqual({ lastMark: null, lastMarkToday: null, choiceToday: null, backlogToday: false });
  });
});

describe("journalTail", () => {
  it("keeps each task's last DONE/UNDONE before `since`, and nothing else", () => {
    const events = [
      e("a", "DONE", 1, "2026-01-01"),
      e("a", "UNDONE", 2, "2026-01-02"),
      e("b", "DONE", 3, "2026-01-03"),
      e("b", "CREATED", 4, "2026-01-03"),
      e("c", "DONE", 5, "2026-01-20"),
      e(null, "SHOWN", 6, "2026-01-01"),
    ];
    expect(journalTail(events, "2026-01-10").map((x) => [x.taskId, x.type]).sort()).toEqual([
      ["a", "UNDONE"],
      ["b", "DONE"],
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -w @imprint/domain -- src/day/journal.test.ts`
Expected: FAIL — `Failed to resolve import "./journal"`.

- [ ] **Step 3: Implement `day/journal.ts`**

```ts
import type { TaskEvent } from "../types";

/**
 * The journal folded per task — the projection's only view of events (SPEC §3.3). Mirrors
 * `com.imprint.app.domain.Completion.of` and extends it to the whole journal: a one-shot's done-ness is
 * its last DONE/UNDONE ever, a repeating task's is its last one today (ADR 007).
 */

export type DayChoice = "SKIPPED" | "PULLED_TO_DAY";

export interface Marks {
  /** Last DONE/UNDONE ever — decides a one-shot (done today, or completed on an earlier day). */
  lastMark: TaskEvent | null;
  /** Last DONE/UNDONE on today — decides a repeating task. */
  lastMarkToday: TaskEvent | null;
  /** The later of today's SKIPPED / PULLED_TO_DAY — a routine's hand override for today. */
  choiceToday: DayChoice | null;
  /** A MOVED_TO_BACKLOG today: a dated task stays out of the Day until tomorrow (F5a). */
  backlogToday: boolean;
}

export type JournalIndex = ReadonlyMap<string, Marks>;

const NO_MARKS: Marks = { lastMark: null, lastMarkToday: null, choiceToday: null, backlogToday: false };

/** Journal order (SPEC §3.2 rule 4): `at`, then `deviceId`, then `id` — as `Completion.of`. */
export function byJournalOrder(a: TaskEvent, b: TaskEvent): number {
  return a.at - b.at || a.deviceId.localeCompare(b.deviceId) || a.id.localeCompare(b.id);
}

const isMark = (e: TaskEvent) => e.type === "DONE" || e.type === "UNDONE";

export function indexJournal(events: readonly TaskEvent[], today: string): JournalIndex {
  const index = new Map<string, Marks>();
  for (const e of [...events].sort(byJournalOrder)) {
    if (e.taskId == null) continue;
    const m = index.get(e.taskId) ?? { ...NO_MARKS };
    const isToday = e.dayKey === today;
    if (isMark(e)) {
      m.lastMark = e;
      if (isToday) m.lastMarkToday = e;
    } else if (isToday && (e.type === "SKIPPED" || e.type === "PULLED_TO_DAY")) {
      m.choiceToday = e.type;
    } else if (isToday && e.type === "MOVED_TO_BACKLOG") {
      m.backlogToday = true;
    }
    index.set(e.taskId, m);
  }
  return index;
}

export function marksOf(index: JournalIndex, taskId: string): Marks {
  return index.get(taskId) ?? NO_MARKS;
}

/** Each task's last DONE/UNDONE among events before `since` — what the state carries beyond its window. */
export function journalTail(events: readonly TaskEvent[], since: string): TaskEvent[] {
  const last = new Map<string, TaskEvent>();
  for (const e of [...events].sort(byJournalOrder)) {
    if (e.taskId != null && e.dayKey < since && isMark(e)) last.set(e.taskId, e);
  }
  return [...last.values()];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @imprint/domain -- src/day/journal.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/packages/domain/src/day/journal.ts platform/packages/domain/src/day/journal.test.ts
git commit -m "domain: journal folded per task (Completion parity + marks for the projection)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Day and the Backlog as projections

**Files:**
- Create: `platform/packages/domain/src/day/project.ts`, `platform/packages/domain/src/day/fixtures.ts`, `platform/packages/domain/src/day/index.ts`
- Modify: `platform/packages/domain/src/index.ts`
- Test: `platform/packages/domain/src/day/assembly.test.ts`, `platform/packages/domain/src/day/rollover.test.ts`, `platform/packages/domain/src/day/project.test.ts`

**Interfaces:**
- Consumes: `indexJournal`, `marksOf`, `Marks`, `JournalIndex` (Task 3); `dayStart`, `dateStart`, `dueKey`, `weekday`, `UserSettings` (Task 1); `liveGroups`, `MergedState` (`merge.ts`); `isOn` (`recurrence.ts`).
- Produces:
  - `type DayKind = "row" | "due" | "appearance"`, `type Place = "day" | "backlog" | "completed" | "hidden"`, `interface TaskPlace { place: Place; kind: DayKind | null }`
  - `interface StepView { task: Task; done: boolean }`, `type DayItem = Task & { kind: DayKind; doneToday: boolean; sortKey: number; steps: StepView[] }`, `type BacklogItem = Task & { doneToday: boolean; steps: StepView[] }`, `interface BacklogView { groups: { group: Group; tasks: BacklogItem[] }[]; ungrouped: BacklogItem[] }`
  - `doneToday(task, marks, today): boolean`, `isCompleted(task, marks, today): boolean`
  - `locate(state, taskId, today, settings): TaskPlace`, `projectDay(state, today, settings): DayItem[]`, `projectBacklog(state, today, settings): BacklogView`, `orderDay(items: DayItem[]): DayItem[]`
  - test helpers in `day/fixtures.ts`: `MSK`, `THU = "2026-01-15"`, `WED = "2026-01-14"`, `world(tasks, events?, groups?)`

- [ ] **Step 1: Test fixtures**

`platform/packages/domain/src/day/fixtures.ts`:

```ts
import type { MergedState } from "../merge";
import type { UserSettings } from "../time/settings";
import type { Group, Task, TaskEvent } from "../types";

/** Moscow (UTC+3, no DST), reset 04:00 — the zone the ported v1 tests run in. */
export const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };

/** The v1 tests' Thursday, and the day before it. */
export const THU = "2026-01-15";
export const WED = "2026-01-14";

export function world(tasks: Task[], events: TaskEvent[] = [], groups: Group[] = []): MergedState {
  return { tasks, groups, events, sourceCount: 1 };
}
```

- [ ] **Step 2: Write the failing ported DayAssembly test**

`platform/packages/domain/src/day/assembly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DAILY, WEEKEND, bit } from "../recurrence";
import { dateStart } from "../time/day";
import { ev, task } from "../tools/fixtures";
import type { Task } from "../types";
import { MSK, THU, world } from "./fixtures";
import { projectDay, type DayItem } from "./project";

// Ported from app/src/test/java/com/imprint/app/domain/DayAssemblyTest.kt (7 tests).
const dayRow = (id: string, title: string) => task({ id, title, location: "DAY" });
const repeating = (id: string, title: string, mask = DAILY, startDate: number | null = null, createdAt = 1): Task =>
  task({ id, title, isRepeating: true, recurrenceMask: mask, startDate, createdAt });
const titles = (items: DayItem[]) => items.map((i) => i.title);

describe("projectDay — DayAssemblyTest parity", () => {
  it("mergesRealTasksAndDueRepeating", () => {
    const out = projectDay(world([dayRow("1", "one-off"), repeating("2", "brush teeth")]), THU, MSK);
    expect(titles(out)).toEqual(["one-off", "brush teeth"]);
    expect(out.find((i) => i.id === "2")?.kind).toBe("appearance");
  });

  it("skippedRepeatingIsHidden_othersAppear", () => {
    const state = world([repeating("2", "shows"), repeating("3", "skipped")], [ev({ id: "s", taskId: "3", type: "SKIPPED", dayKey: THU })]);
    expect(titles(projectDay(state, THU, MSK))).toEqual(["shows"]);
  });

  it("excludesOffCadenceRepeating", () => {
    expect(projectDay(world([repeating("3", "monday only", bit(0))]), THU, MSK)).toEqual([]);
  });

  it("startAnchor_gatesRepeatingUntilItArrives", () => {
    const state = world([
      repeating("1", "not yet", DAILY, dateStart("2026-01-18", MSK), 1),
      repeating("2", "starts today", DAILY, dateStart(THU, MSK), 2),
      repeating("3", "already started", DAILY, dateStart("2026-01-14", MSK), 3),
    ]);
    expect(titles(projectDay(state, THU, MSK))).toEqual(["starts today", "already started"]);
  });

  it("pulledRepeating_appearsEvenOffCadence", () => {
    const state = world(
      [repeating("1", "weekend only", WEEKEND), repeating("2", "also weekend only", WEEKEND)],
      [ev({ id: "p", taskId: "1", type: "PULLED_TO_DAY", dayKey: THU })],
    );
    expect(titles(projectDay(state, THU, MSK))).toEqual(["weekend only"]);
  });

  it("sameDaySkip_stillWinsOverAPull — the later event wins, here the skip", () => {
    const state = world(
      [repeating("1", "weekend only", WEEKEND)],
      [
        ev({ id: "p", taskId: "1", type: "PULLED_TO_DAY", dayKey: THU, at: 1 }),
        ev({ id: "s", taskId: "1", type: "SKIPPED", dayKey: THU, at: 2 }),
      ],
    );
    expect(projectDay(state, THU, MSK)).toEqual([]);
  });

  it("neverProducesDuplicateIds — one row is one item, even a routine stored as a DAY row", () => {
    const state = world([task({ id: "7", title: "routine as a DAY row", location: "DAY", isRepeating: true, recurrenceMask: DAILY })]);
    expect(projectDay(state, THU, MSK).map((i) => i.id)).toEqual(["7"]);
  });
});
```

- [ ] **Step 3: Write the failing ported Rollover test**

`platform/packages/domain/src/day/rollover.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DAILY } from "../recurrence";
import { dateStart } from "../time/day";
import { ev, task } from "../tools/fixtures";
import { MSK, THU, WED, world } from "./fixtures";
import { locate, projectDay } from "./project";

// Ported from app/src/test/java/com/imprint/app/domain/RolloverTest.kt (4 tests). v1 "retire" (a
// tombstone written at the reset) becomes "completed": hidden by the projection, nothing written (ADR 007).
describe("the daily reset as a projection — RolloverTest parity", () => {
  it("retiresFinishedOneShots_keepsUnfinished", () => {
    const state = world(
      [task({ id: "done", title: "done", location: "DAY" }), task({ id: "open", title: "open", location: "DAY" })],
      [ev({ id: "d", taskId: "done", type: "DONE", dayKey: WED })],
    );
    expect(projectDay(state, THU, MSK).map((i) => i.id)).toEqual(["open"]);
    expect(locate(state, "done", THU, MSK)).toEqual({ place: "completed", kind: null });
    expect(state.tasks.find((t) => t.id === "done")?.deletedAt).toBeNull();
  });

  it("neverRetiresRepeatingRows", () => {
    const state = world(
      [task({ id: "rep", location: "DAY", isRepeating: true, recurrenceMask: DAILY })],
      [ev({ id: "d", taskId: "rep", type: "DONE", dayKey: WED })],
    );
    expect(projectDay(state, THU, MSK)).toMatchObject([{ id: "rep", kind: "appearance", doneToday: false }]);
  });

  it("promotesArrivedDue_withEnteredAtEqualToDueDate — the sort key is the start of its date", () => {
    const state = world([task({ id: "yesterday", dueDate: dateStart(WED, MSK) }), task({ id: "today", dueDate: dateStart(THU, MSK) })]);
    expect(projectDay(state, THU, MSK).map((i) => [i.id, i.kind, i.sortKey])).toEqual([
      ["yesterday", "due", dateStart(WED, MSK)],
      ["today", "due", dateStart(THU, MSK)],
    ]);
  });

  it("doesNotPromoteFutureDue", () => {
    const state = world([task({ id: "later", dueDate: dateStart("2026-01-16", MSK) })]);
    expect(projectDay(state, THU, MSK)).toEqual([]);
    expect(locate(state, "later", THU, MSK).place).toBe("backlog");
  });
});
```

- [ ] **Step 4: Write the failing projection test**

`platform/packages/domain/src/day/project.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DAILY, bit } from "../recurrence";
import { addDays, dateStart, dayStart } from "../time/day";
import { ev, group, task } from "../tools/fixtures";
import { MSK, THU, WED, world } from "./fixtures";
import { locate, projectBacklog, projectDay } from "./project";

const HOUR = 3_600_000;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("projectDay order (buildDay, SPEC §4.2.1)", () => {
  it("a group clusters at its earliest member; then arrival, then createdAt; done sinks", () => {
    const state = world(
      [
        task({ id: "gA", location: "DAY", groupId: "g", enteredDayAt: 10 }),
        task({ id: "loner", location: "DAY", enteredDayAt: 20 }),
        task({ id: "gB", location: "DAY", groupId: "g", enteredDayAt: 30 }),
        task({ id: "first", location: "DAY", enteredDayAt: 5 }),
      ],
      [ev({ id: "d", taskId: "first", type: "DONE", dayKey: THU })],
    );
    expect(ids(projectDay(state, THU, MSK))).toEqual(["gA", "gB", "loner", "first"]);
  });

  it("routines sit at the reset: below yesterday's leftovers and a date that arrived at midnight, above today's typing", () => {
    const state = world([
      task({ id: "routine", isRepeating: true, recurrenceMask: DAILY }),
      task({ id: "leftover", location: "DAY", enteredDayAt: dayStart(WED, MSK) + HOUR }),
      task({ id: "dated", dueDate: dateStart(THU, MSK) }),
      task({ id: "typed", location: "DAY", enteredDayAt: dayStart(THU, MSK) + HOUR }),
    ]);
    expect(ids(projectDay(state, THU, MSK))).toEqual(["leftover", "dated", "routine", "typed"]);
  });

  it("a one-shot done yesterday and undone today is open in the Day again", () => {
    const state = world(
      [task({ id: "t", location: "DAY" })],
      [ev({ id: "a", taskId: "t", type: "DONE", dayKey: WED, at: 1 }), ev({ id: "b", taskId: "t", type: "UNDONE", dayKey: THU, at: 2 })],
    );
    expect(projectDay(state, THU, MSK)).toMatchObject([{ id: "t", kind: "row", doneToday: false }]);
  });

  it("deleted tasks are nowhere", () => {
    const state = world([task({ id: "gone", location: "DAY", deletedAt: 5 })]);
    expect(projectDay(state, THU, MSK)).toEqual([]);
    expect(locate(state, "gone", THU, MSK)).toEqual({ place: "hidden", kind: null });
    expect(locate(state, "unknown", THU, MSK)).toEqual({ place: "hidden", kind: null });
  });
});

describe("F5a: a dated task sent back to the backlog", () => {
  const state = world(
    [task({ id: "t", dueDate: dateStart(WED, MSK) })],
    [ev({ id: "m", taskId: "t", type: "MOVED_TO_BACKLOG", dayKey: THU })],
  );

  it("stays out of the Day for the rest of today", () => {
    expect(locate(state, "t", THU, MSK)).toEqual({ place: "backlog", kind: null });
    expect(ids(projectBacklog(state, THU, MSK).ungrouped)).toEqual(["t"]);
  });

  it("is back tomorrow, on top by its date", () => {
    const tomorrow = addDays(THU, 1);
    expect(projectDay(state, tomorrow, MSK)).toMatchObject([{ id: "t", kind: "due", sortKey: dateStart(WED, MSK) }]);
  });
});

describe("projectBacklog", () => {
  const groups = [group({ id: "g2", name: "Work", position: 1 }), group({ id: "g1", name: "Home", position: 0 }), group({ id: "dead", deletedAt: 1 })];

  it("sections by group position (empty ones too); a deleted group's tasks are ungrouped", () => {
    const state = world(
      [task({ id: "b1", groupId: "g1", position: 1 }), task({ id: "b0", groupId: "g1", position: 0 }), task({ id: "orphan", groupId: "dead" }), task({ id: "loose" })],
      [],
      groups,
    );
    const view = projectBacklog(state, THU, MSK);
    expect(view.groups.map((s) => [s.group.id, ids(s.tasks)])).toEqual([
      ["g1", ["b0", "b1"]],
      ["g2", []],
    ]);
    expect(ids(view.ungrouped).sort()).toEqual(["loose", "orphan"]);
  });

  it("holds every repeating definition, even one appearing in the Day today", () => {
    const state = world([task({ id: "daily", isRepeating: true, recurrenceMask: DAILY }), task({ id: "mondays", isRepeating: true, recurrenceMask: bit(0) })]);
    expect(ids(projectDay(state, THU, MSK))).toEqual(["daily"]);
    expect(ids(projectBacklog(state, THU, MSK).ungrouped).sort()).toEqual(["daily", "mondays"]);
  });

  it("a date that has arrived puts the task in the Day, not the Backlog", () => {
    const state = world([task({ id: "due", dueDate: dateStart(THU, MSK) }), task({ id: "later", dueDate: dateStart(addDays(THU, 3), MSK) })]);
    expect(ids(projectBacklog(state, THU, MSK).ungrouped)).toEqual(["later"]);
  });

  it("a one-shot done today stays, last in its section; the next day it is gone", () => {
    const state = world(
      [task({ id: "done", position: 0 }), task({ id: "open", position: 1 })],
      [ev({ id: "d", taskId: "done", type: "DONE", dayKey: THU })],
    );
    expect(projectBacklog(state, THU, MSK).ungrouped).toMatchObject([
      { id: "open", doneToday: false },
      { id: "done", doneToday: true },
    ]);
    expect(ids(projectBacklog(state, addDays(THU, 1), MSK).ungrouped)).toEqual(["open"]);
  });
});
```

- [ ] **Step 5: Run the three tests to verify they fail**

Run: `npm run test -w @imprint/domain -- src/day`
Expected: FAIL — `Failed to resolve import "./project"` (journal tests still pass).

- [ ] **Step 6: Implement `day/project.ts`**

```ts
import { liveGroups, type MergedState } from "../merge";
import { isOn } from "../recurrence";
import { dateStart, dayStart, dueKey, weekday } from "../time/day";
import type { UserSettings } from "../time/settings";
import { LOCATION_DAY, type Group, type Task } from "../types";
import { indexJournal, marksOf, type JournalIndex, type Marks } from "./journal";

/**
 * The Day and the Backlog as projections (SPEC §4.2, §4.2.1, §4.3; ADR 007). Nothing here writes: the
 * daily reset is a change of the `today` argument. Ports `DayAssembly.merge`, the retire/promote rules
 * of `Rollover.plan` and the order of `ChecklistRepository.buildDay`.
 */

export type DayKind = "row" | "due" | "appearance";
export type Place = "day" | "backlog" | "completed" | "hidden";

export interface TaskPlace {
  place: Place;
  /** How it is in the Day; null unless `place` is "day". */
  kind: DayKind | null;
}

/** A step of a task — filled in W3b; empty until then. */
export interface StepView {
  task: Task;
  done: boolean;
}

export type DayItem = Task & { kind: DayKind; doneToday: boolean; sortKey: number; steps: StepView[] };
export type BacklogItem = Task & { doneToday: boolean; steps: StepView[] };

export interface BacklogView {
  groups: { group: Group; tasks: BacklogItem[] }[];
  ungrouped: BacklogItem[];
}

interface Frame {
  today: string;
  settings: UserSettings;
  journal: JournalIndex;
}

const frame = (state: MergedState, today: string, settings: UserSettings): Frame => ({
  today,
  settings,
  journal: indexJournal(state.events, today),
});

/** Done for today: a one-shot by its last mark ever, a repeating task by today's (ADR 007). */
export function doneToday(task: Task, m: Marks, today: string): boolean {
  const mark = task.isRepeating ? m.lastMarkToday : m.lastMark;
  return mark?.type === "DONE" && mark.dayKey >= today;
}

/** A one-shot finished on an earlier day: out of the Day and the Backlog, still in the journal (v1 retire). */
export function isCompleted(task: Task, m: Marks, today: string): boolean {
  return !task.isRepeating && m.lastMark?.type === "DONE" && m.lastMark.dayKey < today;
}

function dayKind(task: Task, m: Marks, f: Frame): DayKind | null {
  if (task.isRepeating) {
    if (m.choiceToday === "SKIPPED") return null;
    if (m.choiceToday === "PULLED_TO_DAY") return "appearance";
    const started = task.startDate == null || dueKey(task.startDate, f.settings) <= f.today;
    return isOn(task.recurrenceMask, weekday(f.today)) && started ? "appearance" : null;
  }
  if (task.location === LOCATION_DAY) return "row";
  const arrived = task.dueDate != null && dueKey(task.dueDate, f.settings) <= f.today;
  return arrived && !m.backlogToday ? "due" : null;
}

/** SPEC §4.2.1: arrival in the Day. A date brings a task in at its day's start; routines at the reset. */
function sortKeyOf(task: Task, kind: DayKind, f: Frame): number {
  if (kind === "appearance") return dayStart(f.today, f.settings);
  if (kind === "due") return dateStart(dueKey(task.dueDate as number, f.settings), f.settings);
  return task.enteredDayAt ?? task.createdAt;
}

function placeIn(task: Task, f: Frame): TaskPlace {
  if (task.deletedAt != null) return { place: "hidden", kind: null };
  const m = marksOf(f.journal, task.id);
  if (isCompleted(task, m, f.today)) return { place: "completed", kind: null };
  const kind = dayKind(task, m, f);
  return { place: kind ? "day" : "backlog", kind };
}

/** Where one task is today — tools decide by this, never by `location` alone. */
export function locate(state: MergedState, taskId: string, today: string, settings: UserSettings): TaskPlace {
  const task = state.tasks.find((t) => t.id === taskId);
  return task ? placeIn(task, frame(state, today, settings)) : { place: "hidden", kind: null };
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `buildDay`'s order: a group's tasks take the slot of its earliest member, then group id, arrival and
 * creation; done tasks sink to the bottom, keeping their order.
 */
export function orderDay(items: DayItem[]): DayItem[] {
  const anchor = new Map<string, number>();
  for (const i of items) {
    if (i.groupId != null) anchor.set(i.groupId, Math.min(anchor.get(i.groupId) ?? Infinity, i.sortKey));
  }
  const slot = (i: DayItem) => (i.groupId != null ? (anchor.get(i.groupId) as number) : i.sortKey);
  const sorted = [...items].sort(
    (a, b) => slot(a) - slot(b) || byText(a.groupId ?? "", b.groupId ?? "") || a.sortKey - b.sortKey || a.createdAt - b.createdAt,
  );
  return [...sorted.filter((i) => !i.doneToday), ...sorted.filter((i) => i.doneToday)];
}

export function projectDay(state: MergedState, today: string, settings: UserSettings): DayItem[] {
  const f = frame(state, today, settings);
  const items: DayItem[] = [];
  for (const task of state.tasks) {
    const { kind } = placeIn(task, f);
    if (!kind) continue;
    const done = doneToday(task, marksOf(f.journal, task.id), today);
    items.push({ ...task, kind, doneToday: done, sortKey: sortKeyOf(task, kind, f), steps: [] });
  }
  return orderDay(items);
}

export function projectBacklog(state: MergedState, today: string, settings: UserSettings): BacklogView {
  const f = frame(state, today, settings);
  const items: BacklogItem[] = [];
  for (const task of state.tasks) {
    const { place } = placeIn(task, f);
    // A repeating definition always lives in the Backlog, even while it appears in the Day (v1).
    if (place !== "backlog" && !(place === "day" && task.isRepeating)) continue;
    items.push({ ...task, doneToday: doneToday(task, marksOf(f.journal, task.id), today), steps: [] });
  }
  const order = (a: BacklogItem, b: BacklogItem) =>
    Number(a.doneToday) - Number(b.doneToday) || a.position - b.position || a.createdAt - b.createdAt;
  const groups = liveGroups(state).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const live = new Set(groups.map((g) => g.id));
  return {
    groups: groups.map((group) => ({ group, tasks: items.filter((t) => t.groupId === group.id).sort(order) })),
    ungrouped: items.filter((t) => t.groupId == null || !live.has(t.groupId)).sort(order),
  };
}
```

- [ ] **Step 7: Barrels**

`platform/packages/domain/src/day/index.ts`:

```ts
export * from "./journal";
export * from "./project";
```

In `platform/packages/domain/src/index.ts`, after `export * from "./time/index";` add:

```ts
export * from "./day/index";
```

- [ ] **Step 8: Run the day tests to verify they pass**

Run: `npm run test -w @imprint/domain -- src/day`
Expected: PASS (4 files).

- [ ] **Step 9: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/packages/domain/src/day platform/packages/domain/src/index.ts
git commit -m "domain: the Day and the Backlog as projections (DayAssembly + Rollover parity)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tools on the projection

**Files:**
- Create: `platform/packages/domain/src/tools/tasks-move.ts`
- Modify: `platform/packages/domain/src/tools/support.ts`, `platform/packages/domain/src/tools/tasks.ts`, `platform/packages/domain/src/tools/queries.ts`, `platform/packages/domain/src/tools/queries.test.ts` (approved: the `list_day` case), `platform/packages/domain/src/tools/tasks-move.test.ts` (approved: the `skipped_today` case)
- Test: `platform/packages/domain/src/tools/placement.test.ts`, `platform/packages/domain/src/day/promotion.test.ts`, `platform/packages/domain/src/tools/time-source.test.ts`

**Interfaces:**
- Consumes: `locate`, `doneToday`, `projectDay`, `projectBacklog`, `DayItem` (Task 4); `indexJournal`, `marksOf`, `Marks` (Task 3); `dayStart`, `dateStart`, `dueKey`, `weekday`, `instantOf` (Task 1); `ctx.settings()` and `memoryContext({ clock, settings })` (Task 2).
- Produces:
  - `support.ts`: `todayStart(ctx): number` (= `dayStart(today)`), `dateMillis(ctx, dateKey): number` (= `dateStart`), `marksToday(ctx, taskId): Marks`, `locateTask(ctx, taskId): TaskPlace`, `isDoneToday(ctx, taskId): boolean`; `hasEventToday` removed.
  - `tasks-move.ts`: `moveToDay`, `moveToBacklog`, `setDueDate`, `setRepeating` (same tool names and inputs as W0).
  - `list_day` → `{ tasks: DayItem[] }`; `list_backlog` → `BacklogView`.

- [ ] **Step 1: Update the two approved existing cases**

In `platform/packages/domain/src/tools/queries.test.ts`, replace the body of `describe("list_day", …)` with:

```ts
describe("list_day", () => {
  it("the projected Day: rows by arrival, today's appearance at the reset, done last", () => {
    const r = ok(runTool(memoryContext({ peers }), "list_day", {}));
    expect(r.tasks).toMatchObject([
      { id: "d1", kind: "row", doneToday: false },
      { id: "rep", kind: "appearance", doneToday: false },
      { id: "d2", kind: "row", doneToday: true },
    ]);
    expect(r.changed).toBe(false);
  });
});
```

In `platform/packages/domain/src/tools/tasks-move.test.ts`, replace the case `it("a repeating task skipped today is skipped_today (only the phone can undo a skip)", …)` with:

```ts
  it("a repeating task skipped today can be pulled back — the later event wins (ADR 007)", () => {
    const ctx = memoryContext({
      peers: [snap({ tasks: [task({ id: "r", isRepeating: true })], events: [ev({ taskId: "r", type: "SKIPPED" })] })],
    });
    ok(runTool(ctx, "move_to_day", { taskId: "r" }));
    expect(ctx.draft.events).toMatchObject([{ type: "PULLED_TO_DAY", taskId: "r" }]);
  });
```

- [ ] **Step 2: Write the failing placement test**

`platform/packages/domain/src/tools/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { DAILY, bit } from "../recurrence";
import { dateStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import type { Task } from "../types";
import { ev, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";
const SUN = "2026-09-27";

function setup(tasks: Task[] = [], events = snap().events) {
  let wall = instantOf(MON, 12, 0, MSK.timezone);
  const ctx = memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks, events })] });
  return { ctx, advanceTo: (key: string, hh: number) => void (wall = instantOf(key, hh, 0, MSK.timezone)) };
}
const day = (ctx: MemoryContext) => ok(runTool(ctx, "list_day", {})).tasks as DayItem[];
const row = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((t) => t.id === id)!;

describe("dates live in the user's zone", () => {
  it("add_task and set_due_date store local midnight in the user's zone", () => {
    const { ctx } = setup([task({ id: "t1" })]);
    const added = ok(runTool(ctx, "add_task", { title: "Pay", where: "backlog", dueDate: "2026-10-01" })).task as Task;
    expect(added.dueDate).toBe(Date.UTC(2026, 8, 30, 21, 0));
    ok(runTool(ctx, "set_due_date", { taskId: "t1", date: "2026-10-05" }));
    expect(row(ctx, "t1").dueDate).toBe(Date.UTC(2026, 9, 4, 21, 0));
  });
});

describe("move_to_day / move_to_backlog decide by the projection", () => {
  it("«в День» on a dated task already in the Day makes it a row in the same slot", () => {
    const { ctx } = setup([task({ id: "t", dueDate: dateStart(SUN, MSK) })]);
    ok(runTool(ctx, "move_to_day", { taskId: "t" }));
    expect(row(ctx, "t")).toMatchObject({ location: "DAY", dueDate: dateStart(SUN, MSK), enteredDayAt: dateStart(SUN, MSK) });
    expect(runTool(ctx, "move_to_day", { taskId: "t" })).toMatchObject({ changed: false, reason: "already_in_day" });
  });

  it("«в бэклог» on a dated task writes only the event; tomorrow it is back by its date (F5a)", () => {
    const { ctx, advanceTo } = setup([task({ id: "t", dueDate: dateStart(SUN, MSK) }), task({ id: "new", location: "DAY", enteredDayAt: 1 })]);
    ok(runTool(ctx, "move_to_backlog", { taskId: "t" }));
    expect(ctx.draft.tasks).toEqual([]);
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_BACKLOG", taskId: "t", dayKey: MON }]);
    expect(day(ctx).map((i) => i.id)).toEqual(["new"]);
    advanceTo("2026-09-29", 5);
    expect(day(ctx).map((i) => [i.id, i.kind])).toEqual([["new", "row"], ["t", "due"]]);
  });

  it("«в бэклог» on a routine that is not in today's list is already_in_backlog and writes nothing", () => {
    const { ctx } = setup([task({ id: "tue", isRepeating: true, recurrenceMask: bit(1) })]);
    expect(runTool(ctx, "move_to_backlog", { taskId: "tue" })).toMatchObject({ changed: false, reason: "already_in_backlog" });
    expect(ctx.draft.events).toEqual([]);
  });
});

describe("set_repeating keeps today's marks honest", () => {
  it("DB-3: skip → stop repeating → repeat again brings the routine back today", () => {
    const { ctx } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })]);
    ok(runTool(ctx, "move_to_backlog", { taskId: "r" }));
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }));
    expect(day(ctx)).toMatchObject([{ id: "r", kind: "appearance", doneToday: false }]);
  });

  it("DB-3: a one-shot done today turned into a routine starts unchecked", () => {
    const { ctx } = setup([task({ id: "t", location: "DAY" })], [ev({ taskId: "t", type: "DONE", dayKey: MON })]);
    ok(runTool(ctx, "set_repeating", { taskId: "t", days: ["mon"] }));
    expect(day(ctx)).toMatchObject([{ id: "t", kind: "appearance", doneToday: false }]);
  });

  it("changing a routine's days does not touch today's marks", () => {
    const { ctx } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })], [ev({ taskId: "r", type: "DONE", dayKey: MON })]);
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: ["mon", "wed"] }));
    expect(ctx.draft.events).toEqual([]);
    expect(day(ctx)).toMatchObject([{ id: "r", doneToday: true }]);
  });

  it("decision №15: stopping a routine checked today keeps it checked in the Day until the reset", () => {
    const { ctx, advanceTo } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })], [ev({ taskId: "r", type: "DONE", dayKey: MON })]);
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    expect(row(ctx, "r")).toMatchObject({ isRepeating: false, location: "DAY" });
    expect(day(ctx)).toMatchObject([{ id: "r", kind: "row", doneToday: true }]);
    advanceTo("2026-09-29", 5);
    expect(day(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the failing ported promotion test**

`platform/packages/domain/src/day/promotion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dateStart, dayStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { ok } from "../tools/fixtures";
import { runTool } from "../tools/index";
import { memoryContext, type MemoryContext } from "../tools/memoryContext";
import type { Group, Task } from "../types";
import { locate, type DayItem } from "./project";

// Ported from app/src/test/java/com/imprint/app/data/RepositoryPromotionTest.kt (8 tests): the same
// harness (UTC, reset 04:00, Thursday 2026-01-15 10:00), run through the tools and the projection.
// Differences by ADR 007: a date that arrives by itself does not rewrite the row (kind "due", location
// stays BACKLOG); a moved-in task's dueDate is the date's midnight, its enteredDayAt the day's reset.
const S: UserSettings = { timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" };
const TODAY = "2026-01-15";
let wall = 0;

function setup(): MemoryContext {
  wall = Date.UTC(2026, 0, 15, 10, 0);
  return memoryContext({ clock: () => wall, settings: S });
}
const day = (ctx: MemoryContext) => (ok(runTool(ctx, "list_day", {})).tasks as DayItem[]).map((i) => i.id);
const add = (ctx: MemoryContext, input: Record<string, unknown>) => ok(runTool(ctx, "add_task", input)).task as Task;
const row = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((t) => t.id === id)!;

describe("due dates and Day order — RepositoryPromotionTest parity", () => {
  it("addBacklogTask_withDateToday_promotesToDayImmediately", () => {
    const ctx = setup();
    const t = add(ctx, { title: "call now", where: "backlog", dueDate: TODAY });
    expect(ok(runTool(ctx, "list_day", {})).tasks).toMatchObject([{ id: t.id, kind: "due", sortKey: dateStart(TODAY, S) }]);
  });

  it("addBacklogTask_withFutureDate_staysInBacklog", () => {
    const ctx = setup();
    const t = add(ctx, { title: "later", where: "backlog", dueDate: "2026-01-16" });
    expect(locate(ctx.state(), t.id, TODAY, S).place).toBe("backlog");
  });

  it("setDueDate_pastDate_promotes_andClearingLeavesItInBacklog", () => {
    const ctx = setup();
    const t = add(ctx, { title: "someday", where: "backlog" });
    ok(runTool(ctx, "set_due_date", { taskId: t.id, date: TODAY }));
    expect(row(ctx, t.id).location).toBe("DAY");
    const dateless = add(ctx, { title: "dateless", where: "backlog" });
    expect(runTool(ctx, "set_due_date", { taskId: dateless.id, date: null })).toMatchObject({ reason: "same_value" });
    expect(row(ctx, dateless.id)).toMatchObject({ dueDate: null, location: "BACKLOG" });
  });

  it("notToday_onADatedOneShot_keepsTheDate", () => {
    const ctx = setup();
    const t = add(ctx, { title: "dentist", where: "backlog", dueDate: TODAY });
    ok(runTool(ctx, "move_to_backlog", { taskId: t.id }));
    expect(row(ctx, t.id)).toMatchObject({ location: "BACKLOG", dueDate: dateStart(TODAY, S) });
    expect(day(ctx)).toEqual([]);
  });

  it("dayOrder_isByEnteredThenCreated_withDoneSinking", () => {
    const ctx = setup();
    const a = add(ctx, { title: "first", where: "day" });
    wall += 1_000;
    const b = add(ctx, { title: "second", where: "day" });
    expect(day(ctx)).toEqual([a.id, b.id]);
    wall += 1_000;
    ok(runTool(ctx, "set_done", { taskId: a.id, done: true }));
    expect(day(ctx)).toEqual([b.id, a.id]);
  });

  it("moveToDayToday_datelessTask_stampsTodayAndPromotes", () => {
    const ctx = setup();
    const t = add(ctx, { title: "dateless", where: "backlog" });
    ok(runTool(ctx, "move_to_day", { taskId: t.id }));
    expect(row(ctx, t.id)).toMatchObject({ location: "DAY", dueDate: dateStart(TODAY, S), enteredDayAt: dayStart(TODAY, S) });
  });

  it("moveToDayToday_datedTask_keepsItsDate", () => {
    const ctx = setup();
    const t = add(ctx, { title: "dentist", where: "backlog", dueDate: "2026-02-01" });
    expect(day(ctx)).toEqual([]);
    ok(runTool(ctx, "move_to_day", { taskId: t.id }));
    expect(row(ctx, t.id)).toMatchObject({ location: "DAY", dueDate: dateStart("2026-02-01", S) });
  });

  it("dayOrder_clustersTasksFromTheSameGroup", () => {
    const ctx = setup();
    const g = ok(runTool(ctx, "create_group", { name: "Errands" })).group as Group;
    const gA = add(ctx, { title: "gA", where: "backlog", groupId: g.id, dueDate: "2026-01-13" });
    wall += 1_000;
    const u = add(ctx, { title: "loner", where: "backlog", dueDate: "2026-01-14" });
    wall += 1_000;
    const gB = add(ctx, { title: "gB", where: "backlog", groupId: g.id, dueDate: TODAY });
    expect(day(ctx)).toEqual([gA.id, gB.id, u.id]);
  });
});
```

- [ ] **Step 4: Write the failing time-source test**

`platform/packages/domain/src/tools/time-source.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const RUNTIME_ZONE = /\b(startOfDayMillis|todayDayKey|windowStartKey)\b/;

describe("tools read time only through time/ (P5)", () => {
  it("no tool uses the runtime-zone date helpers", () => {
    const offenders = readdirSync(DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => RUNTIME_ZONE.test(readFileSync(join(DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the new tests to verify they fail**

Run: `npm run test -w @imprint/domain -- src/tools/placement.test.ts src/day/promotion.test.ts src/tools/time-source.test.ts src/tools/queries.test.ts src/tools/tasks-move.test.ts`
Expected: FAIL — e.g. `time-source` lists `support.ts` and `tasks.ts`; `list_day` returns the flat W0 list; the pulled-after-skip case gets `skipped_today`.

- [ ] **Step 6: Rewrite the time and done helpers in `support.ts`**

In `platform/packages/domain/src/tools/support.ts`:

1. Replace the first imports (`doneTodayIds`, `startOfDayMillis, uuid`) with:

```ts
import { uuid } from "../compose";
import { indexJournal, marksOf, type Marks } from "../day/journal";
import { doneToday, locate, type TaskPlace } from "../day/project";
import { dateStart, dayStart } from "../time/day";
```

(keep `bit, isOn` from `../recurrence` and the type imports).

2. Replace `todayStart`, `isDoneToday` and `hasEventToday` with:

```ts
/** Start of today's logical day in the user's zone — when a task moved in by hand enters the Day (SPEC §4.2.1). */
export function todayStart(ctx: ToolContext): number {
  return dayStart(ctx.todayKey(), ctx.settings());
}

/** A calendar date as a stored `dueDate`: local midnight in the user's zone (`DueDates.startOfDay`). */
export function dateMillis(ctx: ToolContext, dateKey: string): number {
  return dateStart(dateKey, ctx.settings());
}

/** The task's journal marks for today (ADR 007). */
export function marksToday(ctx: ToolContext, taskId: string): Marks {
  return marksOf(indexJournal(ctx.state().events, ctx.todayKey()), taskId);
}

/** Where the task is in today's projection. */
export function locateTask(ctx: ToolContext, taskId: string): TaskPlace {
  return locate(ctx.state(), taskId, ctx.todayKey(), ctx.settings());
}

/** Done for today by the projection's rule: a one-shot by its last mark ever, a routine by today's. */
export function isDoneToday(ctx: ToolContext, taskId: string): boolean {
  const task = findTask(ctx, taskId);
  return task != null && doneToday(task, marksToday(ctx, taskId), ctx.todayKey());
}
```

3. Keep the `type EventType, Group, Task, TaskEvent` import from `../types` as is — `taskEvent` still uses `EventType`.

- [ ] **Step 7: Create `tools/tasks-move.ts`**

```ts
import { z } from "zod";
import { doneEvent } from "../edit";
import { isOn } from "../recurrence";
import { dueKey, weekday } from "../time/day";
import { LOCATION_BACKLOG, LOCATION_DAY, type Task } from "../types";
import type { ToolContext } from "./context";
import { defineTool } from "./define";
import { changed, fail, unchanged } from "./result";
import {
  dateMillis,
  dayName,
  id,
  isDoneToday,
  isoDate,
  liveTask,
  locateTask,
  marksToday,
  maskFromDays,
  taskEvent,
  todayStart,
} from "./support";

/**
 * Tools that move a task between the Day and the Backlog or change when it is due. They decide by the
 * projection (`locateTask`), never by `location` alone: a dated task can be in the Day while its row says
 * BACKLOG (ADR 007). Mirror `ChecklistRepository.moveToDayToday` / `notToday` / `setDueDate` / `setRepeating`.
 */

export const moveToDay = defineTool({
  name: "move_to_day",
  description:
    "Bring a task onto today's list. A one-shot backlog task moves into the Day, keeping its due date or taking today's. " +
    "A repeating task gets an extra appearance today, even if it was skipped earlier today.",
  input: z.object({ taskId: id }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const now = ctx.now();
    if (task.isRepeating) {
      // v1 moveToDayToday: no cadence check; the later of SKIPPED / PULLED_TO_DAY wins (ADR 007).
      if (marksToday(ctx, task.id).choiceToday === "PULLED_TO_DAY") return unchanged("already_in_day");
      ctx.appendEvent(taskEvent(ctx, "PULLED_TO_DAY", task, now));
      return changed({ task });
    }
    const { kind } = locateTask(ctx, task.id);
    if (kind === "row") return unchanged("already_in_day");
    const moved: Task =
      kind === "due"
        ? // Its date already brought it in: pin it as a Day row in the same slot (v1's promotion at the reset).
          { ...task, location: LOCATION_DAY, enteredDayAt: dateMillis(ctx, dueKey(task.dueDate as number, ctx.settings())), updatedAt: now }
        : { ...task, location: LOCATION_DAY, dueDate: task.dueDate ?? dateMillis(ctx, ctx.todayKey()), enteredDayAt: todayStart(ctx), updatedAt: now };
    ctx.upsertTask(moved);
    ctx.appendEvent(taskEvent(ctx, "MOVED_TO_DAY", moved, now));
    return changed({ task: moved });
  },
});

export const moveToBacklog = defineTool({
  name: "move_to_backlog",
  description:
    '"Not today": a one-shot leaves today\'s list for the backlog (keeping its due date — a past date brings it back tomorrow); ' +
    "a repeating task is skipped for today. Refused for a task done today (done_today) or not on today's list (already_in_backlog).",
  input: z.object({ taskId: id }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    if (isDoneToday(ctx, task.id)) return unchanged("done_today");
    const { place, kind } = locateTask(ctx, task.id);
    if (place !== "day") return unchanged("already_in_backlog");
    const now = ctx.now();
    if (task.isRepeating || kind === "due") {
      // A routine is skipped for today; a dated task's row already says BACKLOG — today's event keeps it out (F5a).
      ctx.appendEvent(taskEvent(ctx, task.isRepeating ? "SKIPPED" : "MOVED_TO_BACKLOG", task, now));
      return changed({ task });
    }
    const moved: Task = { ...task, location: LOCATION_BACKLOG, enteredDayAt: null, updatedAt: now };
    ctx.upsertTask(moved);
    ctx.appendEvent(taskEvent(ctx, "MOVED_TO_BACKLOG", moved, now));
    return changed({ task: moved });
  },
});

export const setDueDate = defineTool({
  name: "set_due_date",
  description:
    "Set (YYYY-MM-DD) or clear (null) a task's due date. A backlog one-shot dated today or earlier moves into the Day at once (movedToDay).",
  input: z.object({ taskId: id, date: isoDate.nullable() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const due = i.date == null ? null : dateMillis(ctx, i.date);
    if (due === task.dueDate) return unchanged("same_value");
    const now = ctx.now();
    // A repeating definition never becomes a Day row (its appearances are computed).
    const promote = due != null && i.date != null && !task.isRepeating && task.location === LOCATION_BACKLOG && i.date <= ctx.todayKey();
    const next: Task = promote
      ? { ...task, dueDate: due, location: LOCATION_DAY, enteredDayAt: due, updatedAt: now }
      : { ...task, dueDate: due, updatedAt: now };
    ctx.upsertTask(next);
    if (promote) ctx.appendEvent(taskEvent(ctx, "MOVED_TO_DAY", next, now));
    return changed({ task: next, movedToDay: promote });
  },
});

export const setRepeating = defineTool({
  name: "set_repeating",
  description:
    "Make a task repeat on the given weekdays (mon..sun) — it becomes a backlog definition shown on those days — or stop repeating (null or []).",
  input: z.object({ taskId: id, days: z.array(dayName).nullable() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const mask = maskFromDays(i.days ?? []);
    const now = ctx.now();
    if (mask > 0) {
      if (task.isRepeating && task.recurrenceMask === mask) return unchanged("same_value");
      const next: Task = { ...task, isRepeating: true, recurrenceMask: mask, location: LOCATION_BACKLOG, enteredDayAt: null, updatedAt: now };
      ctx.upsertTask(next);
      if (!task.isRepeating) cancelTodaysMarks(ctx, next, now);
      return changed({ task: next });
    }
    if (!task.isRepeating) return unchanged("same_value");
    // Decision №15: a routine already checked today becomes a Day row, so the check stays until the reset.
    const next: Task = isDoneToday(ctx, task.id)
      ? { ...task, isRepeating: false, location: LOCATION_DAY, enteredDayAt: now, updatedAt: now }
      : { ...task, isRepeating: false, updatedAt: now };
    ctx.upsertTask(next);
    return changed({ task: next });
  },
});

/**
 * DB-3: a task that becomes a routine must not inherit today's marks. v1 deleted them; the journal is
 * append-only, so later events cancel them — UNDONE for a DONE, PULLED_TO_DAY for a SKIPPED when the new
 * cadence includes today (ADR 007).
 */
function cancelTodaysMarks(ctx: ToolContext, task: Task, now: number): void {
  const m = marksToday(ctx, task.id);
  const today = ctx.todayKey();
  if (m.lastMarkToday?.type === "DONE") ctx.appendEvent(doneEvent(task, false, ctx.deviceId, now, today));
  if (m.choiceToday === "SKIPPED" && isOn(task.recurrenceMask, weekday(today))) {
    ctx.appendEvent(taskEvent(ctx, "PULLED_TO_DAY", task, now));
  }
}
```

- [ ] **Step 8: Slim `tools/tasks.ts`**

In `platform/packages/domain/src/tools/tasks.ts`:

1. Delete the four definitions `export const moveToDay = …`, `export const moveToBacklog = …`, `export const setDueDate = …`, `export const setRepeating = …` (they now live in `tasks-move.ts`).
2. Replace the imports at the top with:

```ts
import { z } from "zod";
import { buildContribution, uuid } from "../compose";
import { doneEvent, tombstone } from "../edit";
import { LOCATION_BACKLOG, LOCATION_DAY, type Task } from "../types";
import type { ToolContext } from "./context";
import { defineTool, type ToolDef } from "./define";
import { newGroup } from "./groups";
import { colorForId } from "./palette";
import { changed, fail, unchanged } from "./result";
import { dateMillis, dayName, findTask, id, isDoneToday, isoDate, liveGroup, liveTask, maskFromDays, taskEvent, text } from "./support";
import { moveToBacklog, moveToDay, setDueDate, setRepeating } from "./tasks-move";
```

3. In `add_task`'s `run`, replace `dueDate: !toDay && i.dueDate ? startOfDayMillis(i.dueDate) : null,` with:

```ts
        dueDate: !toDay && i.dueDate ? dateMillis(ctx, i.dueDate) : null,
```

`TASK_TOOLS` at the bottom keeps its order and names; it now resolves the four moved tools through the import.

- [ ] **Step 9: Projections behind `list_day` / `list_backlog`**

Replace `platform/packages/domain/src/tools/queries.ts` with:

```ts
import { z } from "zod";
import { projectBacklog, projectDay } from "../day/project";
import { liveGroups, liveTasks } from "../merge";
import type { Group } from "../types";
import { defineTool, type ToolDef } from "./define";
import { found } from "./result";

/** Reads: the projected Day and Backlog (SPEC §4.2, ADR 007) and the group list. */

const byPosition = (a: Group, b: Group) => a.position - b.position || a.name.localeCompare(b.name);

export const listDay = defineTool({
  name: "list_day",
  description:
    "List today's Day as the phone shows it: Day rows, backlog tasks whose date has arrived and today's appearances of repeating " +
    "tasks, in order (a group's tasks together, earliest arrival first, done ones last). Each item is the task plus kind " +
    "(row | due | appearance) and doneToday.",
  input: z.object({}),
  run: (ctx) => found({ tasks: projectDay(ctx.state(), ctx.todayKey(), ctx.settings()) }),
});

export const listBacklog = defineTool({
  name: "list_backlog",
  description:
    "List the backlog by group (in group order), then tasks in no group. Repeating definitions are always listed; " +
    "one-shots finished on an earlier day are not. Each task carries doneToday.",
  input: z.object({}),
  run: (ctx) => found({ ...projectBacklog(ctx.state(), ctx.todayKey(), ctx.settings()) }),
});

export const listGroups = defineTool({
  name: "list_groups",
  description: "List groups in order, each with the number of live tasks in it (Day and backlog).",
  input: z.object({}),
  run(ctx) {
    const state = ctx.state();
    const tasks = liveTasks(state);
    const groups = liveGroups(state)
      .sort(byPosition)
      .map((g) => ({ ...g, taskCount: tasks.filter((t) => t.groupId === g.id).length }));
    return found({ groups });
  },
});

export const QUERY_TOOLS: ToolDef[] = [listDay, listBacklog, listGroups];
```

- [ ] **Step 10: Run all domain tests**

Run: `npm run test -w @imprint/domain`
Expected: PASS — the new files, the two edited cases, and every other W0 test unchanged (`tasks.test.ts`, the rest of `tasks-move.test.ts`, `groups.test.ts`, `split.test.ts`, `contract.test.ts`, `index.test.ts`, `purity.test.ts`).

- [ ] **Step 11: Gate and commit**

Run: `npm run check` → green (worker tests included: `list_day` over the API still answers `ok`).

```bash
git add platform/packages/domain/src/tools/support.ts platform/packages/domain/src/tools/tasks.ts platform/packages/domain/src/tools/tasks-move.ts platform/packages/domain/src/tools/queries.ts platform/packages/domain/src/tools/queries.test.ts platform/packages/domain/src/tools/tasks-move.test.ts platform/packages/domain/src/tools/placement.test.ts platform/packages/domain/src/tools/time-source.test.ts platform/packages/domain/src/day/promotion.test.ts
git commit -m "domain: tools decide by the Day projection; list_day is the real Day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The journal tail in the worker

**Files:**
- Modify: `platform/apps/worker/src/store/schema.ts`, `platform/apps/worker/src/store/rows.ts`, `platform/apps/worker/src/store/sqlStore.ts`
- Test: `platform/apps/worker/test/schema.test.ts` (add a case), `platform/apps/worker/test/sqlStore.test.ts` (add a case)

**Interfaces:**
- Consumes: `journalTail` (Task 3), `addDays` (Task 1), `SqlStore` settings (Task 2).
- Produces: migration 2 (`CREATE INDEX "events_taskId"`); `loadTail(sql, sinceDayKey): TaskEvent[]`; `snapshot().events` = window + tail.

- [ ] **Step 1: Write the failing tests**

In `platform/apps/worker/test/schema.test.ts` add the import `insertEvent` to the `../src/store/rows` import, `sampleEvent` to the `./helpers` import, and this case inside `describe("migrations", …)`:

```ts
  it("migration 2 indexes events by taskId on an existing version-1 object", () =>
    withStorage((storage) => {
      migrate(storage, MIGRATIONS.slice(0, 1));
      insertEvent(storage.sql, sampleEvent());
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      const indexes = storage.sql
        .exec<{ name: string }>(`SELECT "name" FROM sqlite_master WHERE "type" = 'index'`)
        .toArray()
        .map((r) => r.name);
      expect(indexes).toContain("events_taskId");
      expect(loadRows(storage.sql, "2000-01-01").events).toHaveLength(1);
    }));
```

In `platform/apps/worker/test/sqlStore.test.ts` add inside `describe("SqlStore", …)`:

```ts
  it("state carries each task's last mark from before the window, so a task done long ago stays done", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC)); // today 2026-09-28 → window from 2026-08-25
      const tools = testTool("history", (ctx) => {
        ctx.upsertTask(sampleTask({ id: "old", location: "DAY" }));
        ctx.appendEvent(sampleEvent({ id: "c", taskId: "old", type: "CREATED", dayKey: "2026-07-01", at: 1 }));
        ctx.appendEvent(sampleEvent({ id: "d1", taskId: "old", type: "DONE", dayKey: "2026-07-01", at: 2 }));
        ctx.appendEvent(sampleEvent({ id: "u", taskId: "flip", type: "DONE", dayKey: "2026-07-02", at: 3 }));
        ctx.appendEvent(sampleEvent({ id: "v", taskId: "flip", type: "UNDONE", dayKey: "2026-07-03", at: 4 }));
        return { ok: true, changed: true };
      });
      s.execute("history", {}, tools);
      const ids = (store: SqlStore) => store.snapshot().events.map((e) => e.id).sort();
      expect(ids(s)).toEqual(["d1", "v"]);
      const woken = new SqlStore(storage, at(NOON_UTC));
      expect(ids(woken)).toEqual(["d1", "v"]);
      expect(woken.execute("list_day", {}).result).toMatchObject({ ok: true, tasks: [] });
    }));
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test -w @imprint/worker -- test/schema.test.ts test/sqlStore.test.ts`
Expected: FAIL — no `events_taskId` index; the snapshot has no tail (`[]`); the woken store shows `old` in the Day.

- [ ] **Step 3: Migration 2**

In `platform/apps/worker/src/store/schema.ts` replace `MIGRATIONS` with:

```ts
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, up: (sql) => V1.forEach((statement) => sql.exec(statement)) },
  // W3a: the journal tail (each task's last DONE/UNDONE before the window) is read by taskId.
  { version: 2, up: (sql) => void sql.exec(`CREATE INDEX "events_taskId" ON "events" ("taskId")`) },
];
```

- [ ] **Step 4: `loadTail` in `rows.ts`**

After `loadRows` in `platform/apps/worker/src/store/rows.ts`:

```ts
/**
 * Each task's last DONE/UNDONE before `sinceDayKey` — the projection's "completed" rule reads it even when
 * it is older than the event window (ADR 007). Same order as the journal: at, deviceId, id.
 */
export function loadTail(sql: SqlStorage, sinceDayKey: string): TaskEvent[] {
  return sql
    .exec<Row>(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY "taskId" ORDER BY "at" DESC, "deviceId" DESC, "id" DESC) AS "rn"
         FROM "events" WHERE "dayKey" < ? AND "taskId" IS NOT NULL AND "type" IN ('DONE', 'UNDONE')
       ) WHERE "rn" = 1`,
      sinceDayKey,
    )
    .toArray()
    .map(decodeEvent);
}
```

- [ ] **Step 5: Load and serve the tail in `SqlStore`**

In `platform/apps/worker/src/store/sqlStore.ts`:

1. Add `journalTail` to the `@imprint/domain` import and `loadTail` to the `./rows` import.
2. In the constructor, replace the row loading with:

```ts
    const since = this.windowStart();
    const rows = loadRows(storage.sql, since);
    for (const t of rows.tasks) this.tasks.set(t.id, t);
    for (const g of rows.groups) this.groups.set(g.id, g);
    for (const e of [...rows.events, ...loadTail(storage.sql, since)]) this.events.set(e.id, e);
```

3. Replace `snapshot()` with:

```ts
  /** `GET /api/state`: every task and group (tombstones kept), the event window plus the journal tail, settings as stored, rev. */
  snapshot(): StateSnapshot {
    const since = this.windowStart();
    const events = [...this.events.values()];
    return {
      tasks: [...this.tasks.values()],
      groups: [...this.groups.values()],
      events: [...events.filter((e) => e.dayKey >= since), ...journalTail(events, since)],
      settings: readSettings(this.storage.sql),
      rev: this.rev,
    };
  }
```

- [ ] **Step 6: Run the worker tests**

Run: `npm run test -w @imprint/worker`
Expected: PASS — including the existing «35-day window» case (its old event is a `CREATED`, not a mark, so the tail adds nothing).

- [ ] **Step 7: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/apps/worker/src/store/schema.ts platform/apps/worker/src/store/rows.ts platform/apps/worker/src/store/sqlStore.ts platform/apps/worker/test/schema.test.ts platform/apps/worker/test/sqlStore.test.ts
git commit -m "worker: journal tail beyond the event window; index events by taskId

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «Three days of life» as a domain test

**Files:**
- Test: `platform/packages/domain/src/day/scenario.test.ts`

**Interfaces:**
- Consumes: `memoryContext({ clock, settings })` (Task 2); tools `create_group`, `add_task`, `set_done`, `move_to_backlog`, `move_to_day`, `rename_task`, `list_day` (Task 5); `instantOf`, `addDays` (Task 1); `DayItem` (Task 4).
- Produces: nothing new — an acceptance test for `07-USECASES` §N.

- [ ] **Step 1: Write the scenario test**

`platform/packages/domain/src/day/scenario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import { ok } from "../tools/fixtures";
import { runTool } from "../tools/index";
import { memoryContext, type MemoryContext } from "../tools/memoryContext";
import type { Group } from "../types";
import type { DayItem } from "./project";

/**
 * 07-USECASES §N «Сквозной прогон — три дня из жизни» as a domain test: one user, a clock that walks
 * Monday → Wednesday, only tools and the projection. Step 16 follows ADR 007 (F5a): the report sent back
 * on Tuesday is already on top on Wednesday.
 */
const MONDAY = "2026-09-28";
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const EVENING = ["зубы", "таблетки", "будильник", "сумка"];

describe.each(["Europe/Moscow", "Etc/GMT+8"])("three days of life in %s", (timezone) => {
  const settings: UserSettings = { timezone, resetHour: 4, resetMinute: 0, language: "ru" };
  let wall = 0;
  const clockAt = (day: number, hh: number, mm = 0) => void (wall = instantOf(addDays(MONDAY, day), hh, mm, timezone));
  const run = (ctx: MemoryContext, name: string, input: unknown) => ok(runTool(ctx, name, input));
  const day = (ctx: MemoryContext) => run(ctx, "list_day", {}).tasks as DayItem[];
  const titles = (ctx: MemoryContext) => day(ctx).map((i) => i.title);
  const idOf = (ctx: MemoryContext, title: string) => ctx.state().tasks.find((t) => t.title === title && t.deletedAt == null)!.id;

  it("Monday → Tuesday → Wednesday", () => {
    clockAt(0, 8);
    const ctx = memoryContext({ clock: () => wall, settings });

    // 2 (A3, E1): the evening routines appear by cadence.
    const evening = (run(ctx, "create_group", { name: "Вечер" }).group as Group).id;
    for (const title of EVENING) run(ctx, "add_task", { title, where: "backlog", groupId: evening, repeatDays: EVERY_DAY });
    expect(titles(ctx)).toEqual(EVENING);

    // 3 (B1, D3): two Day tasks go below, in typing order.
    clockAt(0, 9, 0);
    run(ctx, "add_task", { title: "позвонить в банк", where: "day" });
    clockAt(0, 9, 1);
    run(ctx, "add_task", { title: "забрать посылку", where: "day" });
    expect(titles(ctx)).toEqual([...EVENING, "позвонить в банк", "забрать посылку"]);

    // 4 (C4, C6): «Работа» with a report for tomorrow — in the backlog, not the Day.
    const work = (run(ctx, "create_group", { name: "Работа" }).group as Group).id;
    run(ctx, "add_task", { title: "сделать отчёт", where: "backlog", groupId: work, dueDate: addDays(MONDAY, 1) });
    expect(titles(ctx)).not.toContain("сделать отчёт");

    // 6–7 (H3, D6, D4): the parcel is ticked and sinks; the rest keep their places.
    clockAt(0, 12, 5);
    run(ctx, "set_done", { taskId: idOf(ctx, "забрать посылку"), done: true });
    expect(titles(ctx)).toEqual([...EVENING, "позвонить в банк", "забрать посылку"]);
    expect(day(ctx).at(-1)).toMatchObject({ title: "забрать посылку", doneToday: true });

    // 8 (E3): three routines done, one skipped for tonight.
    clockAt(0, 22);
    for (const title of EVENING.slice(0, 3)) run(ctx, "set_done", { taskId: idOf(ctx, title), done: true });
    run(ctx, "move_to_backlog", { taskId: idOf(ctx, "сумка") });
    expect(titles(ctx)).toEqual(["позвонить в банк", "зубы", "таблетки", "будильник", "забрать посылку"]);

    // 9–10 (F1, E3, F4, F4b): after the 04:00 reset the parcel is gone, the bank call is on top, the
    // report's date brought it in above the routines, and every routine — the skipped one too — is fresh.
    clockAt(1, 4, 5);
    expect(day(ctx).map((i) => [i.title, i.doneToday])).toEqual([
      ["позвонить в банк", false],
      ["сделать отчёт", false],
      ...EVENING.map((t) => [t, false]),
    ]);

    // 12 (C14, G3): a rename does not rewrite yesterday's journal.
    clockAt(1, 10);
    const report = idOf(ctx, "сделать отчёт");
    run(ctx, "rename_task", { taskId: report, title: "сделать отчёт по Q3" });
    expect(ctx.state().events.find((e) => e.taskId === report && e.type === "CREATED")?.title).toBe("сделать отчёт");

    // 14 (D8): the bank call is done; «в бэклог» on a done task does nothing.
    clockAt(1, 15);
    const bank = idOf(ctx, "позвонить в банк");
    run(ctx, "set_done", { taskId: bank, done: true });
    expect(runTool(ctx, "move_to_backlog", { taskId: bank })).toMatchObject({ changed: false, reason: "done_today" });

    // 13 (D9, F5a): tonight the report goes back to the backlog and leaves the Day.
    clockAt(1, 20);
    run(ctx, "move_to_backlog", { taskId: report });
    expect(titles(ctx)).not.toContain("сделать отчёт по Q3");

    // 15 (F1): Wednesday — the bank call is finished for good; the report's date brings it back on top.
    clockAt(2, 4, 5);
    expect(titles(ctx)).toEqual(["сделать отчёт по Q3", ...EVENING]);

    // 16 (ADR 007 edit of D10): «в День» on it keeps its place — its date already put it there.
    run(ctx, "move_to_day", { taskId: report });
    expect(titles(ctx)[0]).toBe("сделать отчёт по Q3");

    // 17 (D13, L1): everything ticked — nothing open is left.
    for (const item of day(ctx)) run(ctx, "set_done", { taskId: item.id, done: true });
    expect(day(ctx).every((i) => i.doneToday)).toBe(true);
  });

  it.skip("steps 1, 5, 11 — onboarding and the imprint banner: W4 (UI) and W5 (get_imprint)", () => {});
  it.skip("steps 18–19 — History and export/import: W6 and W7", () => {});
});
```

- [ ] **Step 2: Run it**

Run: `npm run test -w @imprint/domain -- src/day/scenario.test.ts`
Expected: PASS in both zones (2 passed, 4 skipped). If an order assertion fails, diagnose against SPEC §4.2.1 and the Task 4 tests before changing anything — a wrong expectation here needs an ADR 007 note, not a silent edit.

- [ ] **Step 3: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/packages/domain/src/day/scenario.test.ts
git commit -m "domain: 07-USECASES «three days of life» as a projection test in two zones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ADR 007 and the phase docs

**Files:**
- Create: `platform/docs/adr/007-day-projection.md`
- Modify: `imprint2.0/W3-domain.md` (tick W3a), `platform/CLAUDE.md` (one rule)

**Interfaces:**
- Consumes: the decisions implemented in Tasks 1–7.
- Produces: ADR 007, which the approved test edits cite.

- [ ] **Step 1: Write ADR 007**

`platform/docs/adr/007-day-projection.md`:

```markdown
# 007 — День как проекция: время не пишет, действия пишут

**Статус:** принято · **Дата:** 2026-09-29

## Контекст
В v1 сброс дня — действие: в час сброса `runRolloverIfNeeded` удаляет выполненные одноразовые, переносит
задачи с наступившей датой в День и ставит флаг `lastRolloverDayKey`. Сервер 2.0 обслуживает браузер
(оптимистичный показ, ADR 003) и агентов (W5); мутация по таймеру не повторяется в браузере и ломается
при смене пояса или часа сброса задним числом. ADR 002 уже решил: День — проекция.

## Решение
- День и Бэклог — чистые функции `projectDay` / `projectBacklog` / `locate` от строк, журнала, `today` и
  `UserSettings` (`packages/domain/src/day/`). Сброс — смена аргумента `today`. **Время ничего не пишет;
  явные действия пользователя пишут строку и событие, как в v1.**
- «Сделано» одноразовой — последний `DONE`/`UNDONE` за всё время: `DONE` с `dayKey ≥ today` — отмечена
  сегодня, с `dayKey < today` — **завершена** (скрыта из Дня и Бэклога, строка не удаляется). У рутины —
  последний `DONE`/`UNDONE` за `today`.
- В Дне: строка `DAY` (`row`); строка `BACKLOG` с `dueKey(dueDate) ≤ today` без `MOVED_TO_BACKLOG` за сегодня
  (`due`, ключ — начало её даты); появление рутины (`appearance`, ключ — `dayStart(today)`). Порядок —
  `buildDay` v1.
- `SKIPPED` / `PULLED_TO_DAY` за день: побеждает последнее (в v1 притягивание удаляло пропуск).
- DB-3: при превращении одноразовой в рутину компенсирующие события за сегодня (`UNDONE` за `DONE`,
  `PULLED_TO_DAY` за `SKIPPED` при подходящей каденции). Смена дней у рутины событий не пишет.
- Состояние несёт «хвост» журнала: последний `DONE`/`UNDONE` каждой задачи старше окна в 35 дней.
- Время — только `time/` с поясом и часом сброса пользователя; `dueDate` — полночь даты в поясе
  пользователя, `enteredDayAt` задачи, перенесённой вручную, — начало логического дня.

## Последствия
- **Отличия от v1, осознанные:**
  - строка с наступившей датой остаётся `BACKLOG` (вид `due`), пока пользователь её не тронет;
    `move_to_day` делает её явной строкой Дня на том же месте;
  - смена `resetHour` или пояса сразу меняет `today` (в v1 — со следующего сброса); уже записанные
    `dayKey` не пересчитываются (решение №17);
  - у задачи, перенесённой вручную, `dueDate` (полночь) и `enteredDayAt` (сброс) различаются; в v1 оба
    были моментом сброса;
  - `move_to_day` после пропуска рутины разрешён (раньше `skipped_today`).
- **F5a и шаг 16 `07-USECASES` §N:** задача с прошедшей датой, отправленная «в бэклог», на следующий день
  сама возвращается в День наверх. Шаг 16 («возвращаю в День — встаёт внизу») читается так: она уже
  наверху; «в День» оставляет её на месте. Сам файл `07-USECASES` не правится — его читают вместе с этим ADR.
- Браузер считает тот же День той же функцией из `GET /api/state` (окно + хвост + настройки).
- Пересмотреть, если появится офлайн-писатель со своими часами (мост Android, W7).
```

- [ ] **Step 2: Tick W3a in the phase file**

In `imprint2.0/W3-domain.md`, under «Задачи W3a», change each `- [ ]` to `- [x]` and append to the first item: `(tool — `set_user_settings` / `get_user_settings`, спека 2026-09-29)`. In «Готово, когда» tick `Перенесённые тесты домена v1 зелёные` and `Сквозной сценарий 07-USECASES …`.

- [ ] **Step 3: One rule in `platform/CLAUDE.md`**

Under `## Rules`, after the P1 bullet, add:

```markdown
- **Time (P5):** "today" and dates come only from `packages/domain/src/time/` with the user's `UserSettings`
  (zone, reset). Never `new Date()` getters or `startOfDayMillis` in tools; the Day is a projection (ADR 007).
```

- [ ] **Step 4: Gate and commit**

Run: `npm run check` → green.

```bash
git add platform/docs/adr/007-day-projection.md imprint2.0/W3-domain.md platform/CLAUDE.md
git commit -m "docs: ADR 007 — the Day as a projection; W3a ticked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
