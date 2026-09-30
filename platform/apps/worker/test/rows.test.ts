import { describe, expect, it } from "vitest";
import {
  EVENT_COLUMNS, GROUP_COLUMNS, TASK_COLUMNS, insertEvent, loadRows, readSettings, writeGroup, writeTask,
} from "../src/store/rows";
import { migrate } from "../src/store/schema";
import { sampleEvent, sampleGroup, sampleTask, withStorage } from "./helpers";

describe("rows", () => {
  it("column lists name every contract field, one to one", () => {
    expect([...TASK_COLUMNS].sort()).toEqual(Object.keys(sampleTask()).sort());
    expect([...GROUP_COLUMNS].sort()).toEqual(Object.keys(sampleGroup()).sort());
    expect([...EVENT_COLUMNS].sort()).toEqual(Object.keys(sampleEvent()).sort());
  });

  it("tasks, groups and events round-trip through SQLite exactly (booleans, nulls, reals, negatives)", () =>
    withStorage((storage) => {
      migrate(storage);
      const t = sampleTask({ isRepeating: true, dueDate: 1_790_000_000_000, groupId: "g1", position: 2.5 });
      const g = sampleGroup({ isCollapsed: true, color: -16777216 });
      const e = sampleEvent({ surface: "overlay", title: null, taskId: null });
      writeTask(storage.sql, t);
      writeGroup(storage.sql, g);
      insertEvent(storage.sql, e);
      expect(loadRows(storage.sql, "2000-01-01")).toEqual({ tasks: [t], groups: [g], events: [e] });
    }));

  it("writeTask replaces the whole row by id", () =>
    withStorage((storage) => {
      migrate(storage);
      writeTask(storage.sql, sampleTask({ title: "Old", groupId: "g1" }));
      writeTask(storage.sql, sampleTask({ title: "New", groupId: null, updatedAt: 2 }));
      expect(loadRows(storage.sql, "2000-01-01").tasks).toEqual([sampleTask({ title: "New", groupId: null, updatedAt: 2 })]);
    }));

  it("insertEvent keeps the first row for a repeated id (append-only journal)", () =>
    withStorage((storage) => {
      migrate(storage);
      insertEvent(storage.sql, sampleEvent({ type: "DONE" }));
      insertEvent(storage.sql, sampleEvent({ type: "UNDONE" }));
      expect(loadRows(storage.sql, "2000-01-01").events.map((e) => e.type)).toEqual(["DONE"]);
    }));

  it("loadRows reads events from sinceDayKey on; tasks and groups always", () =>
    withStorage((storage) => {
      migrate(storage);
      writeTask(storage.sql, sampleTask());
      insertEvent(storage.sql, sampleEvent({ id: "old", dayKey: "2026-08-01" }));
      insertEvent(storage.sql, sampleEvent({ id: "edge", dayKey: "2026-08-25" }));
      insertEvent(storage.sql, sampleEvent({ id: "new", dayKey: "2026-09-28" }));
      const rows = loadRows(storage.sql, "2026-08-25");
      expect(rows.events.map((e) => e.id).sort()).toEqual(["edge", "new"]);
      expect(rows.tasks).toHaveLength(1);
    }));

  it("readSettings is {} when empty or malformed, the stored object otherwise", () =>
    withStorage((storage) => {
      migrate(storage);
      expect(readSettings(storage.sql)).toEqual({});
      storage.sql.exec(`INSERT INTO "settings" ("id", "value") VALUES (1, 'not json')`);
      expect(readSettings(storage.sql)).toEqual({});
      storage.sql.exec(`UPDATE "settings" SET "value" = '[1,2]' WHERE "id" = 1`);
      expect(readSettings(storage.sql)).toEqual({});
      storage.sql.exec(`UPDATE "settings" SET "value" = '{"resetHour":4}' WHERE "id" = 1`);
      expect(readSettings(storage.sql)).toEqual({ resetHour: 4 });
    }));
});
