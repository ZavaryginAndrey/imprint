import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { DAILY } from "../recurrence";
import { dateStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import type { Task } from "../types";
import { ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";
const SUN = "2026-09-27";

function setup(tasks: Task[]) {
  let wall = instantOf(MON, 12, 0, MSK.timezone);
  const ctx = memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks })] });
  return { ctx, advanceTo: (key: string, hh: number) => void (wall = instantOf(key, hh, 0, MSK.timezone)) };
}
const day = (ctx: MemoryContext) => (ok(runTool(ctx, "list_day", {})).tasks as DayItem[]).map((i) => i.id);
const row = (ctx: MemoryContext, id: string) => ctx.state().tasks.find((t) => t.id === id)!;

describe("set_due_date: a future date sends a Day task to the Backlog (UX §4)", () => {
  it("a Day row goes to the Backlog with the date and a MOVED_TO_BACKLOG; it comes back on its day", () => {
    const { ctx, advanceTo } = setup([task({ id: "t", location: "DAY", enteredDayAt: 1 })]);
    const r = ok(runTool(ctx, "set_due_date", { taskId: "t", date: "2026-10-01" }));
    expect(r).toMatchObject({ movedToDay: false, movedToBacklog: true });
    expect(row(ctx, "t")).toMatchObject({ location: "BACKLOG", enteredDayAt: null, dueDate: dateStart("2026-10-01", MSK) });
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_BACKLOG", taskId: "t", dayKey: MON }]);
    expect(day(ctx)).toEqual([]);
    advanceTo("2026-10-01", 5);
    expect(day(ctx)).toEqual(["t"]);
  });

  it("a task its date brought in leaves with the new date", () => {
    const { ctx } = setup([task({ id: "t", dueDate: dateStart(SUN, MSK) })]);
    expect(ok(runTool(ctx, "set_due_date", { taskId: "t", date: "2026-10-01" })).movedToBacklog).toBe(true);
    expect(row(ctx, "t").location).toBe("BACKLOG");
    expect(day(ctx)).toEqual([]);
  });

  it("a past date on a Day row keeps it in the Day and writes no move", () => {
    const { ctx } = setup([task({ id: "t", location: "DAY", enteredDayAt: 1 })]);
    expect(ok(runTool(ctx, "set_due_date", { taskId: "t", date: SUN })).movedToBacklog).toBe(false);
    expect(row(ctx, "t").location).toBe("DAY");
    expect(ctx.draft.events).toEqual([]);
  });

  it("a routine's definition only takes the date", () => {
    const { ctx } = setup([task({ id: "r", isRepeating: true, recurrenceMask: DAILY })]);
    expect(ok(runTool(ctx, "set_due_date", { taskId: "r", date: "2026-10-01" }))).toMatchObject({ movedToDay: false, movedToBacklog: false });
    expect(ctx.draft.events).toEqual([]);
    expect(day(ctx)).toEqual(["r"]);
  });
});
