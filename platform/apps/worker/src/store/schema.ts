/**
 * The user's SQLite schema (W2 · ADR 002). `meta` is key/value (`schemaVersion`, `rev`) and predates
 * the migrations (W1 created it), so it is bootstrapped outside them. Each migration commits together
 * with its `schemaVersion`; one that throws leaves the previous version intact. Dropping a column
 * only ever happens in a separate release (DB-1).
 */

export interface Migration {
  version: number;
  up(sql: SqlStorage): void;
}

const V1: readonly string[] = [
  `CREATE TABLE "tasks" ("id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "location" TEXT NOT NULL,
    "dueDate" INTEGER, "startDate" INTEGER, "groupId" TEXT, "isRepeating" INTEGER NOT NULL,
    "recurrenceMask" INTEGER NOT NULL, "priority" INTEGER NOT NULL, "parentId" TEXT,
    "position" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL, "enteredDayAt" INTEGER,
    "updatedAt" INTEGER NOT NULL, "deletedAt" INTEGER)`,
  `CREATE TABLE "groups" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "position" INTEGER NOT NULL,
    "isCollapsed" INTEGER NOT NULL, "color" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL, "deletedAt" INTEGER)`,
  `CREATE TABLE "events" ("id" TEXT PRIMARY KEY, "taskId" TEXT, "type" TEXT NOT NULL,
    "at" INTEGER NOT NULL, "dayKey" TEXT NOT NULL, "title" TEXT, "groupId" TEXT,
    "isRepeating" INTEGER NOT NULL, "surface" TEXT, "deviceId" TEXT NOT NULL)`,
  `CREATE INDEX "events_dayKey" ON "events" ("dayKey")`,
  `CREATE TABLE "settings" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "value" TEXT NOT NULL)`,
];

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, up: (sql) => V1.forEach((statement) => sql.exec(statement)) },
  // W3a: the journal tail (each task's last DONE/UNDONE before the window) is read by taskId.
  { version: 2, up: (sql) => void sql.exec(`CREATE INDEX "events_taskId" ON "events" ("taskId")`) },
  // W3b: a group's colour key and icon (UX §5). `color` stays for v1 and is derived from the key.
  {
    version: 3,
    up: (sql) => {
      sql.exec(`ALTER TABLE "groups" ADD COLUMN "colorKey" TEXT`);
      sql.exec(`ALTER TABLE "groups" ADD COLUMN "icon" TEXT`);
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function readMeta(sql: SqlStorage, key: string): string | null {
  const rows = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray();
  return rows[0]?.value ?? null;
}

export function writeMeta(sql: SqlStorage, key: string, value: string): void {
  sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

/** Bring the object's SQLite up to the newest schema (on wake). Returns the version reached. */
export function migrate(storage: DurableObjectStorage, migrations: readonly Migration[] = MIGRATIONS): number {
  storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  let version = Number(readMeta(storage.sql, "schemaVersion") ?? 0);
  for (const m of migrations) {
    if (m.version <= version) continue;
    storage.transactionSync(() => {
      m.up(storage.sql);
      writeMeta(storage.sql, "schemaVersion", String(m.version));
    });
    version = m.version;
  }
  return version;
}
