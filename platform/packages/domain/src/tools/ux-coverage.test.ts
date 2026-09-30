import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "./index";

/**
 * 05-web-ux §2–§5 → tools (W3 «Готово, когда»: no rule without a tool). suggest_steps is a server tool
 * (worker `SERVER_TOOLS`, pinned in apps/worker/test/suggestSteps.test.ts). Screens, filters, chips, focus
 * and animation are UI state (W4), not tools.
 */
const UX_RULES: Record<string, string[]> = {
  "§2 open counters of the Day and of groups": ["list_day", "list_groups"],
  "§3 placement table, «today = no date», mobile exception, group chip": ["capture_task"],
  "§3 «New group» in the chip": ["create_group"],
  "§4 tick": ["set_done"],
  "§4 group label, «New group» on the row": ["set_task_group", "create_group"],
  "§4 date, clearing, a future date takes a Day task to the Backlog": ["set_due_date"],
  "§4 repeat / «Не повторять»": ["set_repeating"],
  "§4 steps: add, tick, sync with the task": ["add_steps", "set_done"],
  "§4 delete + «Отменить»": ["delete_task", "restore_task"],
  "§4 three drag rules": ["move_task"],
  "§4 the mobile move icon (phone swipe)": ["move_to_day", "move_to_backlog"],
  "§4 rename": ["rename_task"],
  "§5 create with the next colour": ["create_group"],
  "§5 edit: name, icon, colour": ["rename_group", "set_group_icon", "set_group_color"],
  "§5 delete with detach + «Отменить»": ["delete_group", "restore_group"],
  "§5 group order": ["reorder_groups"],
};

describe("every UX §2–§5 rule has a tool", () => {
  const names = new Set(ALL_TOOLS.map((t) => t.name));
  it.each(Object.entries(UX_RULES))("%s", (_rule, tools) => {
    for (const tool of tools) expect(names.has(tool), tool).toBe(true);
  });
});
