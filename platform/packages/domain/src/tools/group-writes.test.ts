import { describe, expect, it } from "vitest";
import { argbOf } from "../group/look";
import { group, ok, snap } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

/** ADR 010 / spec: every group row a tool writes carries both look fields, `color` derived from the key. */
const V1 = 0xffd98a3d | 0; // the v1 amber: no colorKey, no icon on the row
const LOOK = { colorKey: "amber", icon: "tag", color: argbOf("amber") };

const fresh = (extra: Parameters<typeof group>[0][] = []) =>
  memoryContext({ peers: [snap({ groups: [group({ id: "v1", color: V1 }), ...extra.map((p) => group(p))] })] });
const row = (ctx: ReturnType<typeof fresh>, id = "v1") => ctx.state().groups.find((g) => g.id === id)!;

describe("a v1 group row (no colorKey, no icon) is written with its look by every group tool", () => {
  it("rename_group", () => {
    const ctx = fresh();
    ok(runTool(ctx, "rename_group", { groupId: "v1", name: "Home" }));
    expect(row(ctx)).toMatchObject({ name: "Home", ...LOOK });
  });

  it("delete_group (the detached tasks keep updatedAt = deletedAt)", () => {
    const ctx = memoryContext({ peers: [snap({ groups: [group({ id: "v1", color: V1 })] })] });
    ok(runTool(ctx, "delete_group", { groupId: "v1" }));
    const gone = row(ctx);
    expect(gone).toMatchObject(LOOK);
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.updatedAt).toBe(gone.deletedAt);
  });

  it("restore_group", () => {
    const ctx = memoryContext({ peers: [snap({ groups: [group({ id: "v1", color: V1, deletedAt: 5, updatedAt: 5 })] })] });
    ok(runTool(ctx, "restore_group", { groupId: "v1" }));
    expect(row(ctx)).toMatchObject({ deletedAt: null, ...LOOK });
  });

  it("reorder_groups (every group whose position changes)", () => {
    const ctx = fresh([{ id: "v2", position: 1, color: V1 }]);
    ok(runTool(ctx, "reorder_groups", { groupIds: ["v2", "v1"] }));
    expect(row(ctx, "v2")).toMatchObject({ position: 0, ...LOOK });
    expect(row(ctx, "v1")).toMatchObject({ position: 1, ...LOOK });
  });

  it("set_group_collapsed", () => {
    const ctx = fresh([{ id: "v2", position: 1, color: V1 }]);
    ok(runTool(ctx, "set_group_collapsed", { collapsed: true }));
    expect(row(ctx)).toMatchObject({ isCollapsed: true, ...LOOK });
    expect(row(ctx, "v2")).toMatchObject({ isCollapsed: true, ...LOOK });
  });

  it("a group that already has a look keeps it", () => {
    const ctx = memoryContext({ peers: [snap({ groups: [group({ id: "k", colorKey: "plum", icon: "house", color: 0 })] })] });
    ok(runTool(ctx, "rename_group", { groupId: "k", name: "Keep" }));
    expect(row(ctx, "k")).toMatchObject({ colorKey: "plum", icon: "house", color: argbOf("plum") });
  });
});
