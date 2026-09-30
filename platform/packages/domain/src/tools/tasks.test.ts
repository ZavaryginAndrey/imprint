import { describe, expect, it } from "vitest";
import { startOfDayMillis } from "../compose";
import { doneTodayIds } from "../completion";
import type { Task } from "../types";
import { NOON, TODAY, ev, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const live = (ctx: ReturnType<typeof memoryContext>, id: string) =>
  ctx.state().tasks.find((t) => t.id === id && t.deletedAt == null) ?? null;

describe("add_task", () => {
  it("where=day lands in the Day now with a CREATED event", () => {
    const ctx = memoryContext();
    const r = ok(runTool(ctx, "add_task", { title: "  Call mum ", where: "day" }));
    const t = r.task as Task;
    expect(t).toMatchObject({ title: "Call mum", location: "DAY", enteredDayAt: NOON, dueDate: null, isRepeating: false });
    expect(ctx.draft.events).toMatchObject([{ type: "CREATED", taskId: t.id, dayKey: TODAY, deviceId: "web-test" }]);
  });

  it("where=backlog keeps a due date as local midnight", () => {
    const ctx = memoryContext();
    const t = ok(runTool(ctx, "add_task", { title: "Pay rent", where: "backlog", dueDate: "2026-10-01" })).task as Task;
    expect(t).toMatchObject({ location: "BACKLOG", dueDate: startOfDayMillis("2026-10-01"), enteredDayAt: null });
  });

  it("repeatDays makes a repeating backlog definition even when where=day", () => {
    const ctx = memoryContext();
    const t = ok(runTool(ctx, "add_task", { title: "Gym", where: "day", repeatDays: ["mon", "wed"] })).task as Task;
    expect(t).toMatchObject({ isRepeating: true, recurrenceMask: 5, location: "BACKLOG", enteredDayAt: null });
  });

  it("a whitespace-only title is invalid_input and writes nothing", () => {
    const ctx = memoryContext();
    expect(runTool(ctx, "add_task", { title: "   ", where: "day" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(ctx.draft.tasks).toEqual([]);
  });

  it("an unknown or deleted group is not_found", () => {
    const ctx = memoryContext({ peers: [snap({ groups: [group({ id: "gone", deletedAt: 5 })] })] });
    expect(runTool(ctx, "add_task", { title: "x", where: "day", groupId: "gone" })).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("rename_task", () => {
  const peers = [snap({ tasks: [task({ id: "t1", title: "Old" })] })];

  it("trims and writes a same-id row", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "rename_task", { taskId: "t1", title: " New " }));
    expect(live(ctx, "t1")).toMatchObject({ title: "New", updatedAt: NOON });
  });

  it("the same title is same_value; a missing task is not_found", () => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, "rename_task", { taskId: "t1", title: "Old" })).toMatchObject({ ok: true, changed: false, reason: "same_value" });
    expect(runTool(ctx, "rename_task", { taskId: "nope", title: "x" })).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("delete_task / restore_task", () => {
  it("delete tombstones with a DELETED event; deleting again is not_found; restore brings it back", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1" })] })] });
    ok(runTool(ctx, "delete_task", { taskId: "t1" }));
    expect(live(ctx, "t1")).toBeNull();
    expect(ctx.draft.events).toMatchObject([{ type: "DELETED", taskId: "t1" }]);
    expect(runTool(ctx, "delete_task", { taskId: "t1" })).toMatchObject({ ok: false, error: "not_found" });

    ok(runTool(ctx, "restore_task", { taskId: "t1" }));
    expect(live(ctx, "t1")).not.toBeNull();
  });

  it("restoring a live task is same_value", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1" })] })] });
    expect(runTool(ctx, "restore_task", { taskId: "t1" })).toMatchObject({ changed: false, reason: "same_value" });
  });
});

describe("set_done", () => {
  it("done → DONE today; again → same_value; then undone → UNDONE", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1", location: "DAY" })] })] });
    ok(runTool(ctx, "set_done", { taskId: "t1", done: true }));
    expect(doneTodayIds(ctx.state().events, TODAY).has("t1")).toBe(true);
    expect(runTool(ctx, "set_done", { taskId: "t1", done: true })).toMatchObject({ reason: "same_value" });
    ok(runTool(ctx, "set_done", { taskId: "t1", done: false }));
    expect(doneTodayIds(ctx.state().events, TODAY).has("t1")).toBe(false);
  });

  it("undone on a task not done is same_value (reads a phone DONE from yesterday as not done today)", () => {
    const ctx = memoryContext({
      peers: [snap({ tasks: [task({ id: "t1" })], events: [ev({ taskId: "t1", dayKey: "2026-09-27" })] })],
    });
    expect(runTool(ctx, "set_done", { taskId: "t1", done: false })).toMatchObject({ reason: "same_value" });
  });

  it("no conveyor: rows whose parentId names no row are ordinary tasks; set_done moves nothing (ADR 008)", () => {
    const ctx = memoryContext({
      peers: [snap({ tasks: [task({ id: "s0", parentId: "c", position: 0, location: "DAY" }), task({ id: "s1", parentId: "c", position: 1 })] })],
    });
    const r = ok(runTool(ctx, "set_done", { taskId: "s0", done: true }));
    expect(r).not.toHaveProperty("promoted");
    expect(r).not.toHaveProperty("parent");
    expect(live(ctx, "s1")).toMatchObject({ location: "BACKLOG" });
    expect(ctx.draft.events.map((e) => e.type)).toEqual(["DONE"]);
  });
});
