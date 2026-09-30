import { uuid } from "../compose";
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
  /** Id source for new rows and events; default `uuid` (ADR 011). */
  ids?: () => string;
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
    newId: opts.ids ?? uuid,
  };
}
