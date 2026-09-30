import { bit } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { activeDays } from "./format";

describe("activeDays — the weekday chips that are on", () => {
  it("lists a repeating task's days in week order", () => {
    expect(activeDays({ isRepeating: true, recurrenceMask: bit(6) | bit(0) | bit(3) })).toEqual([0, 3, 6]);
  });
  it("a one-shot has none, even with a stale mask", () => {
    expect(activeDays({ isRepeating: false, recurrenceMask: bit(2) })).toEqual([]);
  });
  it("a repeating task with an empty mask has none", () => {
    expect(activeDays({ isRepeating: true, recurrenceMask: 0 })).toEqual([]);
  });
});
