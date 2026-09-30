import { compareGroups } from "../group/order";
import { liveGroups, type MergedState } from "../merge";
import { isOn } from "../recurrence";
import { dateStart, dayStart, dueKey, weekday } from "../time/day";
import type { UserSettings } from "../time/settings";
import { LOCATION_DAY, type Group, type Task } from "../types";
import { indexJournal, marksOf, type JournalIndex, type Marks } from "./journal";
import { isStepOf, stepDone, stepsByParent, stepViews, type StepView } from "./steps";

/**
 * The Day and the Backlog as projections (SPEC §4.2, §4.2.1, §4.3; ADR 007). Nothing here writes: the
 * daily reset is a change of the `today` argument. Ports `DayAssembly.merge`, the retire/promote rules
 * of `Rollover.plan` and the order of `ChecklistRepository.buildDay`.
 */

export type DayKind = "row" | "due" | "appearance";
export type Place = "day" | "backlog" | "completed" | "hidden";

export interface TaskPlace {
  place: Place;
  /** How it is in the Day; null unless `place` is "day". */
  kind: DayKind | null;
}

export type DayItem = Task & { kind: DayKind; doneToday: boolean; sortKey: number; steps: StepView[] };
export type BacklogItem = Task & { doneToday: boolean; steps: StepView[] };

export interface BacklogView {
  groups: { group: Group; tasks: BacklogItem[] }[];
  ungrouped: BacklogItem[];
}

interface Frame {
  today: string;
  settings: UserSettings;
  journal: JournalIndex;
  byId: ReadonlyMap<string, Task>;
  steps: ReadonlyMap<string, Task[]>;
}

function frame(state: MergedState, today: string, settings: UserSettings): Frame {
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  return { today, settings, journal: indexJournal(state.events, today), byId, steps: stepsByParent(state.tasks, byId) };
}

const stepsOf = (task: Task, f: Frame): StepView[] => stepViews(task, f.steps.get(task.id) ?? [], f.journal);

/** Done for today: a one-shot by its last mark ever, a repeating task by today's (ADR 007). */
export function doneToday(task: Task, m: Marks, today: string): boolean {
  const mark = task.isRepeating ? m.lastMarkToday : m.lastMark;
  return mark?.type === "DONE" && mark.dayKey >= today;
}

/** A one-shot finished on an earlier day: out of the Day and the Backlog, still in the journal (v1 retire). */
export function isCompleted(task: Task, m: Marks, today: string): boolean {
  return !task.isRepeating && m.lastMark?.type === "DONE" && m.lastMark.dayKey < today;
}

/** The calendar date a task is due, in the user's zone; null when it has no date. */
export function dueDay(task: Task, s: UserSettings): string | null {
  return task.dueDate == null ? null : dueKey(task.dueDate, s);
}

function dayKind(task: Task, m: Marks, f: Frame): DayKind | null {
  if (task.isRepeating) {
    if (m.choiceToday === "SKIPPED") return null;
    if (m.choiceToday === "PULLED_TO_DAY") return "appearance";
    const started = task.startDate == null || dueKey(task.startDate, f.settings) <= f.today;
    return isOn(task.recurrenceMask, weekday(f.today)) && started ? "appearance" : null;
  }
  if (task.location === LOCATION_DAY) return "row";
  const due = dueDay(task, f.settings);
  return due != null && due <= f.today && !m.backlogToday ? "due" : null;
}

/** SPEC §4.2.1: arrival in the Day. A date brings a task in at its day's start; routines at the reset. */
function sortKeyOf(task: Task, kind: DayKind, f: Frame): number {
  if (kind === "appearance") return dayStart(f.today, f.settings);
  const due = dueDay(task, f.settings);
  if (kind === "due" && due != null) return dateStart(due, f.settings);
  return task.enteredDayAt ?? task.createdAt;
}

function placeIn(task: Task, f: Frame): TaskPlace {
  if (task.deletedAt != null) return { place: "hidden", kind: null };
  // A step lives inside its parent, never as a place of its own (ADR 008).
  if (isStepOf(task, f.byId)) return { place: "hidden", kind: null };
  const m = marksOf(f.journal, task.id);
  if (isCompleted(task, m, f.today)) return { place: "completed", kind: null };
  const kind = dayKind(task, m, f);
  return { place: kind ? "day" : "backlog", kind };
}

