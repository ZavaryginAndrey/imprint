import { describe, expect, it } from "vitest";
import { DAILY, bit } from "../recurrence";
import { addDays, dateStart, dayStart } from "../time/day";
import { ev, group, task } from "../tools/fixtures";
import { MSK, THU, WED, world } from "./fixtures";
import { locate, projectBacklog, projectDay } from "./project";

const HOUR = 3_600_000;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("projectDay order (buildDay, SPEC §4.2.1)", () => {
  it("a group clusters at its earliest member; then arrival, then createdAt; done sinks", () => {
    const state = world(
      [
        task({ id: "gA", location: "DAY", groupId: "g", enteredDayAt: 10 }),
        task({ id: "loner", location: "DAY", enteredDayAt: 20 }),
        task({ id: "gB", location: "DAY", groupId: "g", enteredDayAt: 30 }),
        task({ id: "first", location: "DAY", enteredDayAt: 5 }),
      ],
      [ev({ id: "d", taskId: "first", type: "DONE", dayKey: THU })],
    );
    expect(ids(projectDay(state, THU, MSK))).toEqual(["gA", "gB", "loner", "first"]);
  });

  it("routines sit at the reset: below yesterday's leftovers and a date that arrived at midnight, above today's typing", () => {
    const state = world([
      task({ id: "routine", isRepeating: true, recurrenceMask: DAILY }),
      task({ id: "leftover", location: "DAY", enteredDayAt: dayStart(WED, MSK) + HOUR }),
      task({ id: "dated", dueDate: dateStart(THU, MSK) }),
      task({ id: "typed", location: "DAY", enteredDayAt: dayStart(THU, MSK) + HOUR }),
    ]);
    expect(ids(projectDay(state, THU, MSK))).toEqual(["leftover", "dated", "routine", "typed"]);
  });

  it("a one-shot done yesterday and undone today is open in the Day again", () => {
    const state = world(
      [task({ id: "t", location: "DAY" })],
      [ev({ id: "a", taskId: "t", type: "DONE", dayKey: WED, at: 1 }), ev({ id: "b", taskId: "t", type: "UNDONE", dayKey: THU, at: 2 })],
    );
    expect(projectDay(state, THU, MSK)).toMatchObject([{ id: "t", kind: "row", doneToday: false }]);
  });

  it("deleted tasks are nowhere", () => {
    const state = world([task({ id: "gone", location: "DAY", deletedAt: 5 })]);
    expect(projectDay(state, THU, MSK)).toEqual([]);
    expect(locate(state, "gone", THU, MSK)).toEqual({ place: "hidden", kind: null });
    expect(locate(state, "unknown", THU, MSK)).toEqual({ place: "hidden", kind: null });
  });
});

describe("F5a: a dated task sent back to the backlog", () => {
  const state = world(
    [task({ id: "t", dueDate: dateStart(WED, MSK) })],
    [ev({ id: "m", taskId: "t", type: "MOVED_TO_BACKLOG", dayKey: THU })],
  );

  it("stays out of the Day for the rest of today", () => {
    expect(locate(state, "t", THU, MSK)).toEqual({ place: "backlog", kind: null });
    expect(ids(projectBacklog(state, THU, MSK).ungrouped)).toEqual(["t"]);
  });

  it("is back tomorrow, on top by its date", () => {
    const tomorrow = addDays(THU, 1);
    expect(projectDay(state, tomorrow, MSK)).toMatchObject([{ id: "t", kind: "due", sortKey: dateStart(WED, MSK) }]);
  });
});

describe("projectBacklog", () => {
  const groups = [group({ id: "g2", name: "Work", position: 1 }), group({ id: "g1", name: "Home", position: 0 }), group({ id: "dead", deletedAt: 1 })];

  it("sections by group position (empty ones too); a deleted group's tasks are ungrouped", () => {
    const state = world(
      [task({ id: "b1", groupId: "g1", position: 1 }), task({ id: "b0", groupId: "g1", position: 0 }), task({ id: "orphan", groupId: "dead" }), task({ id: "loose" })],
      [],
      groups,
    );
    const view = projectBacklog(state, THU, MSK);
    expect(view.groups.map((s) => [s.group.id, ids(s.tasks)])).toEqual([
      ["g1", ["b0", "b1"]],
      ["g2", []],
    ]);
    expect(ids(view.ungrouped).sort()).toEqual(["loose", "orphan"]);
  });

  it("holds every repeating definition, even one appearing in the Day today", () => {
    const state = world([task({ id: "daily", isRepeating: true, recurrenceMask: DAILY }), task({ id: "mondays", isRepeating: true, recurrenceMask: bit(0) })]);
    expect(ids(projectDay(state, THU, MSK))).toEqual(["daily"]);
    expect(ids(projectBacklog(state, THU, MSK).ungrouped).sort()).toEqual(["daily", "mondays"]);
  });

  it("a date that has arrived puts the task in the Day, not the Backlog", () => {
    const state = world([task({ id: "due", dueDate: dateStart(THU, MSK) }), task({ id: "later", dueDate: dateStart(addDays(THU, 3), MSK) })]);
    expect(ids(projectBacklog(state, THU, MSK).ungrouped)).toEqual(["later"]);
  });

  it("a one-shot done today stays, last in its section; the next day it is gone", () => {
    const state = world(
      [task({ id: "done", position: 0 }), task({ id: "open", position: 1 })],
      [ev({ id: "d", taskId: "done", type: "DONE", dayKey: THU })],
    );
    expect(projectBacklog(state, THU, MSK).ungrouped).toMatchObject([
      { id: "open", doneToday: false },
      { id: "done", doneToday: true },
    ]);
    expect(ids(projectBacklog(state, addDays(THU, 1), MSK).ungrouped)).toEqual(["open"]);
  });
});
