import type { Call } from "./sandbox";

/** A call waiting for the server. `retried`: an attempt was lost on the network, so a refusal means it already landed. */
export interface Pending extends Call {
  retried: boolean;
}
/** A call the server confirmed at `rev`, kept in the view until a state at least that new arrives. */
export interface Acked extends Call {
  rev: number;
}

/** Retry delay after the n-th failed attempt (n from 0): 1 s, 2 s, 4 s … 30 s. */
export function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/** The «нет связи» mark waits this long, so a blip stays invisible. */
export const OFFLINE_AFTER_MS = 5000;
