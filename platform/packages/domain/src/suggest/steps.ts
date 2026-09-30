import { z } from "zod";
import { locate } from "../day/project";
import { isStepOf } from "../day/steps";
import type { MergedState } from "../merge";
import type { UserSettings } from "../time/settings";
import { fail, unchanged, type ToolResult } from "../tools/result";
import { id } from "../tools/support";
import type { Task, TaskEvent } from "../types";

/**
 * «Подсказать шаги» (UX §4) — the pure half of the worker's `suggest_steps` (ADR 009). Ports
 * `CloudSplitPrompt` and `ChecklistRepository.cloudContext` (decision №26): more than the title — the
 * group and what is already done in it — and, new in 2.0, the steps the task already has.
 */

export const SUGGEST_DAILY_QUOTA = 20;
export const SUGGEST_HISTORY_LIMIT = 15;

export const SUGGEST_STEPS = {
  name: "suggest_steps",
  description:
    "Suggest 3–5 short concrete steps for a task with an AI model, using its group and what is already done there. Writes " +
    "nothing — pass the steps you keep to add_steps. Limited per day (reason quota, with remaining); errors unavailable " +
    "(no model configured) and upstream (the model failed).",
  input: z.object({ taskId: id }),
};

export interface StepsContext {
  taskTitle: string;
  groupName: string | null;
  completedInGroup: string[];
  existingSteps: string[];
}

/** Titles of DONE events in the group, newest first, each once, without the task's own title (`completedTitlesInGroup`). */
function completedTitles(events: readonly TaskEvent[], groupId: string, exclude: string): string[] {
  const latest = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "DONE" || e.groupId !== groupId || e.title == null || e.title === exclude) continue;
    latest.set(e.title, Math.max(latest.get(e.title) ?? -Infinity, e.at));
  }
  return [...latest]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SUGGEST_HISTORY_LIMIT)
    .map(([title]) => title);
}

export function stepsContext(state: MergedState, task: Task): StepsContext {
  const group = task.groupId == null ? undefined : state.groups.find((g) => g.id === task.groupId && g.deletedAt == null);
  const existingSteps = state.tasks
    .filter((t) => t.deletedAt == null && t.parentId === task.id)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
    .map((t) => t.title);
  return {
    taskTitle: task.title,
    groupName: group?.name ?? null,
    completedInGroup: group ? completedTitles(state.events, group.id, task.title) : [],
    existingSteps,
  };
}

export function buildStepsPrompt(c: StepsContext): string {
  const lines = ["Ты помогаешь разбить крупную задачу на короткие конкретные шаги, с которых легко начать."];
  const group = c.groupName?.trim();
  if (group) lines.push(`Задача относится к проекту «${group}».`);
  const done = c.completedInGroup.map((t) => t.trim()).filter((t) => t.length > 0);
  if (done.length > 0) lines.push("В этом проекте уже сделано:", ...done.map((t) => `— ${t}`), "Не предлагай уже сделанное.");
  const steps = c.existingSteps.map((t) => t.trim()).filter((t) => t.length > 0);
  if (steps.length > 0) lines.push("Уже есть шаги:", ...steps.map((t) => `— ${t}`), "Предложи только недостающие шаги.");
  lines.push(`Разбей задачу «${c.taskTitle.trim()}» на 3–5 коротких конкретных шагов.`);
  lines.push("Ответь только списком шагов на языке задачи, каждый шаг с новой строки, без нумерации и без пояснений.");
  return lines.join("\n");
}

const LEADING_MARKER = /^\s*(?:[-*•·]|\d+[.)])\s+/;

/** One step per line; blanks dropped; a leading bullet or number stripped (models list despite the instruction). */
export function parseSteps(reply: string): string[] {
  return reply
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LEADING_MARKER, "").trim())
    .filter((line) => line.length > 0);
}

/** The prompt for a task, or the refusal the tool returns: not_found, is_step, completed. */
export function prepareSuggestion(
  state: MergedState,
  taskId: string,
  today: string,
  settings: UserSettings,
): { ok: true; prompt: string } | { ok: false; result: ToolResult } {
  const task = state.tasks.find((t) => t.id === taskId && t.deletedAt == null);
  if (!task) return { ok: false, result: fail("not_found") };
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  if (isStepOf(task, byId)) return { ok: false, result: unchanged("is_step") };
  if (locate(state, taskId, today, settings).place === "completed") return { ok: false, result: unchanged("completed") };
  return { ok: true, prompt: buildStepsPrompt(stepsContext(state, task)) };
}
