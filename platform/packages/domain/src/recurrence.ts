/**
 * Weekday cadence as a 7-bit mask — mirrors `com.imprint.app.domain.RecurrenceMask` **exactly**
 * (SPEC §4.1): bit 0 = Monday … bit 6 = Sunday, 127 = every day. A web-added repeating task must
 * carry the same bits so the phone's `buildDay` computes its Day appearances correctly.
 */

export const DAILY = 127;
export const WEEKDAYS = 31; // Mon–Fri (bits 0..4)
export const WEEKEND = 96; // Sat+Sun (bits 5..6)

export function bit(index: number): number {
  return 1 << index; // index 0..6 = Mon..Sun
}

export function isOn(mask: number, index: number): boolean {
  return (mask & bit(index)) !== 0;
}

export function toggle(mask: number, index: number): number {
  return mask ^ bit(index);
}
