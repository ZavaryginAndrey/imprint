import { describe, expect, it } from "vitest";
import { completionsInWindow, doneTodayIds, windowStartKey } from "./completion";
import type { TaskEvent } from "./types";

function ev(p: Partial<TaskEvent> & Pick<TaskEvent, "id" | "type" | "at" | "dayKey">): TaskEvent {
  return { taskId: "t", title: null, groupId: null, isRepeating: false, surface: null, deviceId: "d", ...p };
}

describe("completion folding", () => {
  it("last DONE/UNDONE within a day wins", () => {
    const events = [
      ev({ id: "1", type: "DONE", at: 100, dayKey: "2026-09-18" }),
      ev({ id: "2", type: "UNDONE", at: 200, dayKey: "2026-09-18" }),
    ];
    expect(doneTodayIds(events, "2026-09-18").has("t")).toBe(false);

    const reDone = [...events, ev({ id: "3", type: "DONE", at: 300, dayKey: "2026-09-18" })];
    expect(doneTodayIds(reDone, "2026-09-18").has("t")).toBe(true);
  });

  it("orders by (at, deviceId, id) for equal timestamps", () => {
    const events = [
      ev({ id: "b", type: "UNDONE", at: 100, dayKey: "2026-09-18", deviceId: "z" }),
      ev({ id: "a", type: "DONE", at: 100, dayKey: "2026-09-18", deviceId: "a" }),
    ];
    // deviceId "z" sorts after "a", so UNDONE is last → not done.
    expect(doneTodayIds(events, "2026-09-18").has("t")).toBe(false);
  });

  it("completionsInWindow counts one per (taskId, dayKey), attributes group", () => {
    const events = [
      ev({ id: "1", type: "DONE", at: 1, dayKey: "2026-09-18", groupId: "g1" }),
      ev({ id: "2", type: "DONE", at: 1, dayKey: "2026-09-17", groupId: "g1" }),
      ev({ id: "3", type: "DONE", at: 1, dayKey: "2026-09-17", groupId: "g1", taskId: "t" }), // dup day
    ];
    const done = completionsInWindow(events, 30, "2026-09-18");
    expect(done).toHaveLength(2);
    expect(done.every((c) => c.groupId === "g1")).toBe(true);
  });

  it("respects the window lower bound", () => {
    const start = windowStartKey("2026-09-18", 30);
    expect(start).toBe("2026-08-20");
    const events = [
      ev({ id: "old", type: "DONE", at: 1, dayKey: "2026-08-19" }), // one day before window
      ev({ id: "in", type: "DONE", at: 1, dayKey: "2026-08-20", taskId: "u" }),
    ];
    const done = completionsInWindow(events, 30, "2026-09-18");
    expect(done.map((c) => c.taskId)).toEqual(["u"]);
  });
});
