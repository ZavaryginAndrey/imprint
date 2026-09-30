import { describe, expect, it } from "vitest";
import { dateStart, dayStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { ok } from "../tools/fixtures";
import { runTool } from "../tools/index";
import { memoryContext, type MemoryContext } from "../tools/memoryContext";
import type { Group, Task } from "../types";
import { locate, type DayItem } from "./project";

// Ported from app/src/test/java/com/imprint/app/data/RepositoryPromotionTest.kt (8 tests): the same
// harness (UTC, reset 04:00, Thursday 2026-01-15 10:00), run through the tools and the projection.
// Differences by ADR 007: a date that arrives by itself does not rewrite the row (kind "due", location
// stays BACKLOG); a moved-in task's dueDate is the date's midnight, its enteredDayAt the day's reset.
const S: UserSettings = { timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" };
const TODAY = "2026-01-15";
let wall = 0;

function setup(): MemoryContext {
  wall = Date.UTC(2026, 0, 15, 10, 0);
  return memoryContext({ clock: () => wall, settings: S });
}
const day = (ctx: MemoryContext) => (ok(runTool(ctx, "list_day", {})).tasks as DayItem[]).map((i) => i.id);
const add = (ctx: MemoryContext, input: Record<string, unknown>) => ok(runTool(ctx, "add_task", input)).task as Task;
const row = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((t) => t.id === id)!;

describe("due dates and Day order — RepositoryPromotionTest parity", () => {
  it("addBacklogTask_withDateToday_promotesToDayImmediately", () => {
    const ctx = setup();
    const t = add(ctx, { title: "call now", where: "backlog", dueDate: TODAY });
    expect(ok(runTool(ctx, "list_day", {})).tasks).toMatchObject([{ id: t.id, kind: "due", sortKey: dateStart(TODAY, S) }]);
  });

  it("addBacklogTask_withFutureDate_staysInBacklog", () => {
    const ctx = setup();
    const t = add(ctx, { title: "later", where: "backlog", dueDate: "2026-01-16" });
    expect(locate(ctx.state(), t.id, TODAY, S).place).toBe("backlog");
  });

  it("setDueDate_pastDate_promotes_andClearingLeavesItInBacklog", () => {
    const ctx = setup();
    const t = add(ctx, { title: "someday", where: "backlog" });
    ok(runTool(ctx, "set_due_date", { taskId: t.id, date: TODAY }));
    expect(row(ctx, t.id).location).toBe("DAY");
    const dateless = add(ctx, { title: "dateless", where: "backlog" });
    expect(runTool(ctx, "set_due_date", { taskId: dateless.id, date: null })).toMatchObject({ reason: "same_value" });
    expect(row(ctx, dateless.id)).toMatchObject({ dueDate: null, location: "BACKLOG" });
  });

  it("notToday_onADatedOneShot_keepsTheDate", () => {
    const ctx = setup();
    const t = add(ctx, { title: "dentist", where: "backlog", dueDate: TODAY });
    ok(runTool(ctx, "move_to_backlog", { taskId: t.id }));
    expect(row(ctx, t.id)).toMatchObject({ location: "BACKLOG", dueDate: dateStart(TODAY, S) });
    expect(day(ctx)).toEqual([]);
  });

  it("dayOrder_isByEnteredThenCreated_withDoneSinking", () => {
    const ctx = setup();
    const a = add(ctx, { title: "first", where: "day" });
    wall += 1_000;
    const b = add(ctx, { title: "second", where: "day" });
    expect(day(ctx)).toEqual([a.id, b.id]);
    wall += 1_000;
    ok(runTool(ctx, "set_done", { taskId: a.id, done: true }));
    expect(day(ctx)).toEqual([b.id, a.id]);
  });

  it("moveToDayToday_datelessTask_stampsTodayAndPromotes", () => {
    const ctx = setup();
    const t = add(ctx, { title: "dateless", where: "backlog" });
    ok(runTool(ctx, "move_to_day", { taskId: t.id }));
    expect(row(ctx, t.id)).toMatchObject({ location: "DAY", dueDate: dateStart(TODAY, S), enteredDayAt: dayStart(TODAY, S) });
  });

  it("moveToDayToday_datedTask_keepsItsDate", () => {
    const ctx = setup();
    const t = add(ctx, { title: "dentist", where: "backlog", dueDate: "2026-02-01" });
    expect(day(ctx)).toEqual([]);
    ok(runTool(ctx, "move_to_day", { taskId: t.id }));
    expect(row(ctx, t.id)).toMatchObject({ location: "DAY", dueDate: dateStart("2026-02-01", S) });
  });

  it("dayOrder_clustersTasksFromTheSameGroup", () => {
    const ctx = setup();
    const g = ok(runTool(ctx, "create_group", { name: "Errands" })).group as Group;
    const gA = add(ctx, { title: "gA", where: "backlog", groupId: g.id, dueDate: "2026-01-13" });
    wall += 1_000;
    const u = add(ctx, { title: "loner", where: "backlog", dueDate: "2026-01-14" });
    wall += 1_000;
    const gB = add(ctx, { title: "gB", where: "backlog", groupId: g.id, dueDate: TODAY });
    expect(day(ctx)).toEqual([gA.id, gB.id, u.id]);
  });
});
