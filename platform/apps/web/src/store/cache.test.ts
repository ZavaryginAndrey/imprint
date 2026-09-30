import { describe, expect, it } from "vitest";
import { readCache, writeCache } from "./cache";
import { MemoryStorage } from "./fakeApi";

const snap = { tasks: [], groups: [], events: [], settings: {}, rev: 2, epoch: "e" };

describe("cache", () => {
  it("round-trips per user", () => {
    const s = new MemoryStorage();
    writeCache(s, "u1", snap);
    expect(readCache(s, "u1")).toEqual(snap);
    expect(readCache(s, "u2")).toBeNull();
  });

  it("garbage, an old shape or no storage → null, never throws", () => {
    const s = new MemoryStorage();
    s.setItem("imprint.snapshot.u1", "{nope");
    expect(readCache(s, "u1")).toBeNull();
    s.setItem("imprint.snapshot.u1", JSON.stringify({ tasks: [], rev: 1 }));
    expect(readCache(s, "u1")).toBeNull();
    expect(readCache(null, "u1")).toBeNull();
    expect(() => writeCache(null, "u1", snap)).not.toThrow();
  });

  it("a storage that throws (private mode, quota) is survived", () => {
    const s = new MemoryStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => writeCache(s, "u1", snap)).not.toThrow();
  });
});
