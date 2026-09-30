import { describe, expect, it } from "vitest";
import { migrate } from "../src/store/schema";
import { metaQuota } from "../src/tools/quota";
import { withStorage } from "./helpers";

const keys = (storage: DurableObjectStorage) =>
  storage.sql.exec<{ key: string }>(`SELECT key FROM meta WHERE key LIKE 'suggest:%' ORDER BY key`).toArray().map((k) => k.key);

describe("metaQuota", () => {
  it("a zone switch there and back does not hand out a fresh allowance", () =>
    withStorage((storage) => {
      migrate(storage);
      const q = metaQuota(storage);
      expect(q.reserve("2026-09-28", 2)).toBe(1);
      expect(q.reserve("2026-09-28", 2)).toBe(0); // day D used up
      expect(q.reserve("2026-09-29", 2)).toBe(1); // the logical day became D+1
      expect(q.reserve("2026-09-28", 2)).toBeNull(); // and back to D: still no slot
    }));

  it("keys older than two days are pruned, the last two days are kept", () =>
    withStorage((storage) => {
      migrate(storage);
      const q = metaQuota(storage);
      for (const day of ["2026-09-25", "2026-09-26", "2026-09-27"]) q.reserve(day, 5);
      expect(keys(storage)).toEqual(["suggest:2026-09-25", "suggest:2026-09-26", "suggest:2026-09-27"]);
      q.reserve("2026-09-28", 5); // prunes keys before 09-26: the three-day-old 09-25 goes
      expect(keys(storage)).toEqual(["suggest:2026-09-26", "suggest:2026-09-27", "suggest:2026-09-28"]);
    }));
});
