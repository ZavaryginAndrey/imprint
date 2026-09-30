import { describe, expect, it } from "vitest";
import { ev, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const YESTERDAY = "2026-09-27";
const types = (ctx: MemoryContext, taskId: string) => ctx.draft.events.filter((e) => e.taskId === taskId).map((e) => e.type);

/** A one-shot finished yesterday, with steps a (done) and b (open), and its parent's mark of yesterday. */
const finished = () =>
  memoryContext({
    peers: [
      snap({
        tasks: [task({ id: "p" }), task({ id: "a", parentId: "p", position: 0 }), task({ id: "b", parentId: "p", position: 1 })],
        events: [
          ev({ id: "e1", taskId: "a", dayKey: YESTERDAY, at: 10 }),
          ev({ id: "e2", taskId: "p", dayKey: YESTERDAY, at: 20 }),
        ],
      }),
    ],
  });

describe("syncParent judges a one-shot parent by its last mark ever", () => {
  it("ticking the last open step of a task finished on an earlier day writes nothing to the task", () => {
    const ctx = finished();
    expect(ok(runTool(ctx, "set_done", { taskId: "b", done: true })).parent).toEqual({ id: "p", done: true });
    expect(types(ctx, "p")).toEqual([]);
  });

  it("deleting the last open step of such a task writes nothing to the task", () => {
    const ctx = finished();
    expect(ok(runTool(ctx, "delete_task", { taskId: "b" })).parent).toEqual({ id: "p", done: true });
    expect(types(ctx, "p")).toEqual([]);
  });

  it("unticking a step of such a task unticks it today", () => {
    const ctx = finished();
    ok(runTool(ctx, "set_done", { taskId: "b", done: true }));
    expect(ok(runTool(ctx, "set_done", { taskId: "a", done: false })).parent).toEqual({ id: "p", done: false });
    expect(types(ctx, "p")).toEqual(["UNDONE"]);
    expect(ctx.draft.events.find((e) => e.taskId === "p")?.dayKey).toBe("2026-09-28");
  });

  it("ticking a step while others are open still unticks a task that is done", () => {
    const ctx = memoryContext({
      peers: [
        snap({
          tasks: [task({ id: "p" }), task({ id: "a", parentId: "p" }), task({ id: "b", parentId: "p" })],
          events: [ev({ id: "e1", taskId: "p", dayKey: "2026-09-28", at: 20 })],
        }),
      ],
    });
    expect(ok(runTool(ctx, "set_done", { taskId: "a", done: true })).parent).toEqual({ id: "p", done: false });
    expect(types(ctx, "p")).toEqual(["UNDONE"]);
  });
});
