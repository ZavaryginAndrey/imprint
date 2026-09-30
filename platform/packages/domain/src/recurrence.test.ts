import { describe, expect, it } from "vitest";
import { DAILY, WEEKDAYS, WEEKEND, bit, isOn, toggle } from "./recurrence";

describe("recurrence mask (mirror of RecurrenceMask.kt)", () => {
  it("constants match the Kotlin bit layout (Mon=bit0 .. Sun=bit6)", () => {
    expect(DAILY).toBe(127);
    expect(WEEKDAYS).toBe(31); // Mon..Fri
    expect(WEEKEND).toBe(96); // Sat+Sun
    expect(bit(0)).toBe(1); // Monday
    expect(bit(6)).toBe(64); // Sunday
  });

  it("toggle/isOn round-trip", () => {
    let m = 0;
    m = toggle(m, 0); // Mon
    m = toggle(m, 2); // Wed
    expect(isOn(m, 0)).toBe(true);
    expect(isOn(m, 1)).toBe(false);
    expect(isOn(m, 2)).toBe(true);
    m = toggle(m, 0); // off again
    expect(isOn(m, 0)).toBe(false);
  });

  it("WEEKDAYS = Mon..Fri set, weekend clear", () => {
    for (let i = 0; i <= 4; i++) expect(isOn(WEEKDAYS, i)).toBe(true);
    expect(isOn(WEEKDAYS, 5)).toBe(false);
    expect(isOn(WEEKDAYS, 6)).toBe(false);
  });
});
