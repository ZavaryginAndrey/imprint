import { DAY_NAMES, isOn, type DayName } from "@imprint/domain";

/** The weekdays a recurrence mask repeats on (0 = Monday … 6 = Sunday) — i18n names them. */
export function repeatDays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => isOn(mask, d));
}

/** The weekday chips that are on for a task (0 = Monday … 6 = Sunday); a one-shot's leftover mask counts as no days. */
export function activeDays(task: { isRepeating: boolean; recurrenceMask: number }): number[] {
  return task.isRepeating ? repeatDays(task.recurrenceMask) : [];
}

/**
 * `set_repeating`'s `days` after the weekday chip `day` was clicked (UX §4): the task's days with that one
 * flipped, in week order; none left → null («Не повторять»).
 */
export function toggledDays(task: { isRepeating: boolean; recurrenceMask: number }, day: number): DayName[] | null {
  const on = activeDays(task);
  const next = on.includes(day) ? on.filter((d) => d !== day) : [...on, day];
  const days = DAY_NAMES.filter((_, i) => next.includes(i));
  return days.length > 0 ? days : null;
}
