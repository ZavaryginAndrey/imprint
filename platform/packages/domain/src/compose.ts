import { todayDayKey } from "./completion";
import { LOCATION_BACKLOG, LOCATION_DAY, type Task, type TaskEvent } from "./types";

/**
 * The append-only writer core (5.4b, variant A): build new `Task` + `CREATED` `TaskEvent` rows in the
 * **exact** entity schema, so the phone folds them in with the tested `BackupMerge` (SPEC §3.4). Pure
 * and unit-tested — mirrors `ChecklistRepository.addDayTask` / `addBacklogTask`:
 *
 *  - **Day now** → `location=DAY`, `enteredDayAt = createdAt = updatedAt = now`.
 *  - **Backlog** → `location=BACKLOG`, optional `groupId` / `dueDate`. Promotion of a due backlog task
 *    into the Day is **not** done here — that is the phone's rollover job; the web only contributes the
 *    row (a divergence noted on purpose, decision №30).
 *
 * The web never recomputes the Day (variant A). `dayKey` on the CREATED event uses the local calendar
 * day, not the device `resetHour` (which never syncs — decision №25); harmless, since completion only
 * reads DONE/UNDONE.
 */

export interface NewTaskInput {
  title: string;
  toDay: boolean;
  groupId: string | null;
  /** Epoch millis, local start-of-day; backlog only. */
  dueDate: number | null;
  /** 7-bit weekday cadence (see recurrence.ts). 0 = one-shot; > 0 = a repeating backlog definition. */
  recurrenceMask: number;
}

/** A pair of rows one "add" contributes. */
export interface Contribution {
  task: Task;
  event: TaskEvent;
}

/** UUID v4 (crypto.randomUUID everywhere modern; a tiny fallback keeps tests/older runtimes happy). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Local start-of-day epoch millis for a YYYY-MM-DD date string (matches Task.dueDate's contract). */
export function startOfDayMillis(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Build the `Task` + `CREATED` `TaskEvent` for one add. `deviceId` is the web peer's id; `now`/`todayKey`
 * are injectable for tests; `newId` gives the task's id, then the event's (ADR 011).
 */
export function buildContribution(
  input: NewTaskInput,
  deviceId: string,
  now: number = Date.now(),
  todayKey: string = todayDayKey(),
  newId: () => string = uuid,
): Contribution {
  const title = input.title.trim();
  const repeating = input.recurrenceMask > 0;
  // A repeating task is a Backlog *definition* (mirrors ChecklistRepository.setRepeating): its Day
  // appearances are computed by the phone's buildDay from the mask — the web never places it in the Day.
  const task: Task = {
    id: newId(),
    title,
    location: repeating ? LOCATION_BACKLOG : input.toDay ? LOCATION_DAY : LOCATION_BACKLOG,
    dueDate: repeating || input.toDay ? null : input.dueDate,
    startDate: null,
    groupId: input.groupId,
    isRepeating: repeating,
    recurrenceMask: repeating ? input.recurrenceMask : 0,
    priority: 0,
    parentId: null,
    position: 0,
    createdAt: now,
    enteredDayAt: !repeating && input.toDay ? now : null,
    updatedAt: now,
    deletedAt: null,
  };
  const event: TaskEvent = {
    id: newId(),
    taskId: task.id,
    type: "CREATED",
    at: now,
    dayKey: todayKey,
    title: task.title,
    groupId: task.groupId,
    isRepeating: repeating,
    surface: null,
    deviceId,
  };
  return { task, event };
}
