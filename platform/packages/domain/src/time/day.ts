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
