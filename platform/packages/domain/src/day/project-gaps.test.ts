import { describe, expect, it } from "vitest";
import { DAILY } from "../recurrence";
import { addDays, dateStart } from "../time/day";
import { ev, task } from "../tools/fixtures";
import { MSK, THU, WED, world } from "./fixtures";
import { locate, projectBacklog, projectDay } from "./project";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("projection gaps from the W3a review", () => {
  it("two done tasks sink together and keep their order", () => {
    const state = world(
      [
        task({ id: "a", location: "DAY", enteredDayAt: 10 }),
        task({ id: "b", location: "DAY", enteredDayAt: 20 }),
        task({ id: "c", location: "DAY", enteredDayAt: 30 }),
      ],
      [ev({ id: "da", taskId: "a", dayKey: THU, at: 2 }), ev({ id: "db", taskId: "b", dayKey: THU, at: 1 })],
    );
    expect(ids(projectDay(state, THU, MSK))).toEqual(["c", "a", "b"]);
  });

  it("two groups anchored at the same moment order by group id", () => {
    const state = world([
      task({ id: "x1", location: "DAY", groupId: "gb", enteredDayAt: 10 }),
      task({ id: "y1", location: "DAY", groupId: "ga", enteredDayAt: 10 }),
      task({ id: "x2", location: "DAY", groupId: "gb", enteredDayAt: 40 }),
      task({ id: "y2", location: "DAY", groupId: "ga", enteredDayAt: 50 }),
    ]);
    expect(ids(projectDay(state, THU, MSK))).toEqual(["y1", "y2", "x1", "x2"]);
  });

  it("a routine done today is checked in the Day and in the Backlog, and fresh the next day", () => {
    const state = world([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })], [ev({ id: "d", taskId: "r", dayKey: THU })]);
    expect(projectDay(state, THU, MSK)).toMatchObject([{ id: "r", kind: "appearance", doneToday: true }]);
    expect(projectBacklog(state, THU, MSK).ungrouped).toMatchObject([{ id: "r", doneToday: true }]);
    const friday = addDays(THU, 1);
    expect(projectDay(state, friday, MSK)).toMatchObject([{ id: "r", doneToday: false }]);
    expect(projectBacklog(state, friday, MSK).ungrouped).toMatchObject([{ id: "r", doneToday: false }]);
  });

  it("a dated one-shot finished yesterday is not brought back by its date", () => {
    const state = world([task({ id: "t", dueDate: dateStart(WED, MSK) })], [ev({ id: "d", taskId: "t", dayKey: WED })]);
    expect(projectDay(state, THU, MSK)).toEqual([]);
    expect(projectBacklog(state, THU, MSK).ungrouped).toEqual([]);
    expect(locate(state, "t", THU, MSK)).toEqual({ place: "completed", kind: null });
  });
});
