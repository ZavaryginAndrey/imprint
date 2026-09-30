import { describe, expect, it } from "vitest";
import { mergeSnapshots } from "./merge";
import type { BackupData, Group, Task, TaskEvent } from "./types";

function task(p: Partial<Task> & Pick<Task, "id" | "updatedAt">): Task {
  return {
    title: p.id, location: "BACKLOG", dueDate: null, startDate: null, groupId: null,
    isRepeating: false, recurrenceMask: 0, priority: 0, parentId: null, position: 0,
    createdAt: 0, enteredDayAt: null, deletedAt: null, ...p,
  };
}
function group(p: Partial<Group> & Pick<Group, "id" | "updatedAt">): Group {
  return { name: p.id, position: 0, isCollapsed: false, color: 0, createdAt: 0, deletedAt: null, ...p };
}
function event(p: Partial<TaskEvent> & Pick<TaskEvent, "id">): TaskEvent {
  return {
    taskId: null, type: "DONE", at: 0, dayKey: "2026-09-18", title: null, groupId: null,
    isRepeating: false, surface: null, deviceId: "d", ...p,
  };
}
function snap(p: Partial<BackupData>): BackupData {
  return { version: 1, tasks: [], groups: [], events: [], settings: {} as BackupData["settings"], ...p };
}

describe("mergeSnapshots", () => {
  it("tasks/groups are last-write-wins by updatedAt", () => {
    const a = snap({ tasks: [task({ id: "t", title: "old", updatedAt: 10 })] });
    const b = snap({ tasks: [task({ id: "t", title: "new", updatedAt: 20 })] });
    const merged = mergeSnapshots([a, b]);
    expect(merged.tasks).toHaveLength(1);
    expect(merged.tasks[0].title).toBe("new");
  });

  it("LWW is order-independent", () => {
    const older = snap({ tasks: [task({ id: "t", title: "old", updatedAt: 10 })] });
    const newer = snap({ tasks: [task({ id: "t", title: "new", updatedAt: 20 })] });
    expect(mergeSnapshots([older, newer]).tasks[0].title).toBe("new");
    expect(mergeSnapshots([newer, older]).tasks[0].title).toBe("new");
  });

  it("events union by id, no duplicates", () => {
    const a = snap({ events: [event({ id: "e1" }), event({ id: "e2" })] });
    const b = snap({ events: [event({ id: "e2" }), event({ id: "e3" })] });
    const merged = mergeSnapshots([a, b]);
    expect(merged.events.map((e) => e.id).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("tombstones travel (kept in merged state, dropped by liveTasks)", () => {
    const a = snap({ tasks: [task({ id: "t", updatedAt: 10 })] });
    const b = snap({ tasks: [task({ id: "t", updatedAt: 20, deletedAt: 99 })] });
    const merged = mergeSnapshots([a, b]);
    expect(merged.tasks[0].deletedAt).toBe(99);
  });

  it("groups merge independently and keep newer", () => {
    const a = snap({ groups: [group({ id: "g", name: "A", updatedAt: 5 })] });
    const b = snap({ groups: [group({ id: "g", name: "B", updatedAt: 1 })] });
    expect(mergeSnapshots([a, b]).groups[0].name).toBe("A");
  });
});
