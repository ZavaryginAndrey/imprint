import { z } from "zod";
import { doneEvent } from "../edit";
import { dueDay } from "../day/project";
import { isOn } from "../recurrence";
import { weekday } from "../time/day";
import { LOCATION_BACKLOG, LOCATION_DAY, type Task } from "../types";
import type { ToolContext } from "./context";
import { defineTool } from "./define";
import { changed, fail, unchanged, type ToolResult } from "./result";
import {
  dateMillis,
  dayName,
  id,
  isDoneToday,
  isoDate,
  isStep,
  liveTask,
  locateTask,
  marksToday,
  maskFromDays,
  placeRefusal,
  taskEvent,
  todayStart,
} from "./support";

/** Where a task its date brought into the Day sits: the start of that date (v1's promotion at the reset). */
function dueSlot(ctx: ToolContext, task: Task): number | null {
  const due = dueDay(task, ctx.settings());
  return due == null ? null : dateMillis(ctx, due);
}

/**
 * Tools that move a task between the Day and the Backlog or change when it is due. They decide by the
 * projection (`locateTask`), never by `location` alone: a dated task can be in the Day while its row says
 * BACKLOG (ADR 007). Mirror `ChecklistRepository.moveToDayToday` / `notToday` / `setDueDate` / `setRepeating`.
 */

export const moveToDay = defineTool({
  name: "move_to_day",
  description:
    "Bring a task onto today's list. A one-shot backlog task moves into the Day, keeping its due date or taking today's. " +
    "A repeating task gets an extra appearance today, even if it was skipped earlier today. " +
    "Refused for a step (is_step) and a task finished on an earlier day (completed).",
  input: z.object({ taskId: id }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const refusal = placeRefusal(ctx, task);
    if (refusal) return unchanged(refusal);
    const now = ctx.now();
    if (task.isRepeating) {
      // v1 moveToDayToday: no cadence check; the later of SKIPPED / PULLED_TO_DAY wins (ADR 007).
      if (marksToday(ctx, task.id).choiceToday === "PULLED_TO_DAY") return unchanged("already_in_day");
      ctx.appendEvent(taskEvent(ctx, "PULLED_TO_DAY", task, now));
      return changed({ task });
    }
    const { kind } = locateTask(ctx, task.id);
    if (kind === "row") return unchanged("already_in_day");
    const moved: Task =
      kind === "due"
        ? // Its date already brought it in: pin it as a Day row in the same slot (v1's promotion at the reset).
          { ...task, location: LOCATION_DAY, enteredDayAt: dueSlot(ctx, task), updatedAt: now }
        : { ...task, location: LOCATION_DAY, dueDate: task.dueDate ?? dateMillis(ctx, ctx.todayKey()), enteredDayAt: todayStart(ctx), updatedAt: now };
    ctx.upsertTask(moved);
    ctx.appendEvent(taskEvent(ctx, "MOVED_TO_DAY", moved, now));
    return changed({ task: moved });
  },
});

/**
 * «Not today» / a drag to the Backlog (v1 `notToday`, UX §4). With a group different from the task's, the
 * task takes it. A routine is skipped for today; a task its date brought in keeps its row and gets
 * today's MOVED_TO_BACKLOG (F5a); a Day row goes back to the backlog.
 */
export function sendToBacklog(ctx: ToolContext, task: Task, groupId: string | null): ToolResult {
  if (isDoneToday(ctx, task.id)) return unchanged("done_today");
  const { place, kind } = locateTask(ctx, task.id);
  if (place !== "day") return unchanged("already_in_backlog");
  const now = ctx.now();
  const regrouped = groupId !== task.groupId;
  if (task.isRepeating || kind === "due") {
    const next: Task = regrouped ? { ...task, groupId, updatedAt: now } : task;
    if (regrouped) ctx.upsertTask(next);
    ctx.appendEvent(taskEvent(ctx, task.isRepeating ? "SKIPPED" : "MOVED_TO_BACKLOG", next, now));
    return changed({ task: next });
  }
  const moved: Task = { ...task, groupId, location: LOCATION_BACKLOG, enteredDayAt: null, updatedAt: now };
  ctx.upsertTask(moved);
  ctx.appendEvent(taskEvent(ctx, "MOVED_TO_BACKLOG", moved, now));
  return changed({ task: moved });
}

export const moveToBacklog = defineTool({
  name: "move_to_backlog",
  description:
    '"Not today": a one-shot leaves today\'s list for the backlog (keeping its due date — a past date brings it back tomorrow); ' +
    "a repeating task is skipped for today. Refused for a task done today (done_today) or not on today's list (already_in_backlog). " +
    "Refused for a step (is_step) and a task finished on an earlier day (completed).",
  input: z.object({ taskId: id }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const refusal = placeRefusal(ctx, task);
    if (refusal) return unchanged(refusal);
    return sendToBacklog(ctx, task, task.groupId);
  },
});

type DateMove = "MOVED_TO_DAY" | "MOVED_TO_BACKLOG" | null;

