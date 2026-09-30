import { describe, expect, it } from "vitest";
import { insertEvent, loadRows, writeTask } from "../src/store/rows";
import { MIGRATIONS, SCHEMA_VERSION, migrate, readMeta, type Migration } from "../src/store/schema";
import { sampleEvent, sampleTask, withStorage } from "./helpers";

const tables = (storage: DurableObjectStorage) =>
  storage.sql
    .exec<{ name: string }>(`SELECT "name" FROM sqlite_master WHERE "type" = 'table'`)
    .toArray()
    .map((r) => r.name);

describe("migrations", () => {
  it("a fresh object migrates to SCHEMA_VERSION with every table", () =>
    withStorage((storage) => {
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(tables(storage)).toEqual(expect.arrayContaining(["meta", "tasks", "groups", "events", "settings"]));
      expect(readMeta(storage.sql, "schemaVersion")).toBe(String(SCHEMA_VERSION));
    }));

  it("migrating again is a no-op", () =>
    withStorage((storage) => {
      migrate(storage);
      writeTask(storage.sql, sampleTask());
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(loadRows(storage.sql, "2000-01-01").tasks).toHaveLength(1);
    }));

  it("a W1 object (meta with hello_count, no schemaVersion) migrates and keeps its meta", () =>
    withStorage((storage) => {
      storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      storage.sql.exec("INSERT INTO meta (key, value) VALUES ('hello_count', '3')");
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(readMeta(storage.sql, "hello_count")).toBe("3");
    }));

  it("a later migration runs only the missing step; old code ignores the new column (P7)", () =>
    withStorage((storage) => {
      migrate(storage);
      const t = sampleTask({ title: "Kept" });
      writeTask(storage.sql, t);
      const v2: Migration = { version: SCHEMA_VERSION + 1, up: (sql) => void sql.exec(`ALTER TABLE "tasks" ADD COLUMN "note" TEXT`) };
      expect(migrate(storage, [...MIGRATIONS, v2])).toBe(SCHEMA_VERSION + 1);
      expect(loadRows(storage.sql, "2000-01-01").tasks).toEqual([t]);
    }));

  it("a failing migration rolls back entirely and keeps the old version", () =>
    withStorage((storage) => {
      migrate(storage);
      const bad: Migration = {
        version: SCHEMA_VERSION + 1,
        up: (sql) => {
          sql.exec(`CREATE TABLE "scratch" ("x" INTEGER)`);
          throw new Error("boom");
        },
      };
      expect(() => migrate(storage, [...MIGRATIONS, bad])).toThrow("boom");
      expect(readMeta(storage.sql, "schemaVersion")).toBe(String(SCHEMA_VERSION));
      expect(tables(storage)).not.toContain("scratch");
    }));

  it("migration 2 indexes events by taskId on an existing version-1 object", () =>
    withStorage((storage) => {
      migrate(storage, MIGRATIONS.slice(0, 1));
      insertEvent(storage.sql, sampleEvent());
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      const indexes = storage.sql
        .exec<{ name: string }>(`SELECT "name" FROM sqlite_master WHERE "type" = 'index'`)
        .toArray()
        .map((r) => r.name);
      expect(indexes).toContain("events_taskId");
      expect(loadRows(storage.sql, "2000-01-01").events).toHaveLength(1);
    }));
});
