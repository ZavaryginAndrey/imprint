import { describe, expect, it } from "vitest";
import { group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

describe("list_backlog groups carry their look", () => {
  it("a v1 group (signed ARGB, no key) returns the mapped colorKey and the default icon", () => {
    const ctx = memoryContext({
      peers: [snap({ groups: [group({ id: "v1", color: 0xffd98a3d | 0 })], tasks: [task({ id: "t", groupId: "v1" })] })],
    });
    const sections = ok(runTool(ctx, "list_backlog", {})).groups as { group: Record<string, unknown>; tasks: { id: string }[] }[];
    expect(sections[0].group).toMatchObject({ id: "v1", colorKey: "amber", icon: "tag" });
    expect(sections[0].tasks.map((t) => t.id)).toEqual(["t"]);
  });
});
