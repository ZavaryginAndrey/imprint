import { z } from "zod";
import { LOCATION_DAY, type Task } from "../types";
import type { ToolContext } from "./context";
import { defineTool, type ToolDef } from "./define";
import { changed, fail, unchanged, type ToolResult } from "./result";
import { id, liveGroup, liveTask, locateTask, placeRefusal, taskEvent } from "./support";
import { sendToBacklog } from "./tasks-move";

/**
 * Drag and drop between the Day and the Backlog (UX §4). Unlike `move_to_day` (the phone's swipe, which
 * keeps the date), a drag into the Day makes the task today's: the date goes, the group stays, and it
 * lands at the bottom (D10). Order inside a column never changes.
 */

function dragToDay(ctx: ToolContext, task: Task): ToolResult {
  if (locateTask(ctx, task.id).place === "day") return unchanged("already_in_day");
  const now = ctx.now();
  if (task.isRepeating) {
    ctx.appendEvent(taskEvent(ctx, "PULLED_TO_DAY", task, now));
    return changed({ task });
  }
  const moved: Task = { ...task, location: LOCATION_DAY, dueDate: null, enteredDayAt: now, updatedAt: now };
  ctx.upsertTask(moved);
  ctx.appendEvent(taskEvent(ctx, "MOVED_TO_DAY", moved, now));
  return changed({ task: moved });
}

export const moveTask = defineTool({
  name: "move_task",
  description:
    'Drag a task between the Day and the backlog. to="day": a one-shot becomes today\'s — its date removed, its group kept, ' +
    'at the bottom; a repeating task gets an appearance today. to="backlog": "not today"; with filterGroupId (the group ' +
    "the backlog is filtered by) the task takes that group. Refused for a step (is_step), a task finished on an earlier day " +
    "(completed), one already there (already_in_day / already_in_backlog) and, to the backlog, a task done today (done_today).",
  input: z.object({ taskId: id, to: z.enum(["day", "backlog"]), filterGroupId: id.nullish() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const refusal = placeRefusal(ctx, task);
    if (refusal) return unchanged(refusal);
    if (i.to === "day") return dragToDay(ctx, task);
    const filter = i.filterGroupId ?? null;
    if (filter != null && !liveGroup(ctx, filter)) return fail("not_found", { message: `group ${filter}` });
    return sendToBacklog(ctx, task, filter ?? task.groupId);
  },
});

export const MOVE_TOOLS: ToolDef[] = [moveTask];
