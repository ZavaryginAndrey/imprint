import type { BackupData, Group, Task, TaskEvent } from "./types";

/**
 * The consolidated state read from several peer snapshots — the merged rows, tombstones **kept**
 * (a deletion is a `deletedAt` field on the winning row; the view filters them, not the merge).
 */
export interface MergedState {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
  /** How many distinct peer files went into this merge. */
  sourceCount: number;
}

/**
 * Merge-lite (variant A, decision №25 · SPEC §7): fold several `device-*.json` snapshots into one
 * consolidated state, using the *same* rules as the phone's pure `BackupMerge` — but **without**
 * `buildDay` (no rollover / recurrence / selection / cloud projection; those live in Kotlin):
 *
 *  - **Tasks / groups** — last-write-wins by `updatedAt`, keyed by `id`; strictly-newer wins, so a
 *    stale copy never overrides a fresher one and the order files are loaded in doesn't matter.
 *  - **Events** — union by `id`; the append-only journal never conflicts.
 *  - **Settings** — dropped entirely; they are device-behavioural and never travel (decision №25).
 *
 * Mirrors `com.imprint.app.domain.BackupMerge`. Keep the two in step.
 */
export function mergeSnapshots(snapshots: BackupData[]): MergedState {
  const tasks = new Map<string, Task>();
  const groups = new Map<string, Group>();
  const events = new Map<string, TaskEvent>();

  for (const snap of snapshots) {
    for (const t of snap.tasks) {
      const cur = tasks.get(t.id);
      if (!cur || t.updatedAt > cur.updatedAt) tasks.set(t.id, t);
    }
    for (const g of snap.groups) {
      const cur = groups.get(g.id);
      if (!cur || g.updatedAt > cur.updatedAt) groups.set(g.id, g);
    }
    for (const e of snap.events) {
      if (!events.has(e.id)) events.set(e.id, e); // union by id; first wins (identical by id)
    }
  }

  return {
    tasks: [...tasks.values()],
    groups: [...groups.values()],
    events: [...events.values()],
    sourceCount: snapshots.length,
  };
}

/** Live (non-tombstoned) rows only — what the flat lists render. */
export function liveTasks(state: MergedState): Task[] {
  return state.tasks.filter((t) => t.deletedAt == null);
}

export function liveGroups(state: MergedState): Group[] {
  return state.groups.filter((g) => g.deletedAt == null);
}
