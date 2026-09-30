import { describe, expect, it } from "vitest";
import { group, snap, task } from "./fixtures";
import { ALL_TOOLS, runTool } from "./index";
import { memoryContext } from "./memoryContext";

/** A world where every tool has something valid to act on. */
const world = () =>
  memoryContext({
    peers: [
      snap({
        groups: [group({ id: "g1" }), group({ id: "empty", position: 1 }), group({ id: "gone", position: 2, deletedAt: 5 })],
        tasks: [
          task({ id: "day", location: "DAY" }),
          task({ id: "back", groupId: "g1" }),
          task({ id: "rep", isRepeating: true, recurrenceMask: 1 }),
          task({ id: "del", deletedAt: 5 }),
        ],
      }),
    ],
  });

/** One successful input per tool. A new tool without a sample fails the first test below. */
const SAMPLES: Record<string, unknown> = {
  add_task: { title: "New", where: "day" },
  capture_task: { title: "New", view: "day" },
  rename_task: { taskId: "day", title: "Renamed" },
  set_done: { taskId: "day", done: true },
  move_to_day: { taskId: "back" },
  move_to_backlog: { taskId: "day" },
  move_task: { taskId: "back", to: "day" },
  set_due_date: { taskId: "back", date: "2026-12-01" },
  set_repeating: { taskId: "back", days: ["tue"] },
  delete_task: { taskId: "day" },
  restore_task: { taskId: "del" },
  add_steps: { taskId: "day", steps: ["a", "b"] },
  create_group: { name: "G" },
  rename_group: { groupId: "g1", name: "Renamed" },
  set_group_color: { groupId: "g1", colorKey: "teal" },
  set_group_icon: { groupId: "g1", icon: "house" },
  restore_group: { groupId: "gone" },
  reorder_groups: { groupIds: ["empty", "g1"] },
  delete_group: { groupId: "empty" },
  set_task_group: { taskId: "day", groupId: "g1" },
  set_group_collapsed: { collapsed: true },
  list_day: {},
  list_backlog: {},
  list_groups: {},
  set_user_settings: { resetHour: 5 },
  get_user_settings: {},
};

describe("tool registry contract", () => {
  it("every tool has a sample, and every sample names a tool", () => {
    expect(ALL_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it("names are unique snake_case; descriptions are real sentences", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of ALL_TOOLS) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(t.description.length).toBeGreaterThanOrEqual(20);
    }
  });

  it.each(ALL_TOOLS.map((t) => t.name))("%s succeeds on its sample and survives JSON unchanged", (name) => {
    const r = runTool(world(), name, SAMPLES[name]);
    expect(r.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
  });
});
