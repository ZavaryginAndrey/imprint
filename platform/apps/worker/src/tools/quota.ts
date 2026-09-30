import { addDays } from "@imprint/domain";
import { readMeta, writeMeta } from "../store/schema";

/** A per-day allowance kept in `meta` (`suggest:<dayKey>`); it never changes `rev` and is not broadcast. */
export interface QuotaStore {
  /** Take one slot for `day`; the slots left after it, or null when none are left. */
  reserve(day: string, limit: number): number | null;
  /** Give back a slot taken for a call that failed. */
  release(day: string): void;
}

const key = (day: string) => `suggest:${day}`;

export function metaQuota(storage: DurableObjectStorage): QuotaStore {
  return {
    reserve(day, limit) {
      return storage.transactionSync(() => {
        const used = Number(readMeta(storage.sql, key(day)) ?? 0);
        if (used >= limit) return null;
        // Keep the last two days: a zone or reset change moves the logical day by at most one, so a round trip finds its counter.
        storage.sql.exec(`DELETE FROM meta WHERE key LIKE 'suggest:%' AND key < ?`, key(addDays(day, -2))); // ISO dates order as strings
        writeMeta(storage.sql, key(day), String(used + 1));
        return limit - used - 1;
      });
    },
    release(day) {
      storage.transactionSync(() => {
        const used = Number(readMeta(storage.sql, key(day)) ?? 0);
        if (used > 0) writeMeta(storage.sql, key(day), String(used - 1));
      });
    },
  };
}
