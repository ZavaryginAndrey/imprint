import { z } from "zod";
import { buildContribution } from "../compose";
import { defineTool, type ToolDef } from "./define";
import { changed, fail } from "./result";
import { dateMillis, id, isoDate, liveGroup, text } from "./support";

/**
 * The input field (UX §3): the screen/filter decides the place, the date decides Day or Backlog, the
 * group chip decides only the group. The UI passes context, never the rule (P1).
 */

/** "day": desktop «All tasks» and the mobile Day; "backlog": the mobile «All tasks» backlog screen; {group}: a group filter. */
const view = z.union([z.enum(["day", "backlog"]), z.object({ group: id })]);

export const captureTask = defineTool({
  name: "capture_task",
  description:
    'Add a task the way the input field does. view is where the user is: "day" (All tasks / the Day), "backlog" (the mobile ' +
    "All-tasks backlog) or {group}. With no date — or today's or an earlier one — it goes to the Day only from view \"day\", " +
    "otherwise to the backlog; a later date parks it in the backlog with that date. groupId is the group chip: an id, null " +
    "for an explicit «no group», omitted to take the group from view.",
  input: z.object({ title: text, view, groupId: id.nullable().optional(), date: isoDate.nullish() }),
  run(ctx, i) {
    const viewGroup = typeof i.view === "object" ? i.view.group : null;
    if (viewGroup != null && !liveGroup(ctx, viewGroup)) return fail("not_found", { message: `group ${viewGroup}` });
    const groupId = i.groupId !== undefined ? i.groupId : viewGroup;
    if (groupId != null && !liveGroup(ctx, groupId)) return fail("not_found", { message: `group ${groupId}` });
    const today = ctx.todayKey();
    // «Сегодня» picked in the calendar equals no date (UX §3).
    const dueDate = i.date != null && i.date > today ? dateMillis(ctx, i.date) : null;
    const toDay = dueDate == null && i.view === "day";
    const { task, event } = buildContribution({ title: i.title, toDay, groupId, dueDate, recurrenceMask: 0 }, ctx.deviceId, ctx.now(), today, ctx.newId);
    ctx.upsertTask(task);
    ctx.appendEvent(event);
    return changed({ task, place: toDay ? "day" : "backlog" });
  },
});

export const CAPTURE_TOOLS: ToolDef[] = [captureTask];