/** The row after a date change and the move it makes (UX §4, ADR 007). */
function redate(ctx: ToolContext, task: Task, date: string | null, due: number | null, now: number): { next: Task; move: DateMove } {
  const base: Task = { ...task, dueDate: due, updatedAt: now };
  // A repeating definition never becomes a Day row (its appearances are computed).
  if (task.isRepeating) return { next: base, move: null };
  const { kind } = locateTask(ctx, task.id);
  if (date == null) {
    // Clearing the date of a task its date brought in pins it there, in the same slot (UX §4: «без даты»).
    if (kind !== "due") return { next: base, move: null };
    return { next: { ...base, location: LOCATION_DAY, enteredDayAt: dueSlot(ctx, task) }, move: "MOVED_TO_DAY" };
  }
  if (date > ctx.todayKey()) {
    // A future date takes a Day task to the Backlog; the date brings it back on its day.
    if (kind == null) return { next: base, move: null };
    return { next: { ...base, location: LOCATION_BACKLOG, enteredDayAt: null }, move: "MOVED_TO_BACKLOG" };
  }
  // Today or earlier: a backlog task arrives in the Day at its date (v1 `setDueDate`).
  if (task.location !== LOCATION_BACKLOG) return { next: base, move: null };
  return { next: { ...base, location: LOCATION_DAY, enteredDayAt: due }, move: "MOVED_TO_DAY" };
}

export const setDueDate = defineTool({
  name: "set_due_date",
  description:
    "Set (YYYY-MM-DD) or clear (null) a task's due date. A backlog one-shot dated today or earlier moves into the Day at once " +
    "(movedToDay); a future date takes a Day task to the backlog until that day (movedToBacklog). Refused for a step " +
    "(is_step) and a task finished on an earlier day (completed).",
  input: z.object({ taskId: id, date: isoDate.nullable() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    const refusal = placeRefusal(ctx, task);
    if (refusal) return unchanged(refusal);
    const due = i.date == null ? null : dateMillis(ctx, i.date);
    if (due === task.dueDate) return unchanged("same_value");
    const now = ctx.now();
    const { next, move } = redate(ctx, task, i.date, due, now);
    ctx.upsertTask(next);
    if (move) ctx.appendEvent(taskEvent(ctx, move, next, now));
    return changed({ task: next, movedToDay: move === "MOVED_TO_DAY", movedToBacklog: move === "MOVED_TO_BACKLOG" });
  },
});

export const setRepeating = defineTool({
  name: "set_repeating",
  description:
    "Make a task repeat on the given weekdays (mon..sun) — it becomes a backlog definition shown on those days — or stop repeating (null or []). Refused for a step (is_step).",
  input: z.object({ taskId: id, days: z.array(dayName).nullable() }),
  run(ctx, i) {
    const task = liveTask(ctx, i.taskId);
    if (!task) return fail("not_found");
    if (isStep(ctx, task)) return unchanged("is_step");
    const mask = maskFromDays(i.days ?? []);
    const now = ctx.now();
    if (mask > 0) {
      if (task.isRepeating && task.recurrenceMask === mask) return unchanged("same_value");
      const next: Task = { ...task, isRepeating: true, recurrenceMask: mask, location: LOCATION_BACKLOG, enteredDayAt: null, updatedAt: now };
      ctx.upsertTask(next);
      if (!task.isRepeating) cancelTodaysMarks(ctx, next, now);
      return changed({ task: next });
    }
    if (!task.isRepeating) return unchanged("same_value");
    // Decision №15: a routine already checked today becomes a Day row, so the check stays until the reset.
    const doneNow = isDoneToday(ctx, task.id);
    const next: Task = doneNow
      ? { ...task, isRepeating: false, location: LOCATION_DAY, enteredDayAt: now, updatedAt: now }
      : { ...task, isRepeating: false, updatedAt: now };
    ctx.upsertTask(next);
    // Not ticked today, but the last mark ever is an old DONE: as a one-shot it would read «completed» and vanish.
    // v1 keeps it a backlog one-shot, so cancel that mark for today (ADR 007).
    if (!doneNow && marksToday(ctx, task.id).lastMark?.type === "DONE") {
      ctx.appendEvent(doneEvent(next, false, ctx.deviceId, now, ctx.todayKey(), ctx.newId));
    }
    return changed({ task: next });
  },
});

/**
 * DB-3: a task that becomes a routine must not inherit today's marks. v1 deleted them; the journal is
 * append-only, so later events cancel them — UNDONE for a DONE, PULLED_TO_DAY for a SKIPPED when the new
 * cadence includes today (ADR 007).
 */
function cancelTodaysMarks(ctx: ToolContext, task: Task, now: number): void {
  const m = marksToday(ctx, task.id);
  const today = ctx.todayKey();
  if (m.lastMarkToday?.type === "DONE") ctx.appendEvent(doneEvent(task, false, ctx.deviceId, now, today, ctx.newId));
  if (m.choiceToday === "SKIPPED" && isOn(task.recurrenceMask, weekday(today))) {
    ctx.appendEvent(taskEvent(ctx, "PULLED_TO_DAY", task, now));
  }
}
