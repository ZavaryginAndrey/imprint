import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { DAILY, bit } from "../recurrence";
import { dateStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import type { Task } from "../types";
import { ev, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";
const SUN = "2026-09-27";

function setup(tasks: Task[] = [], events = snap().events) {
  let wall = instantOf(MON, 12, 0, MSK.timezone);
  const ctx = memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks, events })] });
  return { ctx, advanceTo: (key: string, hh: number) => void (wall = instantOf(key, hh, 0, MSK.timezone)) };
}
const day = (ctx: MemoryContext) => ok(runTool(ctx, "list_day", {})).tasks as DayItem[];
const row = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((t) => t.id === id)!;

describe("dates live in the user's zone", () => {
  it("add_task and set_due_date store local midnight in the user's zone", () => {
    const { ctx } = setup([task({ id: "t1" })]);
    const added = ok(runTool(ctx, "add_task", { title: "Pay", where: "backlog", dueDate: "2026-10-01" })).task as Task;
    expect(added.dueDate).toBe(Date.UTC(2026, 8, 30, 21, 0));
    ok(runTool(ctx, "set_due_date", { taskId: "t1", date: "2026-10-05" }));
    expect(row(ctx, "t1").dueDate).toBe(Date.UTC(2026, 9, 4, 21, 0));
  });
});

describe("move_to_day / move_to_backlog decide by the projection", () => {
  it("«в День» on a dated task already in the Day makes it a row in the same slot", () => {
    const { ctx } = setup([task({ id: "t", dueDate: dateStart(SUN, MSK) })]);
    ok(runTool(ctx, "move_to_day", { taskId: "t" }));
    expect(row(ctx, "t")).toMatchObject({ location: "DAY", dueDate: dateStart(SUN, MSK), enteredDayAt: dateStart(SUN, MSK) });
    expect(runTool(ctx, "move_to_day", { taskId: "t" })).toMatchObject({ changed: false, reason: "already_in_day" });
  });

  it("«в бэклог» on a dated task writes only the event; tomorrow it is back by its date (F5a)", () => {
    const { ctx, advanceTo } = setup([task({ id: "t", dueDate: dateStart(SUN, MSK) }), task({ id: "new", location: "DAY", enteredDayAt: 1 })]);
    ok(runTool(ctx, "move_to_backlog", { taskId: "t" }));
    expect(ctx.draft.tasks).toEqual([]);
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_BACKLOG", taskId: "t", dayKey: MON }]);
    expect(day(ctx).map((i) => i.id)).toEqual(["new"]);
    advanceTo("2026-09-29", 5);
    expect(day(ctx).map((i) => [i.id, i.kind])).toEqual([["new", "row"], ["t", "due"]]);
  });

  it("«в бэклог» on a routine that is not in today's list is already_in_backlog and writes nothing", () => {
    const { ctx } = setup([task({ id: "tue", isRepeating: true, recurrenceMask: bit(1) })]);
    expect(runTool(ctx, "move_to_backlog", { taskId: "tue" })).toMatchObject({ changed: false, reason: "already_in_backlog" });
    expect(ctx.draft.events).toEqual([]);
  });
});

describe("set_repeating keeps today's marks honest", () => {
  it("DB-3: skip → stop repeating → repeat again brings the routine back today", () => {
    const { ctx } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })]);
    ok(runTool(ctx, "move_to_backlog", { taskId: "r" }));
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }));
    expect(day(ctx)).toMatchObject([{ id: "r", kind: "appearance", doneToday: false }]);
  });

  it("DB-3: a one-shot done today turned into a routine starts unchecked", () => {
    const { ctx } = setup([task({ id: "t", location: "DAY" })], [ev({ taskId: "t", type: "DONE", dayKey: MON })]);
    ok(runTool(ctx, "set_repeating", { taskId: "t", days: ["mon"] }));
    expect(day(ctx)).toMatchObject([{ id: "t", kind: "appearance", doneToday: false }]);
  });

  it("changing a routine's days does not touch today's marks", () => {
    const { ctx } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })], [ev({ taskId: "r", type: "DONE", dayKey: MON })]);
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: ["mon", "wed"] }));
    expect(ctx.draft.events).toEqual([]);
    expect(day(ctx)).toMatchObject([{ id: "r", doneToday: true }]);
  });

  it("decision №15: stopping a routine checked today keeps it checked in the Day until the reset", () => {
    const { ctx, advanceTo } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })], [ev({ taskId: "r", type: "DONE", dayKey: MON })]);
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    expect(row(ctx, "r")).toMatchObject({ isRepeating: false, location: "DAY" });
    expect(day(ctx)).toMatchObject([{ id: "r", kind: "row", doneToday: true }]);
    advanceTo("2026-09-29", 5);
    expect(day(ctx)).toEqual([]);
  });
});
