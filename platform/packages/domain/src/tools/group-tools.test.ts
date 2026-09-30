import { describe, expect, it } from "vitest";
import { argbOf } from "../group/look";
import type { Group } from "../types";
import { NOON, ev, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const g = (ctx: MemoryContext, id: string) => ctx.state().groups.find((x) => x.id === id)!;
const t = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((x) => x.id === id)!;

describe("create_group", () => {
  it("positions after the last live group and takes the next colour after it; icon tag", () => {
    const ctx = memoryContext({
      peers: [snap({ groups: [group({ id: "a", position: 3, colorKey: "teal" }), group({ id: "z", position: 9, deletedAt: 1, colorKey: "plum" })] })],
    });
    const created = ok(runTool(ctx, "create_group", { name: "  Home " })).group as Group;
    expect(created).toMatchObject({ name: "Home", position: 4, colorKey: "sage", icon: "tag", color: argbOf("sage"), createdAt: NOON });
    expect(g(ctx, created.id)).toMatchObject({ colorKey: "sage", icon: "tag" });
  });

  it("the first group is amber at 0; explicit key and icon are kept", () => {
    expect(ok(runTool(memoryContext(), "create_group", { name: "Work" })).group).toMatchObject({ position: 0, colorKey: "amber" });
    const r = ok(runTool(memoryContext(), "create_group", { name: "Pets", colorKey: "rose", icon: "paw-print" }));
    expect(r.group).toMatchObject({ colorKey: "rose", icon: "paw-print", color: argbOf("rose") });
  });

  it("the last group is by position; a v1 group maps to its key; a colourless last group restarts at amber; graphite wraps", () => {
    const v1 = memoryContext({ peers: [snap({ groups: [group({ id: "a", position: 1, color: 0xff3f9d8f | 0 }), group({ id: "b", position: 0, colorKey: "plum" })] })] });
    expect(ok(runTool(v1, "create_group", { name: "x" })).group).toMatchObject({ colorKey: "sage" });
    const plain = memoryContext({ peers: [snap({ groups: [group({ id: "a", position: 5 }), group({ id: "b", position: 2, colorKey: "plum" })] })] });
    expect(ok(runTool(plain, "create_group", { name: "x" })).group).toMatchObject({ colorKey: "amber" });
    const wrap = memoryContext({ peers: [snap({ groups: [group({ id: "a", colorKey: "graphite" })] })] });
    expect(ok(runTool(wrap, "create_group", { name: "x" })).group).toMatchObject({ colorKey: "amber" });
  });

  it("an unknown key or icon is invalid_input", () => {
    expect(runTool(memoryContext(), "create_group", { name: "x", colorKey: "neon" })).toMatchObject({ error: "invalid_input" });
    expect(runTool(memoryContext(), "create_group", { name: "x", icon: "rocket" })).toMatchObject({ error: "invalid_input" });
  });
});

describe("set_group_color / set_group_icon", () => {
  const peers = [snap({ groups: [group({ id: "v1", color: 0xffd98a3d | 0 })] })];

  it("colour: writes the key and the derived ARGB; the key a v1 colour maps to is same_value", () => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, "set_group_color", { groupId: "v1", colorKey: "amber" })).toMatchObject({ changed: false, reason: "same_value" });
    ok(runTool(ctx, "set_group_color", { groupId: "v1", colorKey: "teal" }));
    expect(g(ctx, "v1")).toMatchObject({ colorKey: "teal", color: argbOf("teal"), icon: "tag", updatedAt: NOON });
    expect(runTool(ctx, "set_group_color", { groupId: "nope", colorKey: "teal" })).toMatchObject({ error: "not_found" });
    expect(runTool(ctx, "set_group_color", { groupId: "v1", colorKey: "neon" })).toMatchObject({ error: "invalid_input" });
  });

  it("icon: writes; the default tag on an old row is same_value", () => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, "set_group_icon", { groupId: "v1", icon: "tag" })).toMatchObject({ changed: false, reason: "same_value" });
    ok(runTool(ctx, "set_group_icon", { groupId: "v1", icon: "house" }));
    expect(g(ctx, "v1")).toMatchObject({ icon: "house", colorKey: "amber" });
    expect(runTool(ctx, "set_group_icon", { groupId: "nope", icon: "house" })).toMatchObject({ error: "not_found" });
    expect(runTool(ctx, "set_group_icon", { groupId: "v1", icon: "rocket" })).toMatchObject({ error: "invalid_input" });
  });
});

