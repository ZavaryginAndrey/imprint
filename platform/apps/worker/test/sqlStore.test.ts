import { ALL_TOOLS, defineTool, type ToolDef } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { SqlStore } from "../src/store/sqlStore";
import { NOON_UTC, sampleEvent, sampleTask, withStorage } from "./helpers";

const EMPTY_INPUT = ALL_TOOLS.find((t) => t.name === "list_groups")!.input;
const testTool = (name: string, run: ToolDef["run"]): ToolDef[] => [
  ...ALL_TOOLS,
  defineTool({ name, description: name, input: EMPTY_INPUT, run }),
];
const at = (ms: number) => ({ read: () => ms });
const count = (storage: DurableObjectStorage, table: string) =>
  storage.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`).one().n;

describe("SqlStore", () => {
  it("a changing call commits its rows and bumps rev by exactly 1", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const call = s.execute("add_task", { title: "Buy milk", where: "backlog" });
      expect(call.result).toMatchObject({ ok: true, changed: true });
      expect(call).toMatchObject({ rev: 1, committed: true });
      expect(count(storage, "tasks")).toBe(1);
      expect(count(storage, "events")).toBe(1); // CREATED — task and event share one rev
      expect(s.snapshot()).toMatchObject({ rev: 1, tasks: [{ title: "Buy milk" }] });
    }));

  it("queries and rule refusals leave rev alone", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const add = s.execute("add_task", { title: "Same", where: "backlog" });
      if (!add.result.ok) throw new Error("add_task failed");
      const taskId = (add.result.task as { id: string }).id;
      expect(s.execute("list_backlog", {})).toMatchObject({ rev: 1, committed: false });
      const same = s.execute("rename_task", { taskId, title: "Same" });
      expect(same.result).toMatchObject({ ok: true, changed: false, reason: "same_value" });
      expect(same.rev).toBe(1);
    }));

  it("a tool that throws after writing leaves nothing — result storage, rev 0", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("boom", (ctx) => {
        ctx.upsertTask(sampleTask());
        throw new Error("kaput");
      });
      const call = s.execute("boom", {}, tools);
      expect(call.result).toMatchObject({ ok: false, error: "storage", message: "kaput" });
      expect(call).toMatchObject({ rev: 0, committed: false });
      expect(count(storage, "tasks")).toBe(0);
      expect(s.snapshot().tasks).toEqual([]);
    }));

  it("a tool that writes and then returns ok:false leaves nothing", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("half", (ctx) => {
        ctx.upsertTask(sampleTask());
        return { ok: false, error: "not_found" };
      });
      expect(s.execute("half", {}, tools)).toMatchObject({ rev: 0, committed: false });
      expect(count(storage, "tasks")).toBe(0);
      expect(s.snapshot().tasks).toEqual([]);
    }));

  it("a commit that fails in SQLite rolls back every row and keeps memory clean", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("bad_row", (ctx) => {
        ctx.upsertTask(sampleTask({ id: "fine" }));
        ctx.upsertTask(sampleTask({ id: "broken", title: null as unknown as string })); // NOT NULL
        return { ok: true, changed: true };
      });
      const call = s.execute("bad_row", {}, tools);
      expect(call.result).toMatchObject({ ok: false, error: "storage" });
      expect(call).toMatchObject({ rev: 0, committed: false });
      expect(count(storage, "tasks")).toBe(0);
      expect(s.snapshot()).toMatchObject({ tasks: [], rev: 0 });
    }));

  it("a tool reads its own pending writes within the run", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("write_then_read", (ctx) => {
        ctx.upsertTask(sampleTask({ id: "a" }));
        ctx.appendEvent(sampleEvent({ id: "ea" }));
        const st = ctx.state();
        return { ok: true, changed: true, tasks: st.tasks.length, events: st.events.length };
      });
      expect(s.execute("write_then_read", {}, tools).result).toMatchObject({ tasks: 1, events: 1 });
    }));

  it("a woken object (new SqlStore, same storage) sees the same rows and rev", () =>
    withStorage((storage) => {
      const first = new SqlStore(storage, at(NOON_UTC));
      first.execute("add_task", { title: "Persisted", where: "day" });
      const woken = new SqlStore(storage, at(NOON_UTC));
      expect(woken.snapshot()).toMatchObject({ rev: 1, tasks: [{ title: "Persisted" }] });
      expect(woken.execute("add_task", { title: "Next", where: "day" }).rev).toBe(2);
    }));

  it("state carries events for the 35-day window only; older ones stay in SQLite", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC)); // today = 2026-09-28 → window from 2026-08-25
      const tools = testTool("journal", (ctx) => {
        ctx.appendEvent(sampleEvent({ id: "old", dayKey: "2026-08-24" }));
        ctx.appendEvent(sampleEvent({ id: "edge", dayKey: "2026-08-25" }));
        return { ok: true, changed: true };
      });
      s.execute("journal", {}, tools);
      expect(s.snapshot().events.map((e) => e.id)).toEqual(["edge"]);
      expect(new SqlStore(storage, at(NOON_UTC)).snapshot().events.map((e) => e.id)).toEqual(["edge"]);
      expect(count(storage, "events")).toBe(2);
    }));

  it("now() never repeats even when the wall clock stands still", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      const tools = testTool("tick", (ctx) => ({ ok: true, changed: false, a: ctx.now(), b: ctx.now() }));
      const one = s.execute("tick", {}, tools).result as unknown as { a: number; b: number };
      const two = s.execute("tick", {}, tools).result as unknown as { a: number; b: number };
      expect(one.b).toBeGreaterThan(one.a);
      expect(two.a).toBeGreaterThan(one.b);
    }));

  it("todayKey is the logical day in the user's zone and reset hour (default UTC, 04:00)", () =>
    withStorage((storage) => {
      new SqlStore(storage, at(Date.UTC(2026, 8, 29, 3, 30))).execute("add_task", { title: "Before reset", where: "day" });
      new SqlStore(storage, at(Date.UTC(2026, 8, 29, 4, 30))).execute("add_task", { title: "After reset", where: "day" });
      const moscow = new SqlStore(storage, at(Date.UTC(2026, 8, 29, 0, 30))); // 03:30 MSK
      moscow.execute("set_user_settings", { timezone: "Europe/Moscow" });
      moscow.execute("add_task", { title: "Moscow night", where: "day" });
      const days = Object.fromEntries(
        moscow.snapshot().events.filter((e) => e.type === "CREATED").map((e) => [e.title, e.dayKey]),
      );
      expect(days).toEqual({ "Before reset": "2026-09-28", "After reset": "2026-09-29", "Moscow night": "2026-09-28" });
    }));

  it("set_user_settings commits with rev, survives a wake, and a repeat changes nothing", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      expect(s.execute("set_user_settings", { timezone: "Asia/Tokyo", resetHour: 5 })).toMatchObject({ rev: 1, committed: true });
      expect(s.execute("set_user_settings", { timezone: "Asia/Tokyo" })).toMatchObject({ rev: 1, committed: false });
      const woken = new SqlStore(storage, at(NOON_UTC));
      expect(woken.snapshot().settings).toEqual({ timezone: "Asia/Tokyo", resetHour: 5, resetMinute: 0, language: "ru" });
      expect(woken.execute("get_user_settings", {}).result).toMatchObject({ settings: { timezone: "Asia/Tokyo" }, today: "2026-09-28" });
    }));

  it("a corrupted settings row falls back to the defaults and tools keep working", () =>
    withStorage((storage) => {
      new SqlStore(storage, at(NOON_UTC)); // runs the migrations
      storage.sql.exec(`INSERT INTO "settings" ("id", "value") VALUES (1, '{"timezone":"Mars/Olympus","resetHour":99')`);
      const s = new SqlStore(storage, at(NOON_UTC));
      expect(s.execute("get_user_settings", {}).result).toMatchObject({ settings: { timezone: "UTC", resetHour: 4 } });
      expect(s.execute("add_task", { title: "Still fine", where: "day" }).result).toMatchObject({ ok: true, changed: true });
    }));

  it("server-run tools stamp deviceId 'server'", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC));
      s.execute("add_task", { title: "X", where: "day" });
      expect(s.snapshot().events.map((e) => e.deviceId)).toEqual(["server"]);
    }));

  it("state carries each task's last mark from before the window, so a task done long ago stays done", () =>
    withStorage((storage) => {
      const s = new SqlStore(storage, at(NOON_UTC)); // today 2026-09-28 → window from 2026-08-25
      const tools = testTool("history", (ctx) => {
        ctx.upsertTask(sampleTask({ id: "old", location: "DAY" }));
        ctx.appendEvent(sampleEvent({ id: "c", taskId: "old", type: "CREATED", dayKey: "2026-07-01", at: 1 }));
        ctx.appendEvent(sampleEvent({ id: "d1", taskId: "old", type: "DONE", dayKey: "2026-07-01", at: 2 }));
        ctx.appendEvent(sampleEvent({ id: "u", taskId: "flip", type: "DONE", dayKey: "2026-07-02", at: 3 }));
        ctx.appendEvent(sampleEvent({ id: "v", taskId: "flip", type: "UNDONE", dayKey: "2026-07-03", at: 4 }));
        return { ok: true, changed: true };
      });
      s.execute("history", {}, tools);
      const ids = (store: SqlStore) => store.snapshot().events.map((e) => e.id).sort();
      expect(ids(s)).toEqual(["d1", "v"]);
      const woken = new SqlStore(storage, at(NOON_UTC));
      expect(ids(woken)).toEqual(["d1", "v"]);
      expect(woken.execute("list_day", {}).result).toMatchObject({ ok: true, tasks: [] });
    }));
});
