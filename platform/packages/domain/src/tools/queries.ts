import { z } from "zod";
import { openCountByGroup, projectBacklog, projectDay } from "../day/project";
import { withLook } from "../group/look";
import { compareGroups } from "../group/order";
import { liveGroups, liveTasks } from "../merge";
import { defineTool, type ToolDef } from "./define";
import { found } from "./result";

/** Reads: the projected Day and Backlog (SPEC §4.2, ADR 007) and the group list. */

export const listDay = defineTool({
  name: "list_day",
  description:
    "List today's Day as the phone shows it: Day rows, backlog tasks whose date has arrived and today's appearances of repeating " +
    "tasks, in order (a group's tasks together, earliest arrival first, done ones last). Each item is the task plus kind " +
    "(row | due | appearance) and doneToday.",
  input: z.object({}),
  run: (ctx) => found({ tasks: projectDay(ctx.state(), ctx.todayKey(), ctx.settings()) }),
});

export const listBacklog = defineTool({
  name: "list_backlog",
  description:
    "List the backlog by group (in group order), then tasks in no group. Repeating definitions are always listed; " +
    "one-shots finished on an earlier day are not. Each task carries doneToday.",
  input: z.object({}),
  run(ctx) {
    const view = projectBacklog(ctx.state(), ctx.todayKey(), ctx.settings());
    return found({ ...view, groups: view.groups.map((s) => ({ ...s, group: withLook(s.group) })) });
  },
});

export const listGroups = defineTool({
  name: "list_groups",
  description:
    "List groups in order, each with colorKey, icon, taskCount (live tasks in it, finished ones included) and openCount " +
    "(tasks open today in the Day or the backlog — the sidebar counter).",
  input: z.object({}),
  run(ctx) {
    const state = ctx.state();
    const tasks = liveTasks(state);
    const open = openCountByGroup(state, ctx.todayKey(), ctx.settings());
    const groups = liveGroups(state)
      .sort(compareGroups)
      .map((g) => ({ ...withLook(g), taskCount: tasks.filter((t) => t.groupId === g.id).length, openCount: open.get(g.id) ?? 0 }));
    return found({ groups });
  },
});

export const QUERY_TOOLS: ToolDef[] = [listDay, listBacklog, listGroups];
