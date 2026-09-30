import { z } from "zod";
import { buildContribution } from "../compose";
import { doneEvent, tombstone } from "../edit";
import type { Task } from "../types";
import { defineTool, type ToolDef } from "./define";
import { changed, fail, unchanged } from "./result";
import { syncParent } from "./steps";
import {
  dateMillis, dayName, findTask, id, isDoneToday, isoDate, liveGroup, liveParentOf, liveTask, maskFromDays, taskEvent, text,
} from "./support";
import { moveToBacklog, moveToDay, setDueDate, setRepeating } from "./tasks-move";

/**
 * Task tools. Each mirrors a `ChecklistRepository` mutation so the phone folds the web's rows in with
 * `BackupMerge` exactly as if it had written them itself (web Tools spec).
 */

export const addTask = defineTool({
  name: "add_task",
  description:
    'Add a task. where="day" puts it on today\'s list; where="backlog" parks it, optionally with a due date (YYYY-MM-DD). ' +
    "repeatDays (mon..sun) makes it a repeating backlog definition that appears on those weekdays. groupId must be an existing group.",
  input: z.object({
    title: text,
    where: z.enum(["day", "backlog"]),
    groupId: id.nullish(),
    dueDate: isoDate.nullish(),
    repeatDays: z.array(dayName).nullish(),
  }),
  run(ctx, i) {
    const groupId = i.groupId ?? null;
    if (groupId != null && !liveGroup(ctx, groupId)) return fail("not_found", { message: `group ${groupId}` });
    const toDay = i.where === "day";
    const { task, event } = buildContribution(
      {
        title: i.title,
        toDay,
        groupId,
        dueDate: !toDay && i.dueDate ? dateMillis(ctx, i.dueDate) : null,
        recurrenceMask: maskFromDays(i.repeatDays ?? []),
      },
      ctx.deviceId,
      ctx.now(),
      ctx.todayKey(),
      ctx.newId,
    );
    ctx.upsertTask(task);
    ctx.appendEvent(event);
    return changed({ task });
  },
});

export const renameTask = defineTool({
  name: "rename_task",
  description: "Rename a task. For a repeating task this renames its definition, so every future appearance.",
  input: z.object({ taskId: id, title: text }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    if (task.title === i.title) return unchanged("same_value");
    const next: Task = { ...task, title: i.title, updatedAt: ctx.now() };
    ctx.upsertTask(next);
    return changed({ task: next });
  },
});

export const deleteTask = defineTool({
  name: "delete_task",
  description:
    "Delete a task (a tombstone; its history stays in the journal and restore_task brings it back). " +
    "Deleting a step re-checks its task (returned as parent).",
  input: z.object({ taskId: id }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const now = ctx.now();
    const gone = tombstone(task, now);
    ctx.upsertTask(gone);
    ctx.appendEvent(taskEvent(ctx, "DELETED", task, now));
    const parent = liveParentOf(ctx, task);
    return parent ? changed({ task: gone, parent: syncParent(ctx, parent, now) }) : changed({ task: gone });
  },
});

export const restoreTask = defineTool({
  name: "restore_task",
  description: "Undo delete_task: bring a deleted task back where it was.",
  input: z.object({ taskId: id }),
  run(ctx, i) {
    const task = findTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    if (task.deletedAt == null) return unchanged("same_value");
    const now = ctx.now();
    const back: Task = { ...task, deletedAt: null, updatedAt: now };
    ctx.upsertTask(back);
    const parent = liveParentOf(ctx, back);
    return parent ? changed({ task: back, parent: syncParent(ctx, parent, now) }) : changed({ task: back });
  },
});

export const setDone = defineTool({
  name: "set_done",
  description:
    "Mark a task done (done=true) or not done (done=false) for today. Ticking a step keeps its task in step: the last open " +
    "step done makes the task done, an unticked step makes it not done (returned as parent). Ticking a task leaves its steps alone.",
  input: z.object({ taskId: id, done: z.boolean() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    if (isDoneToday(ctx, task.id) === i.done) return unchanged("same_value");
    const now = ctx.now();
    ctx.appendEvent(doneEvent(task, i.done, ctx.deviceId, now, ctx.todayKey(), ctx.newId));
    const parent = liveParentOf(ctx, task);
    return parent ? changed({ task, parent: syncParent(ctx, parent, now) }) : changed({ task });
  },
});

export const TASK_TOOLS: ToolDef[] = [
  addTask, renameTask, setDone, moveToDay, moveToBacklog, setDueDate, setRepeating, deleteTask, restoreTask,
];
