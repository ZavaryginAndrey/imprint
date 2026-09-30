import { DAILY, WEEKDAYS, bit } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { repeatDays } from "./format";

describe("repeatDays", () => {
  it("weekday indexes (0 = Monday) of a recurrence mask, in order", () => {
    expect(repeatDays(bit(0) | bit(3))).toEqual([0, 3]);
    expect(repeatDays(WEEKDAYS)).toEqual([0, 1, 2, 3, 4]);
    expect(repeatDays(DAILY)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(repeatDays(0)).toEqual([]);
  });
});
