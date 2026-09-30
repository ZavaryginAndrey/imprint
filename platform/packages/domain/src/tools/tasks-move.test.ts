import { describe, expect, it } from "vitest";
import { startOfDayMillis } from "../compose";
import { NOON, TODAY, ev, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const START = startOfDayMillis(TODAY);
const row = (ctx: ReturnType<typeof memoryContext>, id: string) => ctx.state().tasks.find((t) => t.id === id)!;

describe("move_to_day", () => {
  it("a dateless backlog one-shot moves in, dated today", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1" })] })] });
    ok(runTool(ctx, "move_to_day", { taskId: "t1" }));
    expect(row(ctx, "t1")).toMatchObject({ location: "DAY", dueDate: START, enteredDayAt: START, updatedAt: NOON });
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_DAY", taskId: "t1" }]);
  });

  it("keeps an existing due date; a Day task is already_in_day", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1", dueDate: 42 }), task({ id: "t2", location: "DAY" })] })] });
    ok(runTool(ctx, "move_to_day", { taskId: "t1" }));
    expect(row(ctx, "t1").dueDate).toBe(42);
    expect(runTool(ctx, "move_to_day", { taskId: "t2" })).toMatchObject({ changed: false, reason: "already_in_day" });
  });

  it("a repeating task gets a PULLED_TO_DAY event and its definition stays put", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "r", isRepeating: true, recurrenceMask: 1 })] })] });
    ok(runTool(ctx, "move_to_day", { taskId: "r" }));
    expect(ctx.draft.tasks).toEqual([]);
    expect(ctx.draft.events).toMatchObject([{ type: "PULLED_TO_DAY", taskId: "r", dayKey: TODAY }]);
    expect(runTool(ctx, "move_to_day", { taskId: "r" })).toMatchObject({ reason: "already_in_day" });
  });

  it("a repeating task skipped today can be pulled back — the later event wins (ADR 007)", () => {
    const ctx = memoryContext({
      peers: [snap({ tasks: [task({ id: "r", isRepeating: true })], events: [ev({ taskId: "r", type: "SKIPPED" })] })],
    });
    ok(runTool(ctx, "move_to_day", { taskId: "r" }));
    expect(ctx.draft.events).toMatchObject([{ type: "PULLED_TO_DAY", taskId: "r" }]);
  });
});

describe("move_to_backlog", () => {
  it("a Day one-shot goes back, keeping its due date", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1", location: "DAY", enteredDayAt: 5, dueDate: 7 })] })] });
    ok(runTool(ctx, "move_to_backlog", { taskId: "t1" }));
    expect(row(ctx, "t1")).toMatchObject({ location: "BACKLOG", enteredDayAt: null, dueDate: 7 });
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_BACKLOG" }]);
  });

  it("a task done today is done_today; a backlog one-shot is already_in_backlog", () => {
    const ctx = memoryContext({
      peers: [snap({ tasks: [task({ id: "d", location: "DAY" }), task({ id: "b" })], events: [ev({ taskId: "d", type: "DONE" })] })],
    });
    expect(runTool(ctx, "move_to_backlog", { taskId: "d" })).toMatchObject({ reason: "done_today" });
    expect(runTool(ctx, "move_to_backlog", { taskId: "b" })).toMatchObject({ reason: "already_in_backlog" });
  });

  it("a repeating task is SKIPPED today; a second call is already_in_backlog", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "r", isRepeating: true, recurrenceMask: 127 })] })] });
    ok(runTool(ctx, "move_to_backlog", { taskId: "r" }));
    expect(ctx.draft.events).toMatchObject([{ type: "SKIPPED", taskId: "r", dayKey: TODAY }]);
    expect(runTool(ctx, "move_to_backlog", { taskId: "r" })).toMatchObject({ reason: "already_in_backlog" });
  });
});

describe("set_due_date", () => {
  it("a future date stays in the backlog", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1" })] })] });
    const r = ok(runTool(ctx, "set_due_date", { taskId: "t1", date: "2026-10-05" }));
    expect(r.movedToDay).toBe(false);
    expect(row(ctx, "t1")).toMatchObject({ dueDate: startOfDayMillis("2026-10-05"), location: "BACKLOG" });
  });

  it("a date today or earlier promotes a backlog one-shot into the Day at that date", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1" })] })] });
    ok(runTool(ctx, "set_due_date", { taskId: "t1", date: "2026-09-20" }));
    const due = startOfDayMillis("2026-09-20");
    expect(row(ctx, "t1")).toMatchObject({ location: "DAY", dueDate: due, enteredDayAt: due });
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_DAY" }]);
  });

  it("a repeating definition with a past date is NOT promoted", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "r", isRepeating: true, recurrenceMask: 1 })] })] });
    ok(runTool(ctx, "set_due_date", { taskId: "r", date: "2026-09-01" }));
    expect(row(ctx, "r").location).toBe("BACKLOG");
  });

  it("null clears; the same value is same_value; an impossible date is invalid_input", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1", dueDate: 9 })] })] });
    ok(runTool(ctx, "set_due_date", { taskId: "t1", date: null }));
    expect(row(ctx, "t1").dueDate).toBeNull();
    expect(runTool(ctx, "set_due_date", { taskId: "t1", date: null })).toMatchObject({ reason: "same_value" });
    expect(runTool(ctx, "set_due_date", { taskId: "t1", date: "2026-02-30" })).toMatchObject({ error: "invalid_input" });
  });
});

describe("set_repeating", () => {
  it("turning on parks a Day task in the backlog as a definition", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "t1", location: "DAY", enteredDayAt: 3 })] })] });
    ok(runTool(ctx, "set_repeating", { taskId: "t1", days: ["mon", "fri"] }));
    expect(row(ctx, "t1")).toMatchObject({ isRepeating: true, recurrenceMask: 17, location: "BACKLOG", enteredDayAt: null });
    expect(runTool(ctx, "set_repeating", { taskId: "t1", days: ["fri", "mon"] })).toMatchObject({ reason: "same_value" });
  });

  it("turning off keeps the mask and location; off on a one-shot is same_value", () => {
    const ctx = memoryContext({ peers: [snap({ tasks: [task({ id: "r", isRepeating: true, recurrenceMask: 5 }), task({ id: "o" })] })] });
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    expect(row(ctx, "r")).toMatchObject({ isRepeating: false, recurrenceMask: 5, location: "BACKLOG" });
    expect(runTool(ctx, "set_repeating", { taskId: "o", days: [] })).toMatchObject({ reason: "same_value" });
  });
});
