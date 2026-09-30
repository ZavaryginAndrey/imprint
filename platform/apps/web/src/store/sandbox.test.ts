import { describe, expect, it } from "vitest";
import { sandbox } from "./sandbox";

const base = { tasks: [], groups: [], events: [], settings: { timezone: "UTC", resetHour: 0 }, rev: 0, epoch: "e" };
const clock = () => Date.UTC(2026, 8, 30, 12);
const MILK = { title: "Milk", view: "day" };

describe("sandbox", () => {
  it("records the ids a run hands out and replays them", () => {
    const a = sandbox(base, clock);
    const first = a.run("capture_task", MILK);
    expect(first.ids).toHaveLength(2);
    const b = sandbox(base, clock, [{ name: "capture_task", input: MILK, ids: first.ids }]);
    expect(b.ctx.state().tasks[0].id).toBe(first.ids[0]);
  });

  it("a call on a row created by an earlier replayed call works", () => {
    const add = sandbox(base, clock).run("capture_task", MILK);
    const b = sandbox(base, clock, [{ name: "capture_task", input: MILK, ids: add.ids }]);
    expect(b.run("set_done", { taskId: add.ids[0], done: true }).result).toMatchObject({ ok: true, changed: true });
  });

  it("a read-only or refused run hands out no ids", () => {
    const s = sandbox(base, clock);
    expect(s.run("list_day", {}).ids).toEqual([]);
    expect(s.run("set_done", { taskId: "nope", done: true })).toMatchObject({ result: { ok: false }, ids: [] });
  });

  it("reads the user's settings (zone, reset) for today", () => {
    const s = sandbox({ ...base, settings: { timezone: "Asia/Tokyo", resetHour: 4 } }, () => Date.UTC(2026, 8, 30, 20));
    expect(s.ctx.todayKey()).toBe("2026-10-01"); // 05:00 in Tokyo, after the 04:00 reset
  });

  it("no base yet: an empty world", () => {
    expect(sandbox(null, clock).ctx.state().tasks).toEqual([]);
  });
});
