import { describe, expect, it } from "vitest";
import { ok, group, snap } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const listed = (ctx: MemoryContext) => (ok(runTool(ctx, "list_groups", {})).groups as { id: string }[]).map((g) => g.id);

describe("one group order everywhere: position, name by code unit, id", () => {
  it("a restored group tying with a new one: list_groups and reorder_groups agree, and a reorder writes", () => {
    const ctx = memoryContext({
      peers: [snap({ groups: [group({ id: "a", name: "Home", position: 0 }), group({ id: "b", name: "Zeta", position: 1 })] })],
    });
    ok(runTool(ctx, "delete_group", { groupId: "b" }));
    const alpha = (ok(runTool(ctx, "create_group", { name: "Alpha" })).group as { id: string; position: number });
    expect(alpha.position).toBe(1);
    ok(runTool(ctx, "restore_group", { groupId: "b" }));
    expect(listed(ctx)).toEqual(["a", alpha.id, "b"]);

    const r = ok(runTool(ctx, "reorder_groups", { groupIds: ["a", "b", alpha.id] }));
    expect(r).toMatchObject({ changed: true });
    expect(listed(ctx)).toEqual(["a", "b", alpha.id]);
  });

  it("the same order as list_groups is a no-op reorder", () => {
    const ctx = memoryContext({
      peers: [snap({ groups: [group({ id: "z", name: "B", position: 0, createdAt: 1 }), group({ id: "y", name: "A", position: 0, createdAt: 2 })] })],
    });
    expect(listed(ctx)).toEqual(["y", "z"]);
    expect(runTool(ctx, "reorder_groups", { groupIds: ["y", "z"] })).toMatchObject({ changed: false, reason: "same_value" });
  });

  it("names tie by code unit, then id", () => {
    const ctx = memoryContext({
      peers: [snap({ groups: [group({ id: "2", name: "a" }), group({ id: "1", name: "a" }), group({ id: "3", name: "B" })] })],
    });
    expect(listed(ctx)).toEqual(["3", "1", "2"]);
  });

  it("list_backlog puts its sections in the same order", () => {
    const ctx = memoryContext({
      peers: [snap({ groups: [group({ id: "b", name: "Zeta", createdAt: 1 }), group({ id: "a", name: "Alpha", createdAt: 9 })] })],
    });
    const sections = ok(runTool(ctx, "list_backlog", {})).groups as { group: { id: string } }[];
    expect(sections.map((s) => s.group.id)).toEqual(["a", "b"]);
  });

  it("create_group takes the next colour after the group displayed last when positions tie", () => {
    const ctx = memoryContext({
      peers: [
        snap({
          groups: [
            group({ id: "a", name: "Alpha", position: 2, colorKey: "teal", createdAt: 9 }),
            group({ id: "z", name: "Zeta", position: 2, colorKey: "plum", createdAt: 1 }),
          ],
        }),
      ],
    });
    // Zeta is displayed last (by name); plum is followed by blue. By createdAt Alpha would be last, giving sage.
    expect(ok(runTool(ctx, "create_group", { name: "New" })).group).toMatchObject({ position: 3, colorKey: "blue" });
  });
});
