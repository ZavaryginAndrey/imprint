import { bit } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { toggledDays } from "./format";

describe("toggledDays — set_repeating's days after a weekday chip", () => {
  it("turns a day on for a one-shot", () => {
    expect(toggledDays({ isRepeating: false, recurrenceMask: 0 }, 0)).toEqual(["mon"]);
  });
  it("turns a day off, keeping the rest in week order", () => {
    expect(toggledDays({ isRepeating: true, recurrenceMask: bit(0) | bit(3) | bit(6) }, 3)).toEqual(["mon", "sun"]);
  });
  it("the last day off means «Не повторять» (null)", () => {
    expect(toggledDays({ isRepeating: true, recurrenceMask: bit(4) }, 4)).toBeNull();
  });
  it("a stale mask on a one-shot is ignored", () => {
    expect(toggledDays({ isRepeating: false, recurrenceMask: bit(2) }, 0)).toEqual(["mon"]);
  });
});
