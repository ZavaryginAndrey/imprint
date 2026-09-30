import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { DAILY, bit } from "../recurrence";
import { dateStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import type { Task, TaskEvent } from "../types";
import { ev, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";
const SUN = "2026-09-27";

function setup(tasks: Task[], events: TaskEvent[] = []) {
  let wall = instantOf(MON, 12, 0, MSK.timezone);
  const groups = [group({ id: "G" }), group({ id: "H", position: 1 })];
  const ctx = memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks, events, groups })] });
  return { ctx, advanceTo: (key: string, hh: number) => void (wall = instantOf(key, hh, 0, MSK.timezone)) };
}
const day = (ctx: MemoryContext) => (ok(runTool(ctx, "list_day", {})).tasks as DayItem[]).map((i) => i.id);
const row = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((t) => t.id === id)!;
const move = (ctx: MemoryContext, input: Record<string, unknown>) => runTool(ctx, "move_task", input);

describe("Backlog → Day: today's, date removed, group kept, at the bottom", () => {
  it("a dated backlog one-shot", () => {
    const { ctx } = setup([task({ id: "t", groupId: "G", dueDate: dateStart("2026-10-05", MSK) }), task({ id: "old", location: "DAY", enteredDayAt: 1 })]);
    ok(move(ctx, { taskId: "t", to: "day" }));
    expect(row(ctx, "t")).toMatchObject({ location: "DAY", dueDate: null, groupId: "G" });
    expect(row(ctx, "t").enteredDayAt).toBeGreaterThan(dateStart(MON, MSK));
    expect(day(ctx)).toEqual(["old", "t"]);
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_DAY", taskId: "t" }]);
  });

  it("a routine off its days, or skipped today, gets an appearance", () => {
    const { ctx } = setup(
      [task({ id: "tue", isRepeating: true, recurrenceMask: bit(1) }), task({ id: "daily", isRepeating: true, recurrenceMask: DAILY })],
      [ev({ id: "s", taskId: "daily", type: "SKIPPED", dayKey: MON })],
    );
    ok(move(ctx, { taskId: "tue", to: "day" }));
    ok(move(ctx, { taskId: "daily", to: "day" }));
    expect(ctx.draft.events.map((e) => [e.taskId, e.type])).toEqual([["tue", "PULLED_TO_DAY"], ["daily", "PULLED_TO_DAY"]]);
    expect(day(ctx).sort()).toEqual(["daily", "tue"]);
    expect(ctx.draft.tasks).toEqual([]);
  });
});

describe("Day → Backlog", () => {
  it("«All tasks»: the group is kept", () => {
    const { ctx } = setup([task({ id: "t", location: "DAY", groupId: "G", enteredDayAt: 1 })]);
    ok(move(ctx, { taskId: "t", to: "backlog" }));
    expect(row(ctx, "t")).toMatchObject({ location: "BACKLOG", groupId: "G", enteredDayAt: null });
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_BACKLOG" }]);
  });

  it("a group filter gives the task that group", () => {
    const { ctx } = setup([task({ id: "t", location: "DAY", groupId: "G", enteredDayAt: 1 })]);
    ok(move(ctx, { taskId: "t", to: "backlog", filterGroupId: "H" }));
    expect(row(ctx, "t")).toMatchObject({ location: "BACKLOG", groupId: "H" });
  });

  it("a task its date brought in: the row takes the group, the event keeps it out today, it is back tomorrow", () => {
    const { ctx, advanceTo } = setup([task({ id: "t", dueDate: dateStart(SUN, MSK) })]);
    ok(move(ctx, { taskId: "t", to: "backlog", filterGroupId: "H" }));
    expect(row(ctx, "t")).toMatchObject({ location: "BACKLOG", groupId: "H", dueDate: dateStart(SUN, MSK) });
    expect(day(ctx)).toEqual([]);
    advanceTo("2026-09-29", 5);
    expect(day(ctx)).toEqual(["t"]);
  });

  it("a routine's appearance is skipped today; the definition takes the filter's group", () => {
    const { ctx } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })]);
    ok(move(ctx, { taskId: "r", to: "backlog", filterGroupId: "G" }));
    expect(row(ctx, "r")).toMatchObject({ groupId: "G", location: "BACKLOG" });
    expect(ctx.draft.events).toMatchObject([{ type: "SKIPPED", taskId: "r", groupId: "G" }]);
    expect(day(ctx)).toEqual([]);
  });
});

describe("refusals write nothing", () => {
  it.each([
    ["already_in_day", [task({ id: "t", location: "DAY" })], [], { taskId: "t", to: "day" }],
    ["already_in_backlog", [task({ id: "t", groupId: "G" })], [], { taskId: "t", to: "backlog", filterGroupId: "H" }],
    ["done_today", [task({ id: "t", location: "DAY", groupId: "G" })], [ev({ id: "d", taskId: "t", dayKey: MON })], { taskId: "t", to: "backlog", filterGroupId: "H" }],
    ["is_step", [task({ id: "p", location: "DAY" }), task({ id: "t", parentId: "p" })], [], { taskId: "t", to: "day" }],
    ["completed", [task({ id: "t", location: "DAY" })], [ev({ id: "d", taskId: "t", dayKey: SUN })], { taskId: "t", to: "day" }],
  ])("%s", (reason, tasks, events, input) => {
    const { ctx } = setup(tasks as Task[], events as TaskEvent[]);
    expect(move(ctx, input)).toEqual({ ok: true, changed: false, reason });
    expect(ctx.draft).toEqual({ tasks: [], groups: [], events: [] });
  });

  it("an unknown task or filter group is not_found; a bad target is invalid_input", () => {
    const { ctx } = setup([task({ id: "t", location: "DAY" })]);
    expect(move(ctx, { taskId: "x", to: "day" })).toMatchObject({ error: "not_found" });
    expect(move(ctx, { taskId: "t", to: "backlog", filterGroupId: "nope" })).toMatchObject({ error: "not_found" });
    expect(move(ctx, { taskId: "t", to: "history" })).toMatchObject({ error: "invalid_input" });
  });
});
