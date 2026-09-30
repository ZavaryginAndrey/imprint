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
