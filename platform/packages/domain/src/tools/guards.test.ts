import { describe, expect, it } from "vitest";
import { ev, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const peers = [
  snap({
    groups: [group({ id: "g1" })],
    tasks: [
      task({ id: "p", location: "DAY" }),
      task({ id: "s", parentId: "p" }),
      task({ id: "done", location: "DAY" }),
    ],
    events: [ev({ id: "old", taskId: "done", type: "DONE", dayKey: "2026-09-27" })],
  }),
];

describe("placement tools on a step: is_step, nothing written", () => {
  it.each([
    ["move_to_day", { taskId: "s" }],
    ["move_to_backlog", { taskId: "s" }],
    ["set_due_date", { taskId: "s", date: "2026-10-05" }],
    ["set_repeating", { taskId: "s", days: ["mon"] }],
    ["set_task_group", { taskId: "s", groupId: "g1" }],
  ])("%s", (name, input) => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, name, input)).toEqual({ ok: true, changed: false, reason: "is_step" });
    expect(ctx.draft).toEqual({ tasks: [], groups: [], events: [] });
  });

  it("a step can still be renamed, ticked, deleted and restored", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "rename_task", { taskId: "s", title: "Renamed" }));
    ok(runTool(ctx, "set_done", { taskId: "s", done: true }));
    ok(runTool(ctx, "delete_task", { taskId: "s" }));
    ok(runTool(ctx, "restore_task", { taskId: "s" }));
  });
});

describe("placement tools on a task finished on an earlier day: completed, nothing written", () => {
  it.each([
    ["move_to_day", { taskId: "done" }],
    ["move_to_backlog", { taskId: "done" }],
    ["set_due_date", { taskId: "done", date: "2026-10-05" }],
  ])("%s", (name, input) => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, name, input)).toEqual({ ok: true, changed: false, reason: "completed" });
    expect(ctx.draft).toEqual({ tasks: [], groups: [], events: [] });
  });

  it("its group can still change (it shows in History)", () => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, "set_task_group", { taskId: "done", groupId: "g1" })).toMatchObject({ ok: true, changed: true });
  });
});
