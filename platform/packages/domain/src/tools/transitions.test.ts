import { describe, expect, it } from "vitest";
import type { DayItem } from "../day/project";
import { DAILY } from "../recurrence";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import { ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext, type MemoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";

function setup() {
  let wall = instantOf(MON, 12, 0, MSK.timezone);
  const ctx = memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks: [task({ id: "r", isRepeating: true, recurrenceMask: DAILY })] })] });
  return { ctx, advanceTo: (key: string, hh: number) => void (wall = instantOf(key, hh, 0, MSK.timezone)) };
}
const day = (ctx: MemoryContext) => (ok(runTool(ctx, "list_day", {})).tasks as DayItem[]).map((i) => i.id);

describe("routine transitions from the W3a review", () => {
  it("DB-3 when the new cadence skips today: no PULLED_TO_DAY, out of today, back on its day", () => {
    const { ctx, advanceTo } = setup();
    ok(runTool(ctx, "move_to_backlog", { taskId: "r" }));
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: ["tue"] }));
    expect(ctx.draft.events.map((e) => e.type)).toEqual(["SKIPPED"]);
    expect(day(ctx)).toEqual([]);
    advanceTo("2026-09-29", 5);
    expect(day(ctx)).toEqual(["r"]);
  });

  it("skip → pull → skip: the last choice of the day wins", () => {
    const { ctx } = setup();
    ok(runTool(ctx, "move_to_backlog", { taskId: "r" }));
    expect(day(ctx)).toEqual([]);
    ok(runTool(ctx, "move_to_day", { taskId: "r" }));
    expect(day(ctx)).toEqual(["r"]);
    ok(runTool(ctx, "move_to_backlog", { taskId: "r" }));
    expect(day(ctx)).toEqual([]);
    expect(ctx.draft.events.map((e) => e.type)).toEqual(["SKIPPED", "PULLED_TO_DAY", "SKIPPED"]);
  });
});
