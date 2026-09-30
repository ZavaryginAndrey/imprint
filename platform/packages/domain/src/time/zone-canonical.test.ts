import { describe, expect, it } from "vitest";
import { isTimeZone, parseSettings } from "./settings";

// W3 review tail for W4: engines accept values the rest of the platform must not store.
describe("isTimeZone keeps only IANA names as the engine spells them", () => {
  it("offsets are refused — they carry no DST rules", () => {
    expect(["+03:00", "-08:00", "+0300"].some(isTimeZone)).toBe(false);
  });

  it("a case variant is refused; the canonical spelling passes", () => {
    expect(isTimeZone("europe/moscow")).toBe(false);
    expect(isTimeZone("utc")).toBe(false);
    expect(isTimeZone("Europe/Moscow")).toBe(true);
  });

  it("stored junk falls back to the default zone", () => {
    expect(parseSettings({ timezone: "+03:00" }).timezone).toBe("UTC");
  });
});
