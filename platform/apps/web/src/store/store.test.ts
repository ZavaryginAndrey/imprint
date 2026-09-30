import { describe, expect, it } from "vitest";
import type { Task } from "@imprint/domain";
import type { LiveHandlers } from "../platform/live";
import { readCache } from "./cache";
import { MemoryStorage, fakeApi } from "./fakeApi";
import { Store } from "./store";

const snap = (p = {}) => ({ tasks: [] as Task[], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 } as Record<string, unknown>, rev: 0, epoch: "e1", ...p });
const flush = () => new Promise((r) => setTimeout(r, 0));
const task = (id: string, title: string): Task => ({
  id, title, location: "DAY", dueDate: null, startDate: null, groupId: null, isRepeating: false, recurrenceMask: 0,
  priority: 0, parentId: null, position: 0, createdAt: 1, enteredDayAt: 1, updatedAt: 1, deletedAt: null,
});

function setup(s = snap(), storage: Storage | null = null) {
  const f = fakeApi(s);
  let liveH: LiveHandlers | null = null;
  const store = new Store({
    api: f.api,
    clock: () => Date.UTC(2026, 8, 30, 12),
    conn: "c1",
    wait: async () => {},
    storage,
    offlineAfterMs: 0,
    live: (h) => {
      liveH = h;
      return { close() {} };
    },
  });
  return { store, f, live: () => liveH as unknown as LiveHandlers };
}
const titles = (store: Store) => store.getState().view?.day.map((t) => t.title);
const MILK = { title: "Milk", view: "day" };

