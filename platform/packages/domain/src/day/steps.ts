import type { Task } from "../types";
import { marksOf, type JournalIndex, type Marks } from "./journal";

/**
 * Steps — a checklist inside a task (ADR 008). A step is a `Task` row whose `parentId` names another row;
 * it is never a place of its own, the projection nests it into its parent. A `parentId` naming no row is
 * an ordinary task (v1 chains, normalised by the W7 import).
 */

export interface StepView {
  task: Task;
  done: boolean;
}

export function isStepOf(task: Task, byId: ReadonlyMap<string, Task>): boolean {
  return task.parentId != null && byId.has(task.parentId);
}

/** A step is done by its parent's rule: under a one-shot it keeps its mark, under a routine the mark lasts the day. */
export function stepDone(parent: Task, m: Marks): boolean {
  return (parent.isRepeating ? m.lastMarkToday : m.lastMark)?.type === "DONE";
}

/** Live steps per parent id, in list order: position, then creation. */
export function stepsByParent(tasks: readonly Task[], byId: ReadonlyMap<string, Task>): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.deletedAt != null || t.parentId == null || !isStepOf(t, byId)) continue;
    out.set(t.parentId, [...(out.get(t.parentId) ?? []), t]);
  }
  for (const list of out.values()) list.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  return out;
}

export function stepViews(parent: Task, steps: readonly Task[], journal: JournalIndex): StepView[] {
  return steps.map((task) => ({ task, done: stepDone(parent, marksOf(journal, task.id)) }));
}
