/**
 * The JSON contract, mirrored from the Kotlin entity schema (SPEC §3.2/§3.3/§3.4).
 *
 * A Drive snapshot file (`device-*.json`) is a `BackupData`, encoded by
 * `com.imprint.app.data.backup.BackupJson`. The web peer reads these verbatim and — later, 5.4b —
 * writes only its own `device-web-*.json` in this exact shape, so the phone folds it back with the
 * already-tested `BackupMerge`. Keep this file in lock-step with the Kotlin entities:
 *   - Task      → app/src/main/java/com/imprint/app/data/Task.kt
 *   - Group     → app/src/main/java/com/imprint/app/data/Group.kt
 *   - TaskEvent → app/src/main/java/com/imprint/app/data/TaskEvent.kt
 *   - Settings  → app/src/main/java/com/imprint/app/data/Settings.kt
 *   - BackupJson → app/src/main/java/com/imprint/app/data/backup/BackupJson.kt
 */

import type { GroupColorKey, GroupIconKey } from "./group/palette";

export const LOCATION_DAY = "DAY";
export const LOCATION_BACKLOG = "BACKLOG";

/** Journal event kinds — `EventType.name` in Kotlin. */
export type EventType =
  | "CREATED"
  | "DONE"
  | "UNDONE"
  | "MOVED_TO_DAY"
  | "MOVED_TO_BACKLOG"
  | "SURFACED"
  | "SPLIT"
  | "SHOWN"
  | "DELETED"
  | "SKIPPED"
  | "PULLED_TO_DAY";

export interface Task {
  id: string;
  title: string;
  location: string; // LOCATION_DAY | LOCATION_BACKLOG
  dueDate: number | null;
  startDate: number | null;
  groupId: string | null;
  isRepeating: boolean;
  recurrenceMask: number;
  priority: number;
  parentId: string | null;
  position: number;
  createdAt: number;
  enteredDayAt: number | null;
  updatedAt: number;
  deletedAt: number | null; // tombstone: non-null means deleted
}

export interface Group {
  id: string;
  name: string;
  position: number;
  isCollapsed: boolean;
  color: number; // packed ARGB
  /** 2.0 only (UX §5): the colour key; `color` is derived from it (`argbOf`). Absent on v1 rows — read via `groupLook`. */
  colorKey?: GroupColorKey | null;
  /** 2.0 only: Phosphor icon key; absent means "tag". */
  icon?: GroupIconKey;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface TaskEvent {
  id: string;
  taskId: string | null;
  type: string; // an EventType name
  at: number;
  dayKey: string; // YYYY-MM-DD logical day, stamped once at write time
  title: string | null;
  groupId: string | null;
  isRepeating: boolean;
  surface: string | null;
  deviceId: string;
}

/** Device-behavioural — NOT synced (decision №25). Present in a file but the web peer ignores it. */
export interface Settings {
  dayRemindersEnabled: boolean;
  dayStartHour: number;
  dayStartMinute: number;
  dayEndHour: number;
  dayEndMinute: number;
  dayIntervalMinutes: number;
  eveningEnabled: boolean;
  eveningHour: number;
  eveningMinute: number;
  resetHour: number;
  resetMinute: number;
  overlayEnabled: boolean;
  dynamicTheme: boolean;
}

export interface BackupData {
  version: number;
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
  settings: Settings;
}
