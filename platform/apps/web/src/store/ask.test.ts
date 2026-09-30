import { describe, expect, it } from "vitest";
import { fakeApi } from "./fakeApi";
import { Store } from "./store";

const snap = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e1" };
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const f = fakeApi(snap);
  const store = new Store({
    api: f.api, clock: () => Date.UTC(2026, 8, 30, 12), conn: "c1", wait: async () => {}, storage: null, offlineAfterMs: 0,
    live: () => ({ close() {} }),
  });
  return { store, f };
}

describe("Store.ask — a server tool (ADR 009)", () => {
  it("goes straight to the server, without ids, the queue or an optimistic run", async () => {
    const { store, f } = setup();
    await store.start();
    const asked = store.ask("suggest_steps", { taskId: "t1" });
    await flush();
    expect(f.calls[0]).toMatchObject({ name: "suggest_steps", input: { taskId: "t1" }, ids: [] });
    expect(store.getState().pending).toBe(0);
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: false, steps: ["a", "b"], remaining: 19 }, rev: 0 });
    expect(await asked).toEqual({ ok: true, changed: false, steps: ["a", "b"], remaining: 19 });
    expect(store.getState().toasts).toHaveLength(0);
  });

  it("the network reads as upstream, quietly", async () => {
    const { store, f } = setup();
    await store.start();
    const asked = store.ask("suggest_steps", { taskId: "t1" });
    await flush();
    f.calls[0].resolve({ kind: "network" });
    expect(await asked).toMatchObject({ ok: false, error: "upstream" });
    expect(store.getState().toasts).toHaveLength(0);
  });

  it("a lost session signs out", async () => {
    const { store, f } = setup();
    await store.start();
    const asked = store.ask("suggest_steps", { taskId: "t1" });
    await flush();
    f.calls[0].resolve({ kind: "unauthorized" });
    expect(await asked).toMatchObject({ ok: false });
    expect(store.getState().auth).toBe("out");
  });
});
