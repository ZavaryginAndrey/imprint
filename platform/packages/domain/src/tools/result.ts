/**
 * Tool results are plain JSON (an MCP server returns them verbatim). Errors are data, not exceptions:
 * an agent must be able to read *why* an action did nothing.
 */

/** A rule refused the change, or there was nothing to change. */
export type Reason =
  | "same_value"
  | "done_today"
  | "skipped_today"
  | "not_empty"
  | "empty_steps"
  | "already_in_day"
  | "already_in_backlog"
  /** The task is a step: it lives inside its parent and has no place of its own (ADR 008). */
  | "is_step"
  /** The task was finished on an earlier day; bring it back with UNDONE from History (W6). */
  | "completed"
  /** The daily allowance of a metered tool is used up. */
  | "quota"
  /** The server saw this call before (one of its x-imprint-ids exists): nothing ran again (ADR 011). */
  | "replayed";

export type ToolError = "invalid_input" | "not_found" | "storage" | "unknown_tool" | "upstream" | "unavailable";

export type ToolOk = { ok: true; changed: boolean; reason?: Reason; [key: string]: unknown };
export type ToolFail = { ok: false; error: ToolError; message?: string; issues?: unknown };
export type ToolResult = ToolOk | ToolFail;

/** A write happened. */
export function changed(payload: Record<string, unknown> = {}): ToolOk {
  return { ...payload, ok: true, changed: true };
}

/** Nothing was written, for a stated reason. */
export function unchanged(reason: Reason, extra: Record<string, unknown> = {}): ToolOk {
  return { ...extra, ok: true, changed: false, reason };
}

/** A read-only answer (queries). */
export function found(payload: Record<string, unknown>): ToolOk {
  return { ...payload, ok: true, changed: false };
}

export function fail(error: ToolError, extra: { message?: string; issues?: unknown } = {}): ToolFail {
  return { ok: false, error, ...extra };
}
