import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS, isTimeZone, parseSettings } from "./settings";

describe("parseSettings (P7)", () => {
  it("anything that is not an object gives the defaults", () => {
    for (const raw of [undefined, null, "x", 42, [1, 2]]) expect(parseSettings(raw)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it("the defaults are UTC, a 04:00 reset and Russian", () => {
    expect(parseSettings({})).toEqual({ timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" });
  });

  it("keeps valid fields and drops unknown ones", () => {
    expect(parseSettings({ timezone: "Europe/Moscow", resetHour: 2, resetMinute: 30, language: "en", theme: "dark" })).toEqual({
      timezone: "Europe/Moscow",
      resetHour: 2,
      resetMinute: 30,
      language: "en",
    });
  });

  it("replaces each invalid field with its default and keeps the rest", () => {
    expect(parseSettings({ timezone: "Mars/Olympus", resetHour: 24, resetMinute: 1.5, language: "de" })).toEqual(DEFAULT_USER_SETTINGS);
    expect(parseSettings({ timezone: "Asia/Tokyo", resetHour: "7" })).toEqual({ ...DEFAULT_USER_SETTINGS, timezone: "Asia/Tokyo" });
  });
});

describe("isTimeZone", () => {
  it("knows IANA zones and fixed offsets and rejects the rest", () => {
    expect(["UTC", "Europe/Moscow", "America/Los_Angeles", "Etc/GMT+8"].every(isTimeZone)).toBe(true);
    expect(["", "Mars/Olympus", 3, null].some(isTimeZone)).toBe(false);
  });
});
