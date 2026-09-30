import { argbOf, groupLook } from "@imprint/domain";
import { describe, expect, it } from "vitest";
import { loadRows, writeGroup } from "../src/store/rows";
import { MIGRATIONS, SCHEMA_VERSION, migrate } from "../src/store/schema";
import { sampleGroup, withStorage } from "./helpers";

const V1_INDIGO = 0xff6c7ae0;

describe("migration 3: group colour key and icon", () => {
  it("a version-2 object gains the columns; its old rows read without them and look like v1", () =>
    withStorage((storage) => {
      migrate(storage, MIGRATIONS.slice(0, 2));
      storage.sql.exec(
        `INSERT INTO "groups" ("id", "name", "position", "isCollapsed", "color", "createdAt", "updatedAt", "deletedAt")
         VALUES ('g1', 'Group', 0, 0, ?, 1, 1, NULL)`,
        V1_INDIGO,
      );
      expect(migrate(storage)).toBe(SCHEMA_VERSION);
      expect(SCHEMA_VERSION).toBe(3);
      const [g] = loadRows(storage.sql, "2000-01-01").groups;
      expect(g).toEqual(sampleGroup({ color: V1_INDIGO }));
      expect(groupLook(g)).toEqual({ colorKey: "blue", icon: "tag" });
    }));

  it("a group with a look round-trips", () =>
    withStorage((storage) => {
      migrate(storage);
      const g = sampleGroup({ colorKey: "teal", icon: "house", color: argbOf("teal") });
      writeGroup(storage.sql, g);
      expect(loadRows(storage.sql, "2000-01-01").groups).toEqual([g]);
    }));

  it("an unknown key or icon stored by hand reads as absent", () =>
    withStorage((storage) => {
      migrate(storage);
      writeGroup(storage.sql, sampleGroup());
      storage.sql.exec(`UPDATE "groups" SET "colorKey" = 'neon', "icon" = 'rocket'`);
      expect(loadRows(storage.sql, "2000-01-01").groups).toEqual([sampleGroup()]);
    }));
});
