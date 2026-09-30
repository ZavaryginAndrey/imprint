import { describe, expect, it } from "vitest";
import { addDays, dateStart, dayStart, dueKey, logicalDayKey, weekday } from "./day";
import type { UserSettings } from "./settings";
import { instantOf } from "./zone";

const zone = (timezone: string, resetHour = 4, resetMinute = 0): UserSettings => ({ timezone, resetHour, resetMinute, language: "ru" });
const UTC = zone("UTC");
const MSK = zone("Europe/Moscow"); // UTC+3, no DST
const LA = zone("America/Los_Angeles"); // UTC−7 in September, UTC−8 in winter

describe("logicalDayKey (SPEC §4.3, LogicalDay.dateOf)", () => {
  it("before the reset belongs to the previous day, in the user's zone", () => {
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 3, 59), UTC)).toBe("2026-09-28");
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 4, 0), UTC)).toBe("2026-09-29");
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 0, 59), MSK)).toBe("2026-09-28"); // 03:59 MSK
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 1, 0), MSK)).toBe("2026-09-29"); // 04:00 MSK
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 10, 59), LA)).toBe("2026-09-28"); // 03:59 PDT
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 11, 0), LA)).toBe("2026-09-29"); // 04:00 PDT
  });

  it("honours reset minutes and a midnight reset", () => {
    const halfPast = zone("Europe/Moscow", 4, 30);
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 1, 29), halfPast)).toBe("2026-09-28"); // 04:29 MSK
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 1, 30), halfPast)).toBe("2026-09-29");
    expect(logicalDayKey(Date.UTC(2026, 8, 28, 23, 59), zone("UTC", 0))).toBe("2026-09-28");
    expect(logicalDayKey(Date.UTC(2026, 8, 29, 0, 0), zone("UTC", 0))).toBe("2026-09-29");
  });

  it("the same instant is a different day in different zones", () => {
    const at = Date.UTC(2026, 8, 29, 2, 0); // 05:00 MSK · 02:00 UTC · 19:00 PDT the day before
    expect([logicalDayKey(at, MSK), logicalDayKey(at, UTC), logicalDayKey(at, LA)]).toEqual(["2026-09-29", "2026-09-28", "2026-09-28"]);
  });

  it("in the repeated hour of a fall-back night the day does not flip back", () => {
    // 2026-11-01 in LA: 01:00–01:59 happens twice (PDT, then PST). Reset at 01:30.
    const s = zone("America/Los_Angeles", 1, 30);
    expect(logicalDayKey(Date.UTC(2026, 10, 1, 8, 29), s)).toBe("2026-10-31"); // 01:29 PDT
    expect(logicalDayKey(Date.UTC(2026, 10, 1, 8, 30), s)).toBe("2026-11-01"); // 01:30 PDT — the reset
    expect(logicalDayKey(Date.UTC(2026, 10, 1, 9, 0), s)).toBe("2026-11-01"); // 01:00 PST, second pass
  });
});

describe("dayStart / dateStart", () => {
  it("dayStart is the reset moment of that date in the zone", () => {
    expect(dayStart("2026-09-29", UTC)).toBe(Date.UTC(2026, 8, 29, 4, 0));
    expect(dayStart("2026-09-29", MSK)).toBe(Date.UTC(2026, 8, 29, 1, 0));
    expect(dayStart("2026-09-29", LA)).toBe(Date.UTC(2026, 8, 29, 11, 0));
  });

  it("dateStart is local midnight — the dueDate encoding (DueDates.startOfDay)", () => {
    expect(dateStart("2026-09-29", MSK)).toBe(Date.UTC(2026, 8, 28, 21, 0));
    expect(dateStart("2026-09-29", LA)).toBe(Date.UTC(2026, 8, 29, 7, 0));
  });

  it("a reset inside the spring-forward gap is the first moment after it", () => {
    // 2026-03-08 in LA: 02:00 PST jumps to 03:00 PDT.
    const s = zone("America/Los_Angeles", 2, 30);
    expect(dayStart("2026-03-08", s)).toBe(Date.UTC(2026, 2, 8, 10, 0));
    expect(logicalDayKey(Date.UTC(2026, 2, 8, 9, 59), s)).toBe("2026-03-07"); // 01:59 PST
  });

  it("a wall time inside the fall-back overlap is its first occurrence", () => {
    expect(instantOf("2026-11-01", 1, 30, "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 1, 8, 30));
  });
});

describe("dueKey", () => {
  it("reads a stored date back in the same zone", () => {
    expect(dueKey(dateStart("2026-10-05", MSK), MSK)).toBe("2026-10-05");
    expect(dueKey(dateStart("2026-10-05", LA), LA)).toBe("2026-10-05");
  });

  it("a date set in one zone keeps its day after a move to another", () => {
    expect(dueKey(dateStart("2026-10-05", MSK), LA)).toBe("2026-10-05");
    expect(dueKey(dateStart("2026-10-05", LA), MSK)).toBe("2026-10-05");
  });

  it("a v1 date stamped at the reset moment reads as that date", () => {
    expect(dueKey(dayStart("2026-10-05", MSK), MSK)).toBe("2026-10-05");
  });
});

describe("addDays / weekday", () => {
  it("steps across months, years and DST without the runtime zone", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-09-28", -34)).toBe("2026-08-25");
  });

  it("weekday is RecurrenceMask's bit index: 0 = Monday … 6 = Sunday", () => {
    expect(weekday("2026-09-28")).toBe(0);
    expect(weekday("2026-01-15")).toBe(3);
    expect(weekday("2026-10-04")).toBe(6);
  });
});
