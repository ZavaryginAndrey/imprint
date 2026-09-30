import { z } from "zod";
import { indexJournal, marksOf, type Marks } from "../day/journal";
import { doneNow, locate, type TaskPlace } from "../day/project";
import { bit, isOn } from "../recurrence";
import { dateStart, dayStart } from "../time/day";
import type { EventType, Group, Task, TaskEvent } from "../types";
import type { ToolContext } from "./context";

// ---- zod atoms shared by tool inputs ----

export const id = z.string().min(1);

/** Trimmed, non-blank text — a whitespace-only title is invalid_input, never an empty row. */
export const text = z.string().trim().min(1);

/** A real local calendar date as YYYY-MM-DD ("2026-02-30" is rejected, not rolled over). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }, "not a calendar date");

export const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayName = (typeof DAY_NAMES)[number];
export const dayName = z.enum(DAY_NAMES);

/** Weekday names → the 7-bit RecurrenceMask (bit0 = Monday), as `recurrence.ts`. */
export function maskFromDays(days: readonly DayName[]): number {
  return days.reduce((mask, d) => mask | bit(DAY_NAMES.indexOf(d)), 0);
}

export function daysFromMask(mask: number): DayName[] {
  return DAY_NAMES.filter((_, i) => isOn(mask, i));
}

// ---- lookups over the merged state ----

/** Any row with this id, tombstones included. */
export function findTask(ctx: ToolContext, taskId: string): Task | null {
  return ctx.state().tasks.find((t) => t.id === taskId) ?? null;
}

export function liveTask(ctx: ToolContext, taskId: string): Task | null {
  const t = findTask(ctx, taskId);
  return t && t.deletedAt == null ? t : null;
}

export function liveGroup(ctx: ToolContext, groupId: string): Group | null {
  return ctx.state().groups.find((g) => g.id === groupId && g.deletedAt == null) ?? null;
}

/** Start of today's logical day in the user's zone — when a task moved in by hand enters the Day (SPEC §4.2.1). */
export function todayStart(ctx: ToolContext): number {
  return dayStart(ctx.todayKey(), ctx.settings());
}

/** A calendar date as a stored `dueDate`: local midnight in the user's zone (`DueDates.startOfDay`). */
export function dateMillis(ctx: ToolContext, dateKey: string): number {
  return dateStart(dateKey, ctx.settings());
}

/** The task's journal marks for today (ADR 007). */
export function marksToday(ctx: ToolContext, taskId: string): Marks {
  return marksOf(indexJournal(ctx.state().events, ctx.todayKey()), taskId);
}

/** Where the task is in today's projection. */
export function locateTask(ctx: ToolContext, taskId: string): TaskPlace {
  return locate(ctx.state(), taskId, ctx.todayKey(), ctx.settings());
}

/** Done for today by the projection's rule: a one-shot by its last mark ever, a routine by today's, a step by its parent's. */
export function isDoneToday(ctx: ToolContext, taskId: string): boolean {
  return doneNow(ctx.state(), taskId, ctx.todayKey());
}

/** A journal event for [task], denormalised like `ChecklistRepository.logEvent`. */
export function taskEvent(ctx: ToolContext, type: EventType, task: Task, at: number): TaskEvent {
  return {
    id: ctx.newId(),
    taskId: task.id,
    type,
    at,
    dayKey: ctx.todayKey(),
    title: task.title,
    groupId: task.groupId,
    isRepeating: task.isRepeating,
    surface: null,
    deviceId: ctx.deviceId,
  };
}

/**
 * A clock that never repeats a millisecond. Completion orders events by `(at, deviceId, id)`; two
 * clicks in one millisecond would otherwise be ordered by a random event id.
 */
export function monotonicClock(read: () => number = Date.now): () => number {
  let last = -Infinity;
  return () => {
    const t = Math.max(read(), last + 1);
    last = t;
    return t;
  };
}

/** A step: its `parentId` names an existing row, live or deleted (ADR 008). */
export function isStep(ctx: ToolContext, task: Task): boolean {
  return task.parentId != null && findTask(ctx, task.parentId) != null;
}

/** Why a placement tool must leave this task alone: a step, or a task finished on an earlier day. */
export function placeRefusal(ctx: ToolContext, task: Task): "is_step" | "completed" | null {
  if (isStep(ctx, task)) return "is_step";
  if (locateTask(ctx, task.id).place === "completed") return "completed";
  return null;
}

/** The live task a step belongs to; null for a top-level task or a step whose task is deleted. */
export function liveParentOf(ctx: ToolContext, task: Task): Task | null {
  return task.parentId == null ? null : liveTask(ctx, task.parentId);
}

/** A task's live steps, in list order. */
export function liveSteps(ctx: ToolContext, parentId: string): Task[] {
  return ctx
    .state()
    .tasks.filter((t) => t.deletedAt == null && t.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}
