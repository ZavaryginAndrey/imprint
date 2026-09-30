/**
 * Wall clock ⇄ instant in an IANA zone, through `Intl` only — never the runtime's own zone (P5). The
 * server runs in UTC, browsers in whatever zone the machine has; both must compute the same day.
 */

const MINUTE = 60_000;
const HALF_DAY = 12 * 60 * MINUTE;

export interface Wall {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock in `timeZone` at the instant `at` (epoch ms). */
export function wallClock(at: number, timeZone: string): Wall {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(at)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/** The wall clock at `at`, read as if it were UTC — so `wallMs(at) - at` is the zone's offset then. */
function wallMs(at: number, timeZone: string): number {
  const w = wallClock(at, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

function offsetAt(at: number, timeZone: string): number {
  return wallMs(at, timeZone) - Math.floor(at / 1000) * 1000;
}

/**
 * The instant when the wall clock in `timeZone` shows `dateKey hour:minute`. A time that happens twice
 * (fall-back overlap) gives its first occurrence; a time that never happens (spring-forward gap) gives
 * the first instant after the gap.
 */
export function instantOf(dateKey: string, hour: number, minute: number, timeZone: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour, minute);
  // The offset before and after any transition near the target.
  const candidates = [target - offsetAt(target - HALF_DAY, timeZone), target - offsetAt(target + HALF_DAY, timeZone)];
  const exact = candidates.filter((c) => wallMs(c, timeZone) === target);
  if (exact.length > 0) return Math.min(...exact);
  // In a gap: the first minute whose wall clock is past the target.
  let lo = Math.min(...candidates);
  let hi = Math.max(...candidates);
  while (hi - lo > MINUTE) {
    const mid = lo + Math.max(MINUTE, Math.floor((hi - lo) / 2 / MINUTE) * MINUTE);
    if (wallMs(mid, timeZone) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}
