import { todayDayKey } from "./completion";
import { uuid } from "./compose";
import { LOCATION_BACKLOG, LOCATION_DAY, type Task, type TaskEvent } from "./types";

/**
 * Triage builders (5.4c): edit / move / delete an existing task and toggle its completion, all as
 * **last-write-wins updates and journal events in the web's own draft** (decision №30 extended). The
 * phone folds them in with the tested `BackupMerge` — tasks LWW by `updatedAt`, events union by id,
 * tombstones travel. Pure and unit-tested. The subject may be a *peer's* task (from Drive/file); we
 * just write a row with its id and a fresh `updatedAt`.
 *
 * Divergence noted: a web DONE on a split-chain step does **not** run the phone's auto-conveyor
 * (`promoteNextChainStep`) — merge only inserts the event. The phone stays the brain for that; the web
 * is a quiet terminal (decision №30).
 */

export interface TaskEdits {
  title: string;
  groupId: string | null;
  toDay: boolean;
  /** Epoch millis, local start-of-day; backlog only (a Day task carries no dueDate). */
  dueDate: number | null;
}

/** Apply triage edits to a task, stamping a fresh `updatedAt` so LWW picks it. */
export function withEdits(base: Task, edits: TaskEdits, now: number = Date.now()): Task {
  return {
    ...base,
    title: edits.title.trim(),
    groupId: edits.groupId,
    location: edits.toDay ? LOCATION_DAY : LOCATION_BACKLOG,
    dueDate: edits.toDay ? null : edits.dueDate,
    // Keep the original Day arrival if it was already in the Day; stamp one when moving in.
    enteredDayAt: edits.toDay ? (base.enteredDayAt ?? now) : null,
    updatedAt: now,
  };
}

/** Tombstone a task (SPEC §3.2): a newer `deletedAt` deletes on merge; history stays in the journal. */
export function tombstone(base: Task, now: number = Date.now()): Task {
  return { ...base, deletedAt: now, updatedAt: now };
}

/**
 * A DONE/UNDONE event for today (SPEC §3.3), denormalised from the task. Completion folding picks the
 * last DONE/UNDONE per (taskId, dayKey), so a web toggle reconciles cleanly with phone toggles.
 */
export function doneEvent(
  task: Task,
  done: boolean,
  deviceId: string,
  now: number = Date.now(),
  todayKey: string = todayDayKey(),
  newId: () => string = uuid,
): TaskEvent {
  return {
    id: newId(),
    taskId: task.id,
    type: done ? "DONE" : "UNDONE",
    at: now,
    dayKey: todayKey,
    title: task.title,
    groupId: task.groupId,
    isRepeating: task.isRepeating,
    surface: null,
    deviceId,
  };
}
