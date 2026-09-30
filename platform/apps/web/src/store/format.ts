import { isOn } from "@imprint/domain";

/** The weekdays a recurrence mask repeats on (0 = Monday … 6 = Sunday) — i18n names them. */
export function repeatDays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => isOn(mask, d));
}