describe("Store", () => {
  it("an action shows before the server answers", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", MILK);
    expect(titles(store)).toEqual(["Milk"]);
    await flush();
    expect(f.calls[0]).toMatchObject({ name: "capture_task" });
    expect(f.calls[0].ids).toHaveLength(2);
  });

  it("a refusal rolls back only its own call and toasts notSaved", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "A", view: "day" });
    store.run("capture_task", { title: "B", view: "day" });
    await flush();
    f.calls[0].resolve({ kind: "done", result: { ok: false, error: "storage" }, rev: 0 });
    await flush();
    expect(titles(store)).toEqual(["B"]);
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["notSaved"]);
    expect(store.getState().toasts[0].action).toEqual({ name: "capture_task", input: { title: "A", view: "day" } });
  });

  it("sends one call at a time, in order", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", { title: "A", view: "day" });
    store.run("capture_task", { title: "B", view: "day" });
    await flush();
    expect(f.calls).toHaveLength(1);
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(f.calls).toHaveLength(2);
    expect((f.calls[1].input as { title: string }).title).toBe("B");
  });

  it("action on a pending row: tick a task before its capture is confirmed", async () => {
    const { store, f } = setup();
    await store.start();
    const add = store.run("capture_task", MILK) as unknown as { task: { id: string } };
    store.run("set_done", { taskId: add.task.id, done: true });
    expect(store.getState().view?.day[0].doneToday).toBe(true);
    await flush();
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(f.calls[1]).toMatchObject({ name: "set_done", input: { taskId: add.task.id } });
  });

  it("an acked call stays visible until the new state arrives", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", MILK);
    await flush();
    f.setState({ kind: "network" });
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(titles(store)).toEqual(["Milk"]);
  });

  it("after the queue drains the state is re-read once; an older state is ignored", async () => {
    const { store, f } = setup();
    await store.start();
    const reads = f.stateReads();
    store.run("capture_task", MILK);
    await flush();
    const ids = f.calls[0].ids;
    f.setState({ kind: "ok", snapshot: snap({ rev: 1, tasks: [task(ids[0], "Milk")] }) });
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(f.stateReads()).toBe(reads + 1);
    expect(titles(store)).toEqual(["Milk"]);
  });

  it("network retry: same ids; a refusal of the retried call is quiet", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("delete_group", { groupId: "g-x" }); // refused locally → never queued
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["notSaved"]);
    expect(f.calls).toHaveLength(0);
    store.dismiss(store.getState().toasts[0].id);
    store.run("capture_task", MILK);
    await flush();
    const ids = f.calls[0].ids;
    f.calls[0].resolve({ kind: "network" });
    await flush();
    expect(store.getState().online).toBe(false);
    expect(f.calls[1].ids).toEqual(ids);
    f.calls[1].resolve({ kind: "done", result: { ok: false, error: "not_found" }, rev: 1 });
    await flush();
    expect(store.getState().toasts).toEqual([]);
    expect(store.getState().online).toBe(true);
  });

  it("push with a newer rev re-reads the state; an old rev does not", async () => {
    const { store, f, live } = setup(snap({ rev: 4 }));
    await store.start();
    const reads = f.stateReads();
    live().changed(3);
    await flush();
    expect(f.stateReads()).toBe(reads);
    f.setState({ kind: "ok", snapshot: snap({ rev: 5, tasks: [task("t1", "From B")] }) });
    live().changed(5);
    await flush();
    expect(titles(store)).toEqual(["From B"]);
  });

  it("epoch change: the new state replaces everything, even with a lower rev", async () => {
    const { store, f, live } = setup(snap({ rev: 9, tasks: [task("t1", "Old")] }));
    await store.start();
    store.run("capture_task", { title: "Pending", view: "day" });
    f.setState({ kind: "ok", snapshot: snap({ rev: 0, epoch: "e2" }) });
    live().deleted();
    await flush();
    expect(titles(store)).toEqual([]);
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 }); // the dropped call's late answer
    await flush();
    expect(titles(store)).toEqual([]);
  });

  it("first sign-in without a zone sets the browser's", async () => {
    const { store, f } = setup(snap({ settings: {} }));
    await store.start();
    await flush();
    expect(f.calls[0]).toMatchObject({ name: "set_user_settings", input: { timezone: expect.any(String), language: expect.stringMatching(/^(ru|en)$/) } });
  });

  it("401 anywhere → auth out", async () => {
    const { store, f } = setup();
    await store.start();
    store.run("capture_task", MILK);
    await flush();
    f.calls[0].resolve({ kind: "unauthorized" });
    await flush();
    expect(store.getState().auth).toBe("out");
  });

  it("the cache shows the last state at once and is kept up to date", async () => {
    const storage = new MemoryStorage();
    const first = setup(snap({ rev: 2, tasks: [task("t1", "Cached")] }), storage);
    await first.store.start();
    expect(readCache(storage, "u1")?.rev).toBe(2);
    const second = setup(snap(), storage);
    second.f.setState({ kind: "network" });
    await second.store.start();
    expect(titles(second.store)).toEqual(["Cached"]);
  });

  it("synced: false while only the cache is shown, true once the server answered", async () => {
    const storage = new MemoryStorage();
    const first = setup(snap({ rev: 2 }), storage);
    await first.store.start();
    expect(first.store.getState().synced).toBe(true);
    const second = setup(snap(), storage);
    second.f.setState({ kind: "network" });
    await second.store.start();
    expect(second.store.getState()).toMatchObject({ synced: false, view: { today: "2026-09-30" } });
  });

  it("start → stop → start (React StrictMode) opens one live socket", async () => {
    const f = fakeApi(snap());
    let opened = 0;
    let closed = 0;
    const store = new Store({
      api: f.api, clock: () => Date.UTC(2026, 8, 30, 12), conn: "c1", wait: async () => {}, storage: null,
      live: () => {
        opened++;
        return { close: () => void closed++ };
      },
    });
    const first = store.start();
    store.stop();
    await Promise.all([first, store.start()]);
    expect(opened - closed).toBe(1);
  });

  it("pending counts calls the server has not confirmed (the page warns before unload)", async () => {
    const { store, f } = setup();
    await store.start();
    expect(store.getState().pending).toBe(0);
    store.run("capture_task", MILK);
    expect(store.getState().pending).toBe(1);
    await flush();
    f.calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 1 });
    await flush();
    expect(store.getState().pending).toBe(0);
  });

  it("offline start: the last user's cached state shows, marked offline (ADR 003 read cache)", async () => {
    const storage = new MemoryStorage();
    const first = setup(snap({ rev: 2, tasks: [task("t1", "Cached")] }), storage);
    await first.store.start();
    const second = setup(snap(), storage);
    second.f.api.me = async () => ({ kind: "down" });
    second.f.setState({ kind: "network" });
    await second.store.start();
    expect(second.store.getState()).toMatchObject({ auth: "in", sub: "u1", online: false, synced: false });
    expect(titles(second.store)).toEqual(["Cached"]);
  });

  it("offline start with nothing cached: the server-down screen", async () => {
    const { store, f } = setup();
    f.api.me = async () => ({ kind: "down" });
    await store.start();
    expect(store.getState().auth).toBe("down");
  });

  it("sign-out forgets this browser's copy of the tasks", async () => {
    const storage = new MemoryStorage();
    const { store } = setup(snap({ rev: 2, tasks: [task("t1", "Cached")] }), storage);
    await store.start();
    await store.logout();
    expect(readCache(storage, "u1")).toBeNull();
    const next = setup(snap(), storage);
    next.f.api.me = async () => ({ kind: "down" });
    await next.store.start();
    expect(next.store.getState().auth).toBe("down");
  });

  it("a toast action runs its call (undo)", async () => {
    const { store } = setup(snap({ tasks: [task("t1", "Milk")] }));
    await store.start();
    store.run("delete_task", { taskId: "t1" });
    store.toast({ text: "deleted", action: { name: "restore_task", input: { taskId: "t1" } } });
    expect(titles(store)).toEqual([]);
    store.act(store.getState().toasts[0].id);
    expect(titles(store)).toEqual(["Milk"]);
    expect(store.getState().toasts).toEqual([]);
  });
});
