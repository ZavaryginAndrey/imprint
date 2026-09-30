import { describe, expect, it } from "vitest";
import { DAILY } from "../recurrence";
import { addDays } from "../time/day";
import { ev, task } from "../tools/fixtures";
import { MSK, THU, WED, world } from "./fixtures";
import { doneNow, locate, openCountByGroup, projectBacklog, projectDay } from "./project";

const stepIds = (item: { steps: { task: { id: string } }[] }) => item.steps.map((s) => s.task.id);

describe("steps are a checklist inside their task (ADR 008)", () => {
  it("nest under the parent in list order and are never rows of their own", () => {
    const state = world([
      task({ id: "p", location: "DAY", enteredDayAt: 1 }),
      task({ id: "s1", parentId: "p", position: 1, createdAt: 1 }),
      task({ id: "s0", parentId: "p", position: 0, createdAt: 2 }),
      task({ id: "b", title: "backlog parent" }),
      task({ id: "bs", parentId: "b" }),
    ]);
    const day = projectDay(state, THU, MSK);
    expect(day.map((i) => i.id)).toEqual(["p"]);
    expect(stepIds(day[0])).toEqual(["s0", "s1"]);
    expect(day[0].steps.map((s) => s.done)).toEqual([false, false]);
    const backlog = projectBacklog(state, THU, MSK).ungrouped;
    expect(backlog.map((i) => i.id)).toEqual(["b"]);
    expect(stepIds(backlog[0])).toEqual(["bs"]);
    expect(locate(state, "s0", THU, MSK)).toEqual({ place: "hidden", kind: null });
  });

  it("a one-shot's step keeps its mark across days", () => {
    const state = world(
      [task({ id: "p", location: "DAY" }), task({ id: "s", parentId: "p" })],
      [ev({ id: "d", taskId: "s", dayKey: WED })],
    );
    expect(projectDay(state, THU, MSK)[0].steps).toMatchObject([{ task: { id: "s" }, done: true }]);
    expect(doneNow(state, "s", THU)).toBe(true);
  });

  it("a routine's steps reset every day", () => {
    const state = world(
      [task({ id: "r", isRepeating: true, recurrenceMask: DAILY }), task({ id: "s", parentId: "r" })],
      [ev({ id: "d", taskId: "s", dayKey: WED })],
    );
    expect(projectDay(state, WED, MSK)[0].steps[0].done).toBe(true);
    expect(projectDay(state, THU, MSK)[0].steps[0].done).toBe(false);
    expect(doneNow(state, "s", THU)).toBe(false);
  });

  it("a deleted parent hides its steps; a deleted step is not listed", () => {
    const gone = world([task({ id: "p", location: "DAY", deletedAt: 5 }), task({ id: "s", parentId: "p" })]);
    expect(projectDay(gone, THU, MSK)).toEqual([]);
    expect(projectBacklog(gone, THU, MSK).ungrouped).toEqual([]);
    const oneGone = world([task({ id: "p", location: "DAY" }), task({ id: "s", parentId: "p", deletedAt: 5 })]);
    expect(projectDay(oneGone, THU, MSK)[0].steps).toEqual([]);
  });

  it("a parentId naming no row is an ordinary task (v1 chains, until W7)", () => {
    const state = world([task({ id: "orphan", parentId: "ghost", location: "DAY" })]);
    expect(projectDay(state, THU, MSK)).toMatchObject([{ id: "orphan", kind: "row", steps: [] }]);
  });
});

describe("openCountByGroup (UX §2 counters)", () => {
  it("counts open top-level tasks in the Day or the Backlog; done, finished, deleted and steps are not", () => {
    const state = world(
      [
        task({ id: "day", location: "DAY", groupId: "g" }),
        task({ id: "back", groupId: "g" }),
        task({ id: "doneToday", location: "DAY", groupId: "g" }),
        task({ id: "finished", groupId: "g" }),
        task({ id: "gone", groupId: "g", deletedAt: 5 }),
        task({ id: "routine", groupId: "g", isRepeating: true, recurrenceMask: DAILY }),
        task({ id: "step", groupId: "g", parentId: "day" }),
        task({ id: "other", groupId: "h" }),
      ],
      [ev({ id: "a", taskId: "doneToday", dayKey: THU }), ev({ id: "b", taskId: "finished", dayKey: WED })],
    );
    expect(Object.fromEntries(openCountByGroup(state, THU, MSK))).toEqual({ g: 3, h: 1 });
    expect(openCountByGroup(state, addDays(THU, 1), MSK).get("g")).toBe(3);
  });
});
