import type { BackupData, Group, Task, TaskEvent } from "../types";
import type { ToolOk, ToolResult } from "./result";

export const TODAY = "2026-09-28";
/** memoryContext's default first `now()`. */
export const NOON = new Date(2026, 8, 28, 12, 0, 0).getTime();

export function task(p: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "Task", location: "BACKLOG", dueDate: null, startDate: null, groupId: null,
    isRepeating: false, recurrenceMask: 0, priority: 0, parentId: null, position: 0,
    createdAt: 1, enteredDayAt: null, updatedAt: 1, deletedAt: null, ...p,
  };
}

export function group(p: Partial<Group> = {}): Group {
  return { id: "g1", name: "Group", position: 0, isCollapsed: false, color: 0, createdAt: 1, updatedAt: 1, deletedAt: null, ...p };
}

export function ev(p: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: "e1", taskId: "t1", type: "DONE", at: 1, dayKey: TODAY, title: "Task", groupId: null,
    isRepeating: false, surface: null, deviceId: "phone", ...p,
  };
}

/** A peer snapshot (the phone's device-*.json). */
export function snap(p: Partial<Pick<BackupData, "tasks" | "groups" | "events">> = {}): BackupData {
  return { version: 1, tasks: [], groups: [], events: [], settings: {} as BackupData["settings"], ...p };
}

/** Assert the result is ok and return it typed. */
export function ok(r: ToolResult): ToolOk {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r;
}
