import { describe, expect, it } from "vitest";
import type { UserSettings } from "../time/settings";
import { ok } from "./fixtures";
import { runTool } from "./index";
import { memoryContext } from "./memoryContext";

const MSK: UserSettings = { timezone: "Europe/Moscow", resetHour: 4, resetMinute: 0, language: "ru" };

describe("set_user_settings", () => {
  it("patches only the given fields", () => {
    const ctx = memoryContext({ settings: MSK });
    const r = ok(runTool(ctx, "set_user_settings", { resetHour: 2, language: "en" }));
    expect(r).toMatchObject({ changed: true, settings: { timezone: "Europe/Moscow", resetHour: 2, resetMinute: 0, language: "en" } });
    expect(ctx.settings()).toEqual(r.settings);
  });

  it("the same values, or no fields at all, are same_value", () => {
    const ctx = memoryContext({ settings: MSK });
    expect(runTool(ctx, "set_user_settings", { timezone: "Europe/Moscow" })).toMatchObject({ changed: false, reason: "same_value" });
    expect(runTool(ctx, "set_user_settings", {})).toMatchObject({ changed: false, reason: "same_value" });
  });

  it("an unknown zone or an out-of-range hour is invalid_input and changes nothing", () => {
    const ctx = memoryContext({ settings: MSK });
    expect(runTool(ctx, "set_user_settings", { timezone: "Mars/Olympus" })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(runTool(ctx, "set_user_settings", { resetHour: 24 })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(ctx.settings()).toEqual(MSK);
  });

  it("a new reset hour moves today at once (ADR 007)", () => {
    // 03:00 MSK on the 29th: with a 04:00 reset it is still the 28th; with 02:00 it is the 29th.
    const ctx = memoryContext({ clock: () => Date.UTC(2026, 8, 29, 0, 0), settings: MSK });
    expect(ctx.todayKey()).toBe("2026-09-28");
    ok(runTool(ctx, "set_user_settings", { resetHour: 2 }));
    expect(ctx.todayKey()).toBe("2026-09-29");
  });
});

describe("get_user_settings", () => {
  it("returns the settings and today's logical day", () => {
    const ctx = memoryContext({ clock: () => Date.UTC(2026, 8, 29, 2, 0), settings: MSK }); // 05:00 MSK
    expect(ok(runTool(ctx, "get_user_settings", {}))).toMatchObject({ changed: false, settings: MSK, today: "2026-09-29" });
  });
});

describe("memoryContext time", () => {
  it("defaults to the host zone and a midnight reset, so today is the local calendar day", () => {
    const ctx = memoryContext();
    expect(ctx.settings()).toMatchObject({ resetHour: 0, resetMinute: 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    expect(ctx.todayKey()).toBe("2026-09-28");
  });

  it("with a clock, now() follows it without repeating and today moves with it", () => {
    let wall = Date.UTC(2026, 8, 28, 10, 0);
    const ctx = memoryContext({ clock: () => wall, settings: { timezone: "UTC", resetHour: 4 } });
    expect([ctx.now(), ctx.now()]).toEqual([wall, wall + 1]);
    expect(ctx.todayKey()).toBe("2026-09-28");
    wall = Date.UTC(2026, 8, 29, 5, 0);
    expect(ctx.now()).toBe(wall);
    expect(ctx.todayKey()).toBe("2026-09-29");
  });
});
