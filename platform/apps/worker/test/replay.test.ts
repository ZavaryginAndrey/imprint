import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SqlStore } from "../src/store/sqlStore";
import { NOON_UTC, newSub, openLive, postTool, sessionCookie, withStorage } from "./helpers";

const at = { read: () => NOON_UTC };
const MILK = { title: "Milk", view: "day" };

describe("caller ids (ADR 011)", () => {
  it("the task and its event take the ids in order", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const [t, e] = [crypto.randomUUID(), crypto.randomUUID()];
      const call = s.execute("capture_task", MILK, undefined, [t, e]);
      expect(call.result).toMatchObject({ ok: true, task: { id: t } });
      expect(s.snapshot().events.map((x) => x.id)).toEqual([e]);
    }));

  it("a call whose id already exists is a replay: nothing runs, rev stays", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const ids = [crypto.randomUUID(), crypto.randomUUID()];
      s.execute("capture_task", MILK, undefined, ids);
      const again = s.execute("capture_task", MILK, undefined, ids);
      expect(again).toMatchObject({ result: { ok: true, changed: false, reason: "replayed" }, rev: 1, committed: false });
      expect(s.snapshot().tasks).toHaveLength(1);
    }));

  it("an event id alone marks a replay too (set_done twice with the same id)", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const t = crypto.randomUUID();
      s.execute("capture_task", MILK, undefined, [t, crypto.randomUUID()]);
      const e = crypto.randomUUID();
      expect(s.execute("set_done", { taskId: t, done: true }, undefined, [e]).committed).toBe(true);
      expect(s.execute("set_done", { taskId: t, done: false }, undefined, [e]).result).toMatchObject({ reason: "replayed" });
    }));

  it("more ids needed than sent: the rest are the server's own", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at);
      const t = crypto.randomUUID();
      s.execute("capture_task", MILK, undefined, [t]);
      const snap = s.snapshot();
      expect(snap.tasks[0].id).toBe(t);
      expect(snap.events[0].id).not.toBe(t);
    }));

  it("POST /api/tools reads x-imprint-ids; a replay answers the same rev and is not broadcast", async () => {
    const sub = newSub();
    const cookie = await sessionCookie(sub);
    const tab = await openLive(env.USER_STORE.get(env.USER_STORE.idFromName(sub)), "tab-b");
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const post = async () =>
      (await (await postTool("capture_task", cookie, MILK, { "x-imprint-ids": ids.join(",") })).json()) as {
        result: { task?: { id: string }; reason?: string };
        rev: number;
      };
    const first = await post();
    expect(first.result.task?.id).toBe(ids[0]);
    expect(await tab.next()).toEqual({ changed: true, rev: first.rev });
    const second = await post();
    expect(second).toMatchObject({ result: { reason: "replayed" }, rev: first.rev });
    // The next push is for the next real write, not for the replay.
    await postTool("capture_task", cookie, { title: "Bread", view: "day" });
    expect(await tab.next()).toEqual({ changed: true, rev: first.rev + 1 });
  });
});
