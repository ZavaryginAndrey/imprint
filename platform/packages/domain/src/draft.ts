import type { BackupData, Group, Settings, Task, TaskEvent } from "./types";

/**
 * The pure half of `web/src/draft.ts`: a peer's own rows and their encoding as a [BackupData]
 * snapshot. The `localStorage` half stays in the frozen `web/` — the platform keeps rows in the
 * user's Durable Object (W2), and `memoryContext` keeps them in memory.
 */

export interface Draft {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
}

/** Defaults mirror `com.imprint.app.data.Settings` — present only so `BackupJson.decode` won't throw. */
const DEFAULT_SETTINGS: Settings = {
  dayRemindersEnabled: true,
  dayStartHour: 9,
  dayStartMinute: 0,
  dayEndHour: 21,
  dayEndMinute: 0,
  dayIntervalMinutes: 180,
  eveningEnabled: true,
  eveningHour: 22,
  eveningMinute: 0,
  resetHour: 4,
  resetMinute: 0,
  overlayEnabled: true,
  dynamicTheme: true,
};

/** True when the draft holds nothing to push — no task, group or event rows. */
export function isEmptyDraft(draft: Draft): boolean {
  return draft.tasks.length === 0 && draft.groups.length === 0 && draft.events.length === 0;
}

/**
 * The draft as a [BackupData] snapshot for `device-web-<id>.json`. `groups` is optional in the input
 * so a pre-groups draft shape (tasks + events only) still encodes, with `groups: []`.
 */
export function draftToSnapshot(draft: Omit<Draft, "groups"> & { groups?: Group[] }): BackupData {
  return { version: 1, tasks: draft.tasks, groups: draft.groups ?? [], events: draft.events, settings: DEFAULT_SETTINGS };
}
