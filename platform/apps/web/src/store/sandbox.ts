import { memoryContext, parseSettings, runTool, uuid, type BackupData, type MemoryContext, type ToolResult } from "@imprint/domain";
import type { Snapshot } from "../platform/api";

/** A call as the queue keeps it: what ran and which ids it handed out (ADR 011). */
export interface Call {
  name: string;
  input: unknown;
  ids: string[];
}

export interface Sandbox {
  ctx: MemoryContext;
  /** Run a tool; `ids` are handed out first (a replay), fresh UUIDs after. Returns every id it used. */
  run(name: string, input: unknown, ids?: readonly string[]): { result: ToolResult; ids: string[] };
}

/** The v1 device `Settings` a backup file carries; merging ignores them (decision №25). */
const NO_DEVICE_SETTINGS = {} as BackupData["settings"];

const backup = (s: Snapshot): BackupData => ({ version: 1, tasks: s.tasks, groups: s.groups, events: s.events, settings: NO_DEVICE_SETTINGS });

/** The server's last state with `calls` replayed on top — the optimistic world the UI shows (ADR 003). */
export function sandbox(base: Snapshot | null, clock: () => number, calls: readonly Call[] = []): Sandbox {
  let next: () => string = uuid;
  const ctx = memoryContext({
    peers: base ? [backup(base)] : [],
    clock,
    settings: parseSettings(base?.settings ?? {}),
    ids: () => next(),
  });

  const run: Sandbox["run"] = (name, input, given = []) => {
    const feed = [...given];
    const used: string[] = [];
    next = () => {
      const id = feed.shift() ?? uuid();
      used.push(id);
      return id;
    };
    try {
      const result = runTool(ctx, name, input);
      return { result, ids: result.ok && result.changed ? used : [] };
    } finally {
      next = uuid;
    }
  };

  for (const c of calls) run(c.name, c.input, c.ids);
  return { ctx, run };
}
