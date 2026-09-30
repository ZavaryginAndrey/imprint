import type { MergedState } from "../merge";
import type { UserSettings } from "../time/settings";
import type { Group, Task, TaskEvent } from "../types";

/**
 * The only thing a tool sees (web Tools spec). Reads are the merged state — peers + this peer's own
 * draft, LWW, tombstones kept — and they reflect this peer's writes at once. Writes go to the draft
 * only (single-writer-per-file, decision №25/№28). No localStorage, Drive or DOM behind a tool, so the
 * same code runs in the page and, later, in a Node MCP server.
 */
export interface ToolContext {
  state(): MergedState;
  upsertTask(task: Task): void;
  upsertGroup(group: Group): void;
  appendEvent(event: TaskEvent): void;
  /** Epoch millis. A tool reads it once per run. */
  now(): number;
  /** The logical day, YYYY-MM-DD: `logicalDayKey(now, settings())` unless a test pins it. */
  todayKey(): string;
  /** The user's settings — the only source of the zone and reset time (P5). */
  settings(): UserSettings;
  /** Replace the settings; only `set_user_settings` writes them. */
  putSettings(settings: UserSettings): void;
  /** A fresh row or event id. The caller may supply them, so a browser preview and the server agree (ADR 011). */
  newId(): string;
  readonly deviceId: string;
}
