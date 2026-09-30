import { describe, expect, it } from "vitest";
import { daysFromMask, isoDate, maskFromDays, monotonicClock } from "./support";

describe("monotonicClock", () => {
  it("never returns the same millisecond twice, even when the wall clock stands still", () => {
    const clock = monotonicClock(() => 1000);
    expect([clock(), clock(), clock()]).toEqual([1000, 1001, 1002]);
  });

  it("follows the wall clock when it moves ahead", () => {
    let wall = 1000;
    const clock = monotonicClock(() => wall);
    clock();
    wall = 5000;
    expect(clock()).toBe(5000);
  });
});

describe("isoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isoDate.safeParse("2026-09-28").success).toBe(true);
  });
  it("rejects an impossible date and a wrong shape", () => {
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("28.09.2026").success).toBe(false);
  });
});

describe("weekday masks", () => {
  it("maps days to the RecurrenceMask bits (bit0 = Monday) and back", () => {
    expect(maskFromDays(["mon", "sun"])).toBe(65);
    expect(maskFromDays([])).toBe(0);
    expect(daysFromMask(65)).toEqual(["mon", "sun"]);
    expect(daysFromMask(0)).toEqual([]);
  });
});
