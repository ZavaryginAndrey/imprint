import { isSnapshot, type Snapshot } from "../platform/api";

/**
 * The last accepted state per user, shown at once after a reload and read-only while the server is out
 * of reach (ADR 003). Sign-out forgets it: a shared computer keeps no one's tasks.
 */
const key = (sub: string) => `imprint.snapshot.${sub}`;
const LAST_USER = "imprint.lastSub";

export function readCache(storage: Storage | null, sub: string): Snapshot | null {
  try {
    const v: unknown = JSON.parse(storage?.getItem(key(sub)) ?? "null");
    return isSnapshot(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeCache(storage: Storage | null, sub: string, snap: Snapshot): void {
  try {
    storage?.setItem(key(sub), JSON.stringify(snap));
    storage?.setItem(LAST_USER, sub);
  } catch {
    // quota or private mode: the cache is a convenience
  }
}

/** Who was signed in here last — whose cache an offline start may show. */
export function lastUser(storage: Storage | null): string | null {
  try {
    return storage?.getItem(LAST_USER) ?? null;
  } catch {
    return null;
  }
}

export function forgetUser(storage: Storage | null, sub: string): void {
  try {
    storage?.removeItem(key(sub));
    if (storage?.getItem(LAST_USER) === sub) storage.removeItem(LAST_USER);
  } catch {
    // nothing to forget
  }
}
