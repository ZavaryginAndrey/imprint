import { describe, expect, it } from "vitest";
import { ev, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const peers = [
  snap({
    groups: [group({ id: "g2", name: "Work", position: 1 }), group({ id: "g1", name: "Home", position: 0 }), group({ id: "dead", deletedAt: 1 })],
    tasks: [
      task({ id: "d2", location: "DAY", enteredDayAt: 20 }),
      task({ id: "d1", location: "DAY", enteredDayAt: 10 }),
      task({ id: "b1", groupId: "g1", position: 1 }),
      task({ id: "b0", groupId: "g1", position: 0 }),
      task({ id: "orphan", groupId: "dead" }),
      task({ id: "loose" }),
      task({ id: "rep", isRepeating: true, recurrenceMask: 127 }),
      task({ id: "gone", location: "DAY", deletedAt: 5 }),
    ],
    events: [ev({ taskId: "d2", type: "DONE" })],
  }),
];

describe("list_day", () => {
  it("the projected Day: rows by arrival, today's appearance at the reset, done last", () => {
    const r = ok(runTool(memoryContext({ peers }), "list_day", {}));
    expect(r.tasks).toMatchObject([
      { id: "d1", kind: "row", doneToday: false },
      { id: "rep", kind: "appearance", doneToday: false },
      { id: "d2", kind: "row", doneToday: true },
    ]);
    expect(r.changed).toBe(false);
  });
});

describe("list_backlog", () => {
  it("groups by position (empty ones too); tasks of a deleted group fall into ungrouped", () => {
    const r = ok(runTool(memoryContext({ peers }), "list_backlog", {}));
    const groups = r.groups as { group: { id: string }; tasks: { id: string }[] }[];
    expect(groups.map((x) => [x.group.id, x.tasks.map((t) => t.id)])).toEqual([
      ["g1", ["b0", "b1"]],
      ["g2", []],
    ]);
    expect((r.ungrouped as { id: string }[]).map((t) => t.id).sort()).toEqual(["loose", "orphan", "rep"]);
  });
});

describe("list_groups", () => {
  it("live groups with live task counts", () => {
    const r = ok(runTool(memoryContext({ peers }), "list_groups", {}));
    expect(r.groups).toMatchObject([
      { id: "g1", taskCount: 2 },
      { id: "g2", taskCount: 0 },
    ]);
  });
});
