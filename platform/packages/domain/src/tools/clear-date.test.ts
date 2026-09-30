import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { dateStart } from "../time/day";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import { ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";
const SUN = "2026-09-27";

describe("set_due_date null on a task that is in the Day by its date", () => {
  it("keeps it in the Day as a row in the same slot (UX §4: clearing = «без даты»)", () => {
    const wall = instantOf(MON, 12, 0, MSK.timezone);
    const due = task({ id: "due", dueDate: dateStart(SUN, MSK), createdAt: 1 });
    const later = task({ id: "later", location: "DAY", enteredDayAt: dateStart(MON, MSK) + 1000, createdAt: 2 });
    const ctx = memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks: [due, later] })] });
    const list = () => ok(runTool(ctx, "list_day", {})).tasks as DayItem[];
    expect(list().map((i) => [i.id, i.kind])).toEqual([["due", "due"], ["later", "row"]]);

    const r = ok(runTool(ctx, "set_due_date", { taskId: "due", date: null }));
    expect(r.movedToDay).toBe(true);
    expect(list().map((i) => [i.id, i.kind, i.dueDate, i.enteredDayAt])).toEqual([
      ["due", "row", null, dateStart(SUN, MSK)],
      ["later", "row", null, dateStart(MON, MSK) + 1000],
    ]);
    expect(ctx.draft.events).toMatchObject([{ type: "MOVED_TO_DAY", taskId: "due", dayKey: MON }]);
  });
});
