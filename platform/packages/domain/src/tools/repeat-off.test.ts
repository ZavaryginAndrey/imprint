import { describe, expect, it } from "vitest";
import type { BacklogItem } from "../day/project";
import { DAILY } from "../recurrence";
import type { UserSettings } from "../time/settings";
import { instantOf } from "../time/zone";
import type { Task, TaskEvent } from "../types";
import { ev, ok, snap, task } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };
const MON = "2026-09-28";
const SUN = "2026-09-27";

function setup(events: TaskEvent[]) {
  const wall = instantOf(MON, 12, 0, MSK.timezone);
  const routine: Task = task({ id: "r", isRepeating: true, recurrenceMask: DAILY });
  return memoryContext({ clock: () => wall, settings: MSK, peers: [snap({ tasks: [routine], events })] });
}

describe("set_repeating null after an earlier mark (ADR 007, v1 parity)", () => {
  it("a routine last DONE yesterday and not ticked today stays in the Backlog as a one-shot", () => {
    const ctx = setup([ev({ id: "e1", taskId: "r", type: "DONE", dayKey: SUN, at: 1 })]);
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    const backlog = ok(runTool(ctx, "list_backlog", {}));
    expect((backlog.ungrouped as BacklogItem[]).map((t) => [t.id, t.doneToday])).toEqual([["r", false]]);
    expect(ok(runTool(ctx, "list_day", {})).tasks).toEqual([]);
    expect(ctx.draft.events).toMatchObject([{ type: "UNDONE", taskId: "r", dayKey: MON }]);
  });

  it.each([
    ["last mark is an UNDONE", [ev({ id: "e1", taskId: "r", type: "DONE", dayKey: SUN, at: 1 }), ev({ id: "e2", taskId: "r", type: "UNDONE", dayKey: SUN, at: 2 })]],
    ["no marks at all", []],
  ])("%s: no extra event", (_name, events) => {
    const ctx = setup(events);
    ok(runTool(ctx, "set_repeating", { taskId: "r", days: null }));
    expect(ctx.draft.events).toEqual([]);
    expect((ok(runTool(ctx, "list_backlog", {})).ungrouped as BacklogItem[]).map((t) => t.id)).toEqual(["r"]);
  });
});
