import { describe, expect, it } from "vitest";
import { doneEvent, tombstone, withEdits, type TaskEdits } from "./edit";
import type { Task } from "./types";

function task(p: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "old", location: "BACKLOG", dueDate: null, startDate: null, groupId: null,
    isRepeating: false, recurrenceMask: 0, priority: 0, parentId: null, position: 0,
    createdAt: 1, enteredDayAt: null, updatedAt: 1, deletedAt: null, ...p,
  };
}

describe("withEdits", () => {
  it("edits title/group, moves to Day: sets enteredDayAt, clears dueDate, bumps updatedAt", () => {
    const edits: TaskEdits = { title: "  new  ", groupId: "g2", toDay: true, dueDate: 999 };
    const out = withEdits(task({ dueDate: 500 }), edits, 1000);
    expect(out.id).toBe("t1"); // same id → LWW upsert on the phone
    expect(out.title).toBe("new");
    expect(out.groupId).toBe("g2");
    expect(out.location).toBe("DAY");
    expect(out.enteredDayAt).toBe(1000);
    expect(out.dueDate).toBeNull(); // Day tasks carry no dueDate
    expect(out.updatedAt).toBe(1000);
  });

  it("moving to Backlog keeps dueDate and drops enteredDayAt", () => {
    const out = withEdits(task({ location: "DAY", enteredDayAt: 5 }), { title: "x", groupId: null, toDay: false, dueDate: 777 }, 2000);
    expect(out.location).toBe("BACKLOG");
    expect(out.enteredDayAt).toBeNull();
    expect(out.dueDate).toBe(777);
  });

  it("editing a task already in the Day preserves its original enteredDayAt", () => {
    const out = withEdits(task({ location: "DAY", enteredDayAt: 42 }), { title: "x", groupId: null, toDay: true, dueDate: null }, 9000);
    expect(out.enteredDayAt).toBe(42);
  });
});

describe("tombstone", () => {
  it("sets deletedAt and updatedAt so a newer deletion wins on merge", () => {
    const out = tombstone(task(), 3000);
    expect(out.deletedAt).toBe(3000);
    expect(out.updatedAt).toBe(3000);
  });
});

describe("doneEvent", () => {
  it("DONE event denormalises the task and carries the web deviceId + today", () => {
    const e = doneEvent(task({ groupId: "g1", isRepeating: true }), true, "web-1", 100, "2026-09-19");
    expect(e.type).toBe("DONE");
    expect(e.taskId).toBe("t1");
    expect(e.title).toBe("old");
    expect(e.groupId).toBe("g1");
    expect(e.isRepeating).toBe(true);
    expect(e.dayKey).toBe("2026-09-19");
    expect(e.deviceId).toBe("web-1");
  });

  it("UNDONE when done=false", () => {
    expect(doneEvent(task(), false, "web-1").type).toBe("UNDONE");
  });
});
