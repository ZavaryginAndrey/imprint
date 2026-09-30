import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { dateStart } from "../time/day";
import type { Task } from "../types";
import { TODAY, group, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const LATER = "2026-10-03";
const world = () =>
  memoryContext({ peers: [snap({ groups: [group({ id: "G" }), group({ id: "H", position: 1 }), group({ id: "dead", deletedAt: 1 })], tasks: [task({ id: "old", location: "DAY", enteredDayAt: 1 })] })] });
const capture = (ctx: MemoryContext, input: Record<string, unknown>) => ok(runTool(ctx, "capture_task", { title: "New", ...input }));
const placed = (ctx: MemoryContext, input: Record<string, unknown>) => {
  const r = capture(ctx, input);
  const t = r.task as Task;
  return [r.place, t.location, t.groupId, t.dueDate == null ? null : "dated"];
};

describe("capture_task: filter × date (UX §3 table)", () => {
  it.each([
    ["All tasks, no date → Day, no group", { view: "day" }, ["day", "DAY", null, null]],
    ["All tasks + chip G, no date → Day, group G", { view: "day", groupId: "G" }, ["day", "DAY", "G", null]],
    ["All tasks, future date → Backlog dated", { view: "day", date: LATER }, ["backlog", "BACKLOG", null, "dated"]],
    ["All tasks + chip G, future date → Backlog dated, G", { view: "day", groupId: "G", date: LATER }, ["backlog", "BACKLOG", "G", "dated"]],
    ["Group G, no date → Backlog, G", { view: { group: "G" } }, ["backlog", "BACKLOG", "G", null]],
    ["Group G + chip H → Backlog, H", { view: { group: "G" }, groupId: "H" }, ["backlog", "BACKLOG", "H", null]],
    ["Group G + chip «No group» → Backlog, no group", { view: { group: "G" }, groupId: null }, ["backlog", "BACKLOG", null, null]],
    ["Group G, future date → Backlog dated, G", { view: { group: "G" }, date: LATER }, ["backlog", "BACKLOG", "G", "dated"]],
    ["mobile All-tasks backlog, no date → Backlog, no group", { view: "backlog" }, ["backlog", "BACKLOG", null, null]],
    ["mobile All-tasks backlog + chip G → Backlog, G", { view: "backlog", groupId: "G" }, ["backlog", "BACKLOG", "G", null]],
  ])("%s", (_name, input, expected) => {
    expect(placed(world(), input)).toEqual(expected);
  });

  it("a date of today or earlier counts as no date", () => {
    expect(placed(world(), { view: "day", date: TODAY })).toEqual(["day", "DAY", null, null]);
    expect(placed(world(), { view: "day", date: "2026-09-01" })).toEqual(["day", "DAY", null, null]);
    expect(placed(world(), { view: { group: "G" }, date: TODAY })).toEqual(["backlog", "BACKLOG", "G", null]);
  });

  it("stores a future date as midnight in the user's zone; the new Day task lands at the bottom", () => {
    const ctx = world();
    const dated = capture(ctx, { view: "day", date: LATER }).task as Task;
    expect(dated.dueDate).toBe(dateStart(LATER, ctx.settings()));
    const typed = capture(ctx, { view: "day", title: "Last" }).task as Task;
    expect((ok(runTool(ctx, "list_day", {})).tasks as DayItem[]).map((i) => i.id)).toEqual(["old", typed.id]);
    expect(ctx.draft.events.map((e) => e.type)).toEqual(["CREATED", "CREATED"]);
  });

  it("refusals: blank title, unknown or deleted group in view or chip, a malformed view", () => {
    const ctx = world();
    expect(runTool(ctx, "capture_task", { title: "  ", view: "day" })).toMatchObject({ error: "invalid_input" });
    expect(runTool(ctx, "capture_task", { title: "x", view: { group: "dead" } })).toMatchObject({ error: "not_found" });
    expect(runTool(ctx, "capture_task", { title: "x", view: "day", groupId: "nope" })).toMatchObject({ error: "not_found" });
    expect(runTool(ctx, "capture_task", { title: "x", view: "week" })).toMatchObject({ error: "invalid_input" });
    expect(ctx.draft.tasks).toEqual([]);
  });
});
