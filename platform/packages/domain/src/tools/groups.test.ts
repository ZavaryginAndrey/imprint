import { describe, expect, it } from "vitest";
import { NOON, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const g = (ctx: ReturnType<typeof memoryContext>, id: string) => ctx.state().groups.find((x) => x.id === id)!;

describe("rename_group", () => {
  const peers = [snap({ groups: [group({ id: "g1", name: "Old", color: 7 })] })];

  it("rename writes; same is same_value; blank is invalid_input", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "rename_group", { groupId: "g1", name: "New" }));
    expect(g(ctx, "g1").name).toBe("New");
    expect(runTool(ctx, "rename_group", { groupId: "g1", name: "New" })).toMatchObject({ reason: "same_value" });
    expect(runTool(ctx, "rename_group", { groupId: "g1", name: "  " })).toMatchObject({ error: "invalid_input" });
  });
});

describe("set_task_group", () => {
  const peers = [snap({ groups: [group({ id: "g1" }), group({ id: "dead", deletedAt: 1 })], tasks: [task({ id: "p", updatedAt: 50 })] })];

  it("editing a peer's task writes a same-id, newer row that wins the merge", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "set_task_group", { taskId: "p", groupId: "g1" }));
    expect(ctx.draft.tasks).toMatchObject([{ id: "p", groupId: "g1", updatedAt: NOON }]);
    expect(ctx.state().tasks.find((t) => t.id === "p")!.groupId).toBe("g1");
  });

  it("null removes from the group; same is same_value; a deleted group is not_found", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "set_task_group", { taskId: "p", groupId: "g1" }));
    ok(runTool(ctx, "set_task_group", { taskId: "p", groupId: null }));
    expect(ctx.state().tasks.find((t) => t.id === "p")!.groupId).toBeNull();
    expect(runTool(ctx, "set_task_group", { taskId: "p", groupId: null })).toMatchObject({ reason: "same_value" });
    expect(runTool(ctx, "set_task_group", { taskId: "p", groupId: "dead" })).toMatchObject({ error: "not_found" });
  });
});

describe("set_group_collapsed", () => {
  const peers = [snap({ groups: [group({ id: "a" }), group({ id: "b", isCollapsed: true }), group({ id: "x", deletedAt: 1 })] })];

  it("one group", () => {
    const ctx = memoryContext({ peers });
    expect(ok(runTool(ctx, "set_group_collapsed", { groupId: "a", collapsed: true })).updated).toBe(1);
    expect(runTool(ctx, "set_group_collapsed", { groupId: "a", collapsed: true })).toMatchObject({ reason: "same_value" });
  });

  it("all live groups, writing only those that change", () => {
    const ctx = memoryContext({ peers });
    expect(ok(runTool(ctx, "set_group_collapsed", { collapsed: true })).updated).toBe(1);
    expect(ctx.draft.groups.map((x) => x.id)).toEqual(["a"]);
    expect(runTool(ctx, "set_group_collapsed", { collapsed: true })).toMatchObject({ changed: false, reason: "same_value", updated: 0 });
  });
});
