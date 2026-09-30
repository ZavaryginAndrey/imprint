/**
 * The user's settings (SPEC §4.3, P5): the zone and reset time that define the logical day, and the
 * interface language. The server stores them as one JSON row; `parseSettings` turns whatever is stored
 * (or nothing) into a full value, so the server and the browser apply the same defaults (P7).
 */

export const LANGUAGES = ["ru", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export interface UserSettings {
  /** IANA zone, e.g. "Europe/Moscow". */
  timezone: string;
  /** When the logical day turns over (SPEC §4.3, default 04:00). */
  resetHour: number;
  resetMinute: number;
  language: Language;
}

export const DEFAULT_USER_SETTINGS: UserSettings = { timezone: "UTC", resetHour: 4, resetMinute: 0, language: "ru" };

/**
 * True for an IANA zone the runtime's `Intl` knows, spelled as the engine spells it. Engines also accept
 * offsets ("+03:00", no DST rules) and any letter case — both are refused. An alias the engine maps to
 * another name (Europe/Kiev → Europe/Kyiv) passes: engines disagree on those, and a browser's own zone
 * must never be refused by the server.
 */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || /^[+-]\d/.test(value)) return false;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return resolved === value || resolved.toLowerCase() !== value.toLowerCase();
  } catch {
    return false;
  }
}

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Stored JSON → full settings: unknown fields are dropped, an invalid field takes its default. */
export function parseSettings(raw: unknown): UserSettings {
  const r = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_USER_SETTINGS;
  return {
    timezone: isTimeZone(r.timezone) ? r.timezone : d.timezone,
    resetHour: intIn(r.resetHour, 0, 23) ? r.resetHour : d.resetHour,
    resetMinute: intIn(r.resetMinute, 0, 59) ? r.resetMinute : d.resetMinute,
    language: LANGUAGES.includes(r.language as Language) ? (r.language as Language) : d.language,
  };
}
