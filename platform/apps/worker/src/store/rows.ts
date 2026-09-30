import { isGroupColorKey, isGroupIconKey, type Group, type Task, type TaskEvent } from "@imprint/domain";

/**
 * SQLite rows ⇄ the v1 contract (`types.ts`): one column per field, same names (ADR 002). Decoders read
 * only these columns, so a column added by a later migration is ignored by older code (P7).
 */

type Row = Record<string, SqlStorageValue>;

export const TASK_COLUMNS = [
  "id", "title", "location", "dueDate", "startDate", "groupId", "isRepeating", "recurrenceMask",
  "priority", "parentId", "position", "createdAt", "enteredDayAt", "updatedAt", "deletedAt",
] as const satisfies readonly (keyof Task)[];

export const GROUP_COLUMNS = [
  "id", "name", "position", "isCollapsed", "color", "createdAt", "updatedAt", "deletedAt",
] as const satisfies readonly (keyof Group)[];

/** 2.0-only group columns (migration 3). Kept apart so `GROUP_COLUMNS` stays the v1 contract. */
export const GROUP_LOOK_COLUMNS = ["colorKey", "icon"] as const satisfies readonly (keyof Group)[];

export const EVENT_COLUMNS = [
  "id", "taskId", "type", "at", "dayKey", "title", "groupId", "isRepeating", "surface", "deviceId",
] as const satisfies readonly (keyof TaskEvent)[];

const q = (name: string) => `"${name}"`;

function values(row: object, columns: readonly string[]): SqlStorageValue[] {
  const r = row as Record<string, unknown>;
  return columns.map((c) => {
    const v = r[c];
    if (typeof v === "boolean") return v ? 1 : 0;
    return (v ?? null) as SqlStorageValue;
  });
}

function insertSql(verb: string, table: string, columns: readonly string[]): string {
  return `${verb} INTO ${q(table)} (${columns.map(q).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
}

/** Whole-row replace by id: the object serialises writes, so the newest write is the winner. */
function upsert(sql: SqlStorage, table: string, columns: readonly string[], row: object): void {
  const updates = columns.filter((c) => c !== "id").map((c) => `${q(c)} = excluded.${q(c)}`);
  sql.exec(`${insertSql("INSERT", table, columns)} ON CONFLICT("id") DO UPDATE SET ${updates.join(", ")}`, ...values(row, columns));
}

export const writeTask = (sql: SqlStorage, t: Task): void => upsert(sql, "tasks", TASK_COLUMNS, t);
export const writeGroup = (sql: SqlStorage, g: Group): void => upsert(sql, "groups", [...GROUP_COLUMNS, ...GROUP_LOOK_COLUMNS], g);

/** Events are append-only; a repeated id keeps the first row (union by id, as `mergeSnapshots`). */
export function insertEvent(sql: SqlStorage, e: TaskEvent): void {
  sql.exec(insertSql("INSERT OR IGNORE", "events", EVENT_COLUMNS), ...values(e, EVENT_COLUMNS));
}

const str = (v: SqlStorageValue): string => String(v);
const optStr = (v: SqlStorageValue): string | null => (v === null ? null : String(v));
const num = (v: SqlStorageValue): number => Number(v);
const optNum = (v: SqlStorageValue): number | null => (v === null ? null : Number(v));
const bool = (v: SqlStorageValue): boolean => v === 1;

function decodeTask(r: Row): Task {
  return {
    id: str(r.id), title: str(r.title), location: str(r.location), dueDate: optNum(r.dueDate),
    startDate: optNum(r.startDate), groupId: optStr(r.groupId), isRepeating: bool(r.isRepeating),
    recurrenceMask: num(r.recurrenceMask), priority: num(r.priority), parentId: optStr(r.parentId),
    position: num(r.position), createdAt: num(r.createdAt), enteredDayAt: optNum(r.enteredDayAt),
    updatedAt: num(r.updatedAt), deletedAt: optNum(r.deletedAt),
  };
}

function decodeGroup(r: Row): Group {
  const g: Group = {
    id: str(r.id), name: str(r.name), position: num(r.position), isCollapsed: bool(r.isCollapsed),
    color: num(r.color), createdAt: num(r.createdAt), updatedAt: num(r.updatedAt), deletedAt: optNum(r.deletedAt),
  };
  // Only known keys: an old row (NULL) or a hand-edited value reads as absent, and `groupLook` fills it in.
  if (isGroupColorKey(r.colorKey)) g.colorKey = r.colorKey;
  if (isGroupIconKey(r.icon)) g.icon = r.icon;
  return g;
}

function decodeEvent(r: Row): TaskEvent {
  return {
    id: str(r.id), taskId: optStr(r.taskId), type: str(r.type), at: num(r.at), dayKey: str(r.dayKey),
    title: optStr(r.title), groupId: optStr(r.groupId), isRepeating: bool(r.isRepeating),
    surface: optStr(r.surface), deviceId: str(r.deviceId),
  };
}

export interface Rows {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
}

/** Everything the object keeps in memory: all tasks and groups, events from `sinceDayKey` on. */
export function loadRows(sql: SqlStorage, sinceDayKey: string): Rows {
  return {
    tasks: sql.exec<Row>(`SELECT * FROM "tasks"`).toArray().map(decodeTask),
    groups: sql.exec<Row>(`SELECT * FROM "groups"`).toArray().map(decodeGroup),
    events: sql.exec<Row>(`SELECT * FROM "events" WHERE "dayKey" >= ?`, sinceDayKey).toArray().map(decodeEvent),
  };
}

/**
 * Each task's last DONE/UNDONE before `sinceDayKey` — the projection's "completed" rule reads it even when
 * it is older than the event window (ADR 007). Same order as the journal: at, deviceId, id.
 */
export function loadTail(sql: SqlStorage, sinceDayKey: string): TaskEvent[] {
  return sql
    .exec<Row>(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY "taskId" ORDER BY "at" DESC, "deviceId" DESC, "id" DESC) AS "rn"
         FROM "events" WHERE "dayKey" < ? AND "taskId" IS NOT NULL AND "type" IN ('DONE', 'UNDONE')
       ) WHERE "rn" = 1`,
      sinceDayKey,
    )
    .toArray()
    .map(decodeEvent);
}

/** The settings row as an object; `{}` for a new user. */
export function readSettings(sql: SqlStorage): Record<string, unknown> {
  const row = sql.exec<{ value: string }>(`SELECT "value" FROM "settings" WHERE "id" = 1`).toArray()[0];
  if (!row) return {};
  try {
    const v: unknown = JSON.parse(row.value);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Replace the settings row (`id = 1`) with `settings` as JSON. */
export function writeSettings(sql: SqlStorage, settings: object): void {
  sql.exec(
    `INSERT INTO "settings" ("id", "value") VALUES (1, ?) ON CONFLICT("id") DO UPDATE SET "value" = excluded."value"`,
    JSON.stringify(settings),
  );
}
