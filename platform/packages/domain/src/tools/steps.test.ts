import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { DAILY } from "../recurrence";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import type { Task } from "../types";
import { NOON, ev, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const day = (ctx: MemoryContext) => ok(runTool(ctx, "list_day", {})).tasks as DayItem[];
const types = (ctx: MemoryContext, taskId: string) => ctx.draft.events.filter((e) => e.taskId === taskId).map((e) => e.type);

describe("add_steps", () => {
  it("appends steps after the existing ones; the task stays where it is", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "p", location: "DAY" }), task({ id: "old", parentId: "p", position: 4 })] })] });
    const r = ok(runTool(ctx, "add_steps", { taskId: "p", steps: ["  Pack books ", "", "Call movers"] }));
    const steps = r.steps as Task[];
    expect(steps.map((s) => [s.title, s.parentId, s.position, s.groupId, s.location])).toEqual([
      ["Pack books", "p", 5, null, "BACKLOG"],
      ["Call movers", "p", 6, null, "BACKLOG"],
    ]);
    expect(steps.map((s) => s.createdAt)).toEqual([NOON, NOON + 1]);
    expect(ctx.draft.tasks.map((t) => t.id)).toEqual(steps.map((s) => s.id));
    expect(ctx.draft.events.map((e) => e.type)).toEqual(["CREATED", "CREATED"]);
    expect(r.parent).toEqual({ id: "p", done: false });
    // "old" carries the fixture's default title, "Task".
    expect(day(ctx)[0].steps.map((s) => s.task.title)).toEqual(["Task", "Pack books", "Call movers"]);
  });

  it("only blank steps is empty_steps; a missing task is not_found; on a step is_step; on a finished task completed", () => {
    const ctx = memoryContext({
      peers: [
        snap({
          tasks: [task({ id: "p", location: "DAY" }), task({ id: "s", parentId: "p" }), task({ id: "done" })],
          events: [ev({ id: "d", taskId: "done", dayKey: "2026-09-27" })],
        }),
      ],
    });
    expect(runTool(ctx, "add_steps", { taskId: "p", steps: [" ", ""] })).toMatchObject({ changed: false, reason: "empty_steps" });
    expect(runTool(ctx, "add_steps", { taskId: "x", steps: ["a"] })).toMatchObject({ error: "not_found" });
    expect(runTool(ctx, "add_steps", { taskId: "s", steps: ["a"] })).toMatchObject({ changed: false, reason: "is_step" });
    expect(runTool(ctx, "add_steps", { taskId: "done", steps: ["a"] })).toMatchObject({ changed: false, reason: "completed" });
    expect(ctx.draft).toEqual({ tasks: [], groups: [], events: [] });
  });
});

describe("steps and their task are one state (UX §4)", () => {
  const peers = [snap({ tasks: [task({ id: "p", location: "DAY" }), task({ id: "a", parentId: "p", position: 0 }), task({ id: "b", parentId: "p", position: 1 })] })];

  it("ticking the last open step ticks the task; unticking a step unticks it", () => {
    const ctx = memoryContext({ peers });
    expect(ok(runTool(ctx, "set_done", { taskId: "a", done: true })).parent).toEqual({ id: "p", done: false });
    expect(types(ctx, "p")).toEqual([]);
    expect(ok(runTool(ctx, "set_done", { taskId: "b", done: true })).parent).toEqual({ id: "p", done: true });
    expect(types(ctx, "p")).toEqual(["DONE"]);
    expect(day(ctx)[0]).toMatchObject({ id: "p", doneToday: true });
    expect(ok(runTool(ctx, "set_done", { taskId: "a", done: false })).parent).toEqual({ id: "p", done: false });
    expect(types(ctx, "p")).toEqual(["DONE", "UNDONE"]);
  });

  it("a new step on a done task unticks it", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "set_done", { taskId: "a", done: true }));
    ok(runTool(ctx, "set_done", { taskId: "b", done: true }));
    expect(ok(runTool(ctx, "add_steps", { taskId: "p", steps: ["c"] })).parent).toEqual({ id: "p", done: false });
    expect(types(ctx, "p")).toEqual(["DONE", "UNDONE"]);
  });

  it("deleting the only open step ticks the task; restoring it unticks it", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "set_done", { taskId: "a", done: true }));
    expect(ok(runTool(ctx, "delete_task", { taskId: "b" })).parent).toEqual({ id: "p", done: true });
    expect(ok(runTool(ctx, "restore_task", { taskId: "b" })).parent).toEqual({ id: "p", done: false });
    expect(types(ctx, "p")).toEqual(["DONE", "UNDONE"]);
  });

  it("ticking the task itself leaves its steps alone", () => {
    const ctx = memoryContext({ peers });
    const r = ok(runTool(ctx, "set_done", { taskId: "p", done: true }));
    expect(r).not.toHaveProperty("parent");
    expect(r).not.toHaveProperty("promoted");
    expect(day(ctx)[0].steps.map((s) => s.done)).toEqual([false, false]);
    expect(ctx.draft.events.map((e) => e.taskId)).toEqual(["p"]);
  });

  it("a step under a deleted task ticks without syncing anything", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "p", deletedAt: 5 }), task({ id: "a", parentId: "p" })] })] });
    const r = ok(runTool(ctx, "set_done", { taskId: "a", done: true }));
    expect(r).not.toHaveProperty("parent");
    expect(ctx.draft.events.map((e) => [e.taskId, e.type])).toEqual([["a", "DONE"]]);
  });
});

describe("a routine with steps", () => {
  const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };

  it("ticking every step ticks the routine today; tomorrow both are open again", () => {
    let wall = instantOf("2026-09-28", 12, 0, MSK.timezone);
    const ctx = memoryContext({
      clock: () => wall,
      settings: MSK,
      peers: [snap({ tasks: [task({ id: "r", isRepeating: true, recurrenceMask: DAILY }), task({ id: "s", parentId: "r" })] })],
    });
    expect(ok(runTool(ctx, "set_done", { taskId: "s", done: true })).parent).toEqual({ id: "r", done: true });
    expect(day(ctx)[0]).toMatchObject({ id: "r", doneToday: true, steps: [{ done: true }] });
    wall = instantOf("2026-09-29", 5, 0, MSK.timezone);
    expect(day(ctx)[0]).toMatchObject({ id: "r", doneToday: false, steps: [{ done: false }] });
  });
});
