import { z } from "zod";
import { indexJournal, marksOf } from "../day/journal";
import { stepDone } from "../day/steps";
import { doneEvent } from "../edit";
import { LOCATION_BACKLOG, type Task } from "../types";
import type { ToolContext } from "./context";
import { defineTool, type ToolDef } from "./define";
import { changed, fail, unchanged } from "./result";
import { id, liveSteps, liveTask, placeRefusal, taskEvent } from "./support";

/** Steps — a checklist inside a task (ADR 008, UX §4). */

export interface ParentSync {
  id: string;
  /** The task's done-for-today after the sync. */
  done: boolean;
}

/**
 * Steps and their task are one state: with at least one live step, the task is done exactly when every
 * step is. Writes one DONE/UNDONE for the task when they disagree. The task is judged by its own rule
 * (`stepDone`): a one-shot by its last mark ever, so a task finished on an earlier day counts as done and
 * its completion date does not move; a routine by today's mark. Ticking the task itself never touches its steps.
 */
export function syncParent(ctx: ToolContext, parent: Task, now: number): ParentSync {
  const today = ctx.todayKey();
  const journal = indexJournal(ctx.state().events, today);
  const parentDone = stepDone(parent, marksOf(journal, parent.id));
  const steps = liveSteps(ctx, parent.id);
  if (steps.length === 0) return { id: parent.id, done: parentDone };
  const allDone = steps.every((s) => stepDone(parent, marksOf(journal, s.id)));
  if (allDone !== parentDone) ctx.appendEvent(doneEvent(parent, allDone, ctx.deviceId, now, today, ctx.newId));
  return { id: parent.id, done: allDone };
}

export const addSteps = defineTool({
  name: "add_steps",
  description:
    "Break a task into steps — a checklist inside it; the task stays where it is. Steps go after any existing ones; blank " +
    "ones are dropped (empty_steps if none are left). A new step on a done task makes it not done. Refused for a step " +
    "(is_step) and a task finished on an earlier day (completed).",
  input: z.object({ taskId: id, steps: z.array(z.string()) }),
  run(ctx, i) {
    const parent = liveTask(ctx, i.taskId);
    if (!parent) return fail("not_found");
    const refusal = placeRefusal(ctx, parent);
    if (refusal) return unchanged(refusal);
    const titles = i.steps.map((s) => s.trim()).filter((s) => s.length > 0);
    if (titles.length === 0) return unchanged("empty_steps");
    const now = ctx.now();
    const existing = liveSteps(ctx, parent.id);
    const first = existing.length > 0 ? Math.max(...existing.map((s) => s.position)) + 1 : 0;
    const steps = titles.map((title, idx) => {
      const step: Task = {
        id: ctx.newId(), title, location: LOCATION_BACKLOG, dueDate: null, startDate: null, groupId: null,
        isRepeating: false, recurrenceMask: 0, priority: 0, parentId: parent.id, position: first + idx,
        createdAt: now + idx, enteredDayAt: null, updatedAt: now + idx, deletedAt: null,
      };
      ctx.upsertTask(step);
      ctx.appendEvent(taskEvent(ctx, "CREATED", step, now + idx));
      return step;
    });
    return changed({ steps, parent: syncParent(ctx, parent, now) });
  },
});

export const STEP_TOOLS: ToolDef[] = [addSteps];
