import { addDays, weekday } from "./day";

/** The input field's date chips (UX §3; v1 `DueDates`): always strictly after today. «Сегодня» has no chip. */
export type QuickDate = "tomorrow" | "weekend" | "week";

export function quickDate(kind: QuickDate, today: string): string {
  if (kind === "tomorrow") return addDays(today, 1);
  if (kind === "week") return addDays(today, 7);
  // The nearest Saturday or Sunday after today: Mon–Fri → Saturday, Sat → Sunday, Sun → next Saturday.
  let d = addDays(today, 1);
  while (weekday(d) < 5) d = addDays(d, 1);
  return d;
}

export function quickDates(today: string): Record<QuickDate, string> {
  return { tomorrow: quickDate("tomorrow", today), weekend: quickDate("weekend", today), week: quickDate("week", today) };
}