describe("delete_group / restore_group (UX §5: delete at once, undo brings tasks back)", () => {
  const peers = [
    snap({
      groups: [group({ id: "g1" }), group({ id: "g2", position: 1 })],
      tasks: [
        task({ id: "a", groupId: "g1" }),
        task({ id: "b", groupId: "g1", location: "DAY" }),
        task({ id: "c", groupId: "g1", deletedAt: 1 }),
        task({ id: "d", groupId: "g2" }),
        task({ id: "loose" }),
      ],
    }),
  ];

  it("delete tombstones the group and detaches its live tasks at the same moment", () => {
    const ctx = memoryContext({ peers });
    const r = ok(runTool(ctx, "delete_group", { groupId: "g1" }));
    expect(r.detached).toEqual(["a", "b"]);
    expect(g(ctx, "g1").deletedAt).toBe(NOON);
    expect([t(ctx, "a"), t(ctx, "b")]).toMatchObject([{ groupId: null, updatedAt: NOON }, { groupId: null, updatedAt: NOON }]);
    expect(t(ctx, "c").groupId).toBe("g1");
    expect(t(ctx, "d").groupId).toBe("g2");
    expect(runTool(ctx, "delete_group", { groupId: "g1" })).toMatchObject({ error: "not_found" });
  });

  it("restore brings the group back with the tasks this deletion detached and nobody touched since", () => {
    const ctx = memoryContext({ peers });
    ok(runTool(ctx, "delete_group", { groupId: "g1" }));
    ok(runTool(ctx, "rename_task", { taskId: "a", title: "edited after" }));
    const r = ok(runTool(ctx, "restore_group", { groupId: "g1" }));
    expect(r.reattached).toEqual(["b"]);
    expect(g(ctx, "g1").deletedAt).toBeNull();
    expect(t(ctx, "b").groupId).toBe("g1");
    expect(t(ctx, "a").groupId).toBeNull();
    expect(t(ctx, "loose").groupId).toBeNull();
  });

  it("restore of a live group is same_value; of an unknown one not_found", () => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, "restore_group", { groupId: "g1" })).toMatchObject({ changed: false, reason: "same_value" });
    expect(runTool(ctx, "restore_group", { groupId: "nope" })).toMatchObject({ error: "not_found" });
  });
});

describe("reorder_groups", () => {
  const peers = [snap({ groups: [group({ id: "a", position: 0 }), group({ id: "b", position: 1 }), group({ id: "c", position: 2 }), group({ id: "x", position: 3, deletedAt: 1 })] })];

  it("sets positions 0..n−1 in the given order, writing only groups that move", () => {
    const ctx = memoryContext({ peers });
    const r = ok(runTool(ctx, "reorder_groups", { groupIds: ["a", "c", "b"] }));
    expect(r.updated).toBe(2);
    expect(ctx.draft.groups.map((x) => [x.id, x.position])).toEqual([["c", 1], ["b", 2]]);
    expect((r.groups as Group[]).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("the same order is same_value; a missing, extra, deleted or repeated id is invalid_input", () => {
    const ctx = memoryContext({ peers });
    expect(runTool(ctx, "reorder_groups", { groupIds: ["a", "b", "c"] })).toMatchObject({ changed: false, reason: "same_value" });
    for (const groupIds of [["a", "b"], ["a", "b", "c", "z"], ["a", "b", "x"], ["a", "a", "b"]]) {
      expect(runTool(ctx, "reorder_groups", { groupIds })).toMatchObject({ ok: false, error: "invalid_input" });
    }
    expect(ctx.draft.groups).toEqual([]);
  });
});

describe("list_groups", () => {
  it("each group with its look, taskCount (live rows) and openCount (UX §2)", () => {
    const ctx = memoryContext({
      peers: [
        snap({
          groups: [group({ id: "g1", color: 0xff6c7ae0 })],
          tasks: [
            task({ id: "open", groupId: "g1" }),
            task({ id: "doneToday", groupId: "g1", location: "DAY" }),
            task({ id: "finished", groupId: "g1" }),
          ],
          events: [ev({ id: "a", taskId: "doneToday" }), ev({ id: "b", taskId: "finished", dayKey: "2026-09-27" })],
        }),
      ],
    });
    expect(ok(runTool(ctx, "list_groups", {})).groups).toMatchObject([{ id: "g1", colorKey: "blue", icon: "tag", taskCount: 3, openCount: 1 }]);
  });
});
