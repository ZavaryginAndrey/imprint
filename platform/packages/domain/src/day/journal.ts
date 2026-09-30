import type { TaskEvent } from "../types";

/**
 * The journal folded per task — the projection's only view of events (SPEC §3.3). Mirrors
 * `com.imprint.app.domain.Completion.of` and extends it to the whole journal: a one-shot's done-ness is
 * its last DONE/UNDONE ever, a repeating task's is its last one today (ADR 007).
 */

export type DayChoice = "SKIPPED" | "PULLED_TO_DAY";

export interface Marks {
  /** Last DONE/UNDONE ever — decides a one-shot (done today, or completed on an earlier day). */
  readonly lastMark: TaskEvent | null;
  /** Last DONE/UNDONE on today — decides a repeating task. */
  readonly lastMarkToday: TaskEvent | null;
  /** The later of today's SKIPPED / PULLED_TO_DAY — a routine's hand override for today. */
  readonly choiceToday: DayChoice | null;
  /** A MOVED_TO_BACKLOG today: a dated task stays out of the Day until tomorrow (F5a). */
  readonly backlogToday: boolean;
}

type MutableMarks = { -readonly [K in keyof Marks]: Marks[K] };

export type JournalIndex = ReadonlyMap<string, Marks>;

/** Shared by every task without events — frozen, so no caller can change another task's marks. */
const NO_MARKS: Marks = Object.freeze({ lastMark: null, lastMarkToday: null, choiceToday: null, backlogToday: false });

/** Code-unit order, not locale: as v1's `Completion.of` and the SQL tail (ADR 007). */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Journal order (SPEC §3.2 rule 4): `at`, then `deviceId`, then `id` — as `Completion.of`. */
export function byJournalOrder(a: TaskEvent, b: TaskEvent): number {
  return a.at - b.at || byCodeUnit(a.deviceId, b.deviceId) || byCodeUnit(a.id, b.id);
}

const isMark = (e: TaskEvent) => e.type === "DONE" || e.type === "UNDONE";

export function indexJournal(events: readonly TaskEvent[], today: string): JournalIndex {
  const index = new Map<string, MutableMarks>();
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
