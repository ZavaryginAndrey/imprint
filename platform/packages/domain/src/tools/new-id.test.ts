import { describe, expect, it } from "vitest";
import { memoryContext } from "./memoryContext";
import { runTool } from "./index";

/** Every id a tool creates comes from ctx.newId (ADR 011) — rows and events. */
function feed() {
  let n = 0;
  const handed: string[] = [];
  return {
    handed,
    ids: () => {
      const id = `id-${++n}`;
      handed.push(id);
      return id;
    },
  };
}

describe("newId", () => {
  it("capture_task: task and CREATED event take the caller's ids", () => {
    const f = feed();
    const ctx = memoryContext({ ids: f.ids, todayKey: "2026-09-30" });
    const r = runTool(ctx, "capture_task", { title: "Milk", view: "day" });
    expect(r).toMatchObject({ ok: true, task: { id: "id-1" } });
    expect(ctx.draft.events.map((e) => e.id)).toEqual(["id-2"]);
  });

  it("create_group, add_steps, set_done, move_task, delete_task use ctx.newId", () => {
    const f = feed();
    const ctx = memoryContext({ ids: f.ids, todayKey: "2026-09-30" });
    runTool(ctx, "create_group", { name: "Home" });
    const task = runTool(ctx, "capture_task", { title: "Pack", view: "day" });
    const taskId = (task as unknown as { task: { id: string } }).task.id;
    runTool(ctx, "add_steps", { taskId, steps: ["a", "b"] });
    runTool(ctx, "move_task", { taskId, to: "backlog" });
    runTool(ctx, "set_done", { taskId, done: true });
    runTool(ctx, "delete_task", { taskId });
    const all = [...ctx.draft.tasks, ...ctx.draft.groups, ...ctx.draft.events].map((r) => r.id);
    expect(ctx.draft.events.length).toBeGreaterThanOrEqual(4);
    expect(all.every((id) => id.startsWith("id-"))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it("default memoryContext still hands out UUIDs", () => {
    const ctx = memoryContext();
    expect(ctx.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
