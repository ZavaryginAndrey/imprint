import { describe, expect, it } from "vitest";
import { quickDate, quickDates } from "./quick";

// 2026-09-28 is a Monday.
describe("quickDate (v1 DueDates, SPEC §6.3)", () => {
  it("tomorrow and +7 days", () => {
    expect(quickDate("tomorrow", "2026-09-28")).toBe("2026-09-29");
    expect(quickDate("week", "2026-09-28")).toBe("2026-10-05");
  });

  it("weekend: Mon–Fri → this Saturday, Sat → Sunday, Sun → next Saturday", () => {
    expect(quickDate("weekend", "2026-09-28")).toBe("2026-10-03");
    expect(quickDate("weekend", "2026-10-02")).toBe("2026-10-03");
    expect(quickDate("weekend", "2026-10-03")).toBe("2026-10-04");
    expect(quickDate("weekend", "2026-10-04")).toBe("2026-10-10");
  });

  it("across a month and a year end", () => {
    expect(quickDate("tomorrow", "2026-12-31")).toBe("2027-01-01");
    expect(quickDate("week", "2026-12-28")).toBe("2027-01-04");
  });

  it("quickDates gives all three", () => {
    expect(quickDates("2026-09-28")).toEqual({ tomorrow: "2026-09-29", weekend: "2026-10-03", week: "2026-10-05" });
  });
});
