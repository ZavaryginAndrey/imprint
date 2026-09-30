import { describe, expect, it } from "vitest";
import { dropCall, reordered } from "./drag";

describe("dropCall — UX §4's three rules are move_task's; the UI only says where", () => {
  it("Day → Backlog with «Все задачи»: no filter group (the task keeps its own)", () => {
    expect(dropCall("t1", "day", "backlog", "all")).toEqual({ name: "move_task", input: { taskId: "t1", to: "backlog" } });
  });
  it("Day → Backlog filtered by a group: the task takes it", () => {
    expect(dropCall("t1", "day", "backlog", "g1")).toEqual({ name: "move_task", input: { taskId: "t1", to: "backlog", filterGroupId: "g1" } });
  });
  it("Backlog → Day", () => {
    expect(dropCall("t1", "backlog", "day", "g1")).toEqual({ name: "move_task", input: { taskId: "t1", to: "day" } });
  });
  it("dropped where it started, or nowhere: nothing", () => {
    expect(dropCall("t1", "day", "day", "all")).toBeNull();
    expect(dropCall("t1", "day", null, "all")).toBeNull();
  });
});

describe("reordered — the whole group list after a drag (reorder_groups)", () => {
  it("moves the dragged id to the target's place", () => {
    expect(reordered(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(reordered(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });
  it("no target, itself, or an unknown id: nothing", () => {
    expect(reordered(["a", "b"], "a", null)).toBeNull();
    expect(reordered(["a", "b"], "a", "a")).toBeNull();
    expect(reordered(["a", "b"], "x", "a")).toBeNull();
  });
});
