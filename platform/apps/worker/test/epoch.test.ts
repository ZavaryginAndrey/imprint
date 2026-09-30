import { describe, expect, it } from "vitest";
import { SqlStore } from "../src/store/sqlStore";
import { api, newSub, sessionCookie, withStorage } from "./helpers";

describe("epoch", () => {
  it("is created once and kept across wakes", () =>
    withStorage((storage) => {
      const a = new SqlStore(storage).snapshot().epoch;
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
      expect(new SqlStore(storage).snapshot().epoch).toBe(a);
    }));

  it("GET /api/state carries it, and a deleted account starts a new one", async () => {
    const cookie = await sessionCookie(newSub());
    const state = async () => ((await (await api("/api/state", cookie)).json()) as { epoch: string; rev: number });
    const before = await state();
    expect(before.epoch).toMatch(/^[0-9a-f-]{36}$/);
    await api("/api/account", cookie, { method: "DELETE" });
    const after = await state();
    expect(after.epoch).not.toBe(before.epoch);
    expect(after.rev).toBe(0);
  });
});
