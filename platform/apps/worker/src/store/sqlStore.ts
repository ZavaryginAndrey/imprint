import {
  ALL_TOOLS, addDays, journalTail, logicalDayKey, monotonicClock, parseSettings, runTool,
  type Group, type MergedState, type Task, type TaskEvent, type ToolContext, type ToolDef, type ToolResult, type UserSettings,
} from "@imprint/domain";
import { insertEvent, loadRows, loadTail, readSettings, writeGroup, writeSettings, writeTask } from "./rows";
import { migrate, readMeta, writeMeta } from "./schema";

/** Days of journal the state carries — what the Day/history projections read (W2 spec). */
export const EVENT_WINDOW_DAYS = 35;
/** `deviceId` on events written by server-run tools. */
export const SERVER_DEVICE_ID = "server";

export interface ToolCall {
  result: ToolResult;
  rev: number;
}

export interface StateSnapshot {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
  settings: Record<string, unknown>;
  rev: number;
  /** This object's history id: a deleted account starts again at rev 0 under a new epoch (W4 spec §2). */
  epoch: string;
}

export interface SqlStoreOptions {
  /** Wall clock, epoch ms. Tests pin it. */
  read?: () => number;
}

interface Pending {
  tasks: Map<string, Task>;
  groups: Map<string, Group>;
  events: Map<string, TaskEvent>;
  settings: UserSettings | null;
}

function overlay<T>(base: Map<string, T>, over: Map<string, T>): T[] {
  if (over.size === 0) return [...base.values()];
  const all = new Map(base);
  for (const [id, row] of over) all.set(id, row);
  return [...all.values()];
}

/**
 * The user's rows behind a `ToolContext` (W2 §A). Reads come from memory, loaded from SQLite when the
 * object wakes; a tool's writes go to a pending buffer that commits in one `transactionSync` together
 * with `meta.rev + 1`. A failing or throwing tool, or a failed commit, leaves SQLite and memory as
 * they were.
 */
export class SqlStore {
  private readonly read: () => number;
  private readonly now: () => number;
  private readonly tasks = new Map<string, Task>();
  private readonly groups = new Map<string, Group>();
  private readonly events = new Map<string, TaskEvent>();
  private settings: UserSettings;
  private rev: number;
  private readonly epoch: string;

  constructor(
    private readonly storage: DurableObjectStorage,
    opts: SqlStoreOptions = {},
  ) {
    this.read = opts.read ?? (() => Date.now());
    this.now = monotonicClock(this.read);
    migrate(storage);
    this.settings = parseSettings(readSettings(storage.sql));
    this.rev = Number(readMeta(storage.sql, "rev") ?? 0);
    // Created once; `deleteAll` wipes meta, so a deleted account's next load mints a new one.
    const epoch = readMeta(storage.sql, "epoch");
    this.epoch = epoch ?? crypto.randomUUID();
    if (epoch === null) writeMeta(storage.sql, "epoch", this.epoch);
    const since = this.windowStart();
    const rows = loadRows(storage.sql, since);
    for (const t of rows.tasks) this.tasks.set(t.id, t);
    for (const g of rows.groups) this.groups.set(g.id, g);
    for (const e of [...rows.events, ...loadTail(storage.sql, since)]) this.events.set(e.id, e);
  }

  /**
   * Run a tool in one transaction. `ids` (from `x-imprint-ids`) are handed out first; when one of them
   * already exists the call ran before — a retry after a lost answer — and nothing runs again (ADR 011).
   */
  execute(name: string, input: unknown, tools: readonly ToolDef[] = ALL_TOOLS, ids: readonly string[] = []): ToolCall & { committed: boolean } {
    if (ids.some((id) => this.tasks.has(id) || this.groups.has(id) || this.events.has(id))) {
      return { result: { ok: true, changed: false, reason: "replayed" }, rev: this.rev, committed: false };
    }
    const pending: Pending = { tasks: new Map(), groups: new Map(), events: new Map(), settings: null };
    const result = runTool(this.context(pending, [...ids]), name, input, tools);
    const wrote = pending.tasks.size + pending.groups.size + pending.events.size > 0 || pending.settings !== null;
    if (!result.ok || !wrote) return { result, rev: this.rev, committed: false };

    const rev = this.rev + 1;
    try {
      this.storage.transactionSync(() => {
        const sql = this.storage.sql;
        for (const t of pending.tasks.values()) writeTask(sql, t);
        for (const g of pending.groups.values()) writeGroup(sql, g);
        for (const e of pending.events.values()) insertEvent(sql, e);
        if (pending.settings) writeSettings(sql, pending.settings);
        writeMeta(sql, "rev", String(rev));
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { result: { ok: false, error: "storage", message }, rev: this.rev, committed: false };
    }
    for (const [id, t] of pending.tasks) this.tasks.set(id, t);
    for (const [id, g] of pending.groups) this.groups.set(id, g);
    for (const [id, e] of pending.events) this.events.set(id, e);
    if (pending.settings) this.settings = pending.settings;
    this.rev = rev;
    return { result, rev, committed: true };
  }

  /** `GET /api/state`: every task and group (tombstones kept), the event window plus the journal tail, settings as stored, rev. */
  snapshot(): StateSnapshot {
    const since = this.windowStart();
    const events = [...this.events.values()];
    return {
      tasks: [...this.tasks.values()],
      groups: [...this.groups.values()],
      events: [...events.filter((e) => e.dayKey >= since), ...journalTail(events, since)],
      settings: readSettings(this.storage.sql),
      rev: this.rev,
      epoch: this.epoch,
    };
  }

  /** The committed state, settings and today — what server tools read (ADR 009). */
  view(): { state: MergedState; settings: UserSettings; today: string } {
    return {
      state: { tasks: [...this.tasks.values()], groups: [...this.groups.values()], events: [...this.events.values()], sourceCount: 1 },
      settings: this.settings,
      today: this.todayKey(),
    };
  }

  get revision(): number {
    return this.rev;
  }

  /** The user's logical day now (P5): their zone and reset time, never the runtime's zone. */
  private todayKey(settings: UserSettings = this.settings): string {
    return logicalDayKey(this.read(), settings);
  }

  private windowStart(): string {
    return addDays(this.todayKey(), -(EVENT_WINDOW_DAYS - 1));
  }

  private context(p: Pending, ids: string[]): ToolContext {
    return {
      deviceId: SERVER_DEVICE_ID,
      state: (): MergedState => ({
        tasks: overlay(this.tasks, p.tasks),
        groups: overlay(this.groups, p.groups),
        events: [...this.events.values(), ...p.events.values()],
        sourceCount: 1,
      }),
      upsertTask: (t) => void p.tasks.set(t.id, t),
      upsertGroup: (g) => void p.groups.set(g.id, g),
      appendEvent: (e) => {
        if (!this.events.has(e.id) && !p.events.has(e.id)) p.events.set(e.id, e);
      },
      now: () => this.now(),
      todayKey: () => this.todayKey(p.settings ?? this.settings),
      settings: () => p.settings ?? this.settings,
      putSettings: (s) => {
        p.settings = s;
      },
      newId: () => ids.shift() ?? crypto.randomUUID(),
    };
  }
}
