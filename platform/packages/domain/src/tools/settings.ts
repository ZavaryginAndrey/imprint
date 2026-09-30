import { z } from "zod";
import { LANGUAGES, isTimeZone, type UserSettings } from "../time/settings";
import { defineTool, type ToolDef } from "./define";
import { changed, found, unchanged } from "./result";

/** Settings tools (SPEC §4.3, P5): the zone and reset time decide what "today" is for every other tool. */

export const setUserSettings = defineTool({
  name: "set_user_settings",
  description:
    "Change the user's settings: timezone (IANA name, e.g. Europe/Moscow), resetHour/resetMinute (when the logical day " +
    "turns over, default 04:00) and language (ru or en). Fields left out stay as they are; past events keep their day.",
  input: z.object({
    timezone: z.string().refine(isTimeZone, "unknown time zone").optional(),
    resetHour: z.number().int().min(0).max(23).optional(),
    resetMinute: z.number().int().min(0).max(59).optional(),
    language: z.enum(LANGUAGES).optional(),
  }),
  run(ctx, i) {
    const current = ctx.settings();
    const next: UserSettings = {
      timezone: i.timezone ?? current.timezone,
      resetHour: i.resetHour ?? current.resetHour,
      resetMinute: i.resetMinute ?? current.resetMinute,
      language: i.language ?? current.language,
    };
    const same = (Object.keys(next) as (keyof UserSettings)[]).every((k) => next[k] === current[k]);
    if (same) return unchanged("same_value", { settings: current });
    ctx.putSettings(next);
    return changed({ settings: next });
  },
});

export const getUserSettings = defineTool({
  name: "get_user_settings",
  description: "Read the user's settings (timezone, reset time, language) and today's logical day as YYYY-MM-DD.",
  input: z.object({}),
  run: (ctx) => found({ settings: ctx.settings(), today: ctx.todayKey() }),
});

export const SETTINGS_TOOLS: ToolDef[] = [setUserSettings, getUserSettings];