/** Where one task is today — tools decide by this, never by `location` alone. */
export function locate(state: MergedState, taskId: string, today: string, settings: UserSettings): TaskPlace {
  const task = state.tasks.find((t) => t.id === taskId);
  return task ? placeIn(task, frame(state, today, settings)) : { place: "hidden", kind: null };
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `buildDay`'s order: a group's tasks take the slot of its earliest member, then group id, arrival and
 * creation; done tasks sink to the bottom, keeping their order.
 */
export function orderDay(items: DayItem[]): DayItem[] {
  const anchor = new Map<string, number>();
  for (const i of items) {
    if (i.groupId != null) anchor.set(i.groupId, Math.min(anchor.get(i.groupId) ?? Infinity, i.sortKey));
  }
  const slot = (i: DayItem) => (i.groupId != null ? (anchor.get(i.groupId) as number) : i.sortKey);
  const sorted = [...items].sort(
    (a, b) => slot(a) - slot(b) || byText(a.groupId ?? "", b.groupId ?? "") || a.sortKey - b.sortKey || a.createdAt - b.createdAt,
  );
  return [...sorted.filter((i) => !i.doneToday), ...sorted.filter((i) => i.doneToday)];
}

export function projectDay(state: MergedState, today: string, settings: UserSettings): DayItem[] {
  const f = frame(state, today, settings);
  const items: DayItem[] = [];
  for (const task of state.tasks) {
    const { kind } = placeIn(task, f);
    if (!kind) continue;
    const done = doneToday(task, marksOf(f.journal, task.id), today);
    items.push({ ...task, kind, doneToday: done, sortKey: sortKeyOf(task, kind, f), steps: stepsOf(task, f) });
  }
  return orderDay(items);
}

export function projectBacklog(state: MergedState, today: string, settings: UserSettings): BacklogView {
  const f = frame(state, today, settings);
  const items: BacklogItem[] = [];
  for (const task of state.tasks) {
    const { place } = placeIn(task, f);
    // A repeating definition always lives in the Backlog, even while it appears in the Day (v1).
    if (place !== "backlog" && !(place === "day" && task.isRepeating)) continue;
    items.push({ ...task, doneToday: doneToday(task, marksOf(f.journal, task.id), today), steps: stepsOf(task, f) });
  }
  const order = (a: BacklogItem, b: BacklogItem) =>
    Number(a.doneToday) - Number(b.doneToday) || a.position - b.position || a.createdAt - b.createdAt;
  const groups = liveGroups(state).sort(compareGroups);
  const live = new Set(groups.map((g) => g.id));
  return {
    groups: groups.map((group) => ({ group, tasks: items.filter((t) => t.groupId === group.id).sort(order) })),
    ungrouped: items.filter((t) => t.groupId == null || !live.has(t.groupId)).sort(order),
  };
}

/** Done for today by the projection's rule; a step by its parent's rule (ADR 008). */
export function doneNow(state: MergedState, taskId: string, today: string): boolean {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return false;
  const m = marksOf(indexJournal(state.events, today), taskId);
  const parent = task.parentId == null ? undefined : state.tasks.find((t) => t.id === task.parentId);
  return parent ? stepDone(parent, m) : doneToday(task, m, today);
}

/** Open top-level tasks per group — in today's Day or the Backlog and not done today (UX §2 counters). */
export function openCountByGroup(state: MergedState, today: string, settings: UserSettings): Map<string, number> {
  const f = frame(state, today, settings);
  const counts = new Map<string, number>();
  for (const task of state.tasks) {
    if (task.groupId == null) continue;
    const { place } = placeIn(task, f);
    if (place !== "day" && place !== "backlog") continue;
    if (doneToday(task, marksOf(f.journal, task.id), today)) continue;
    counts.set(task.groupId, (counts.get(task.groupId) ?? 0) + 1);
  }
  return counts;
}
