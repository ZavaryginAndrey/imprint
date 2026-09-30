import type { ToolResult } from "@imprint/domain";
import type { Api, Snapshot } from "../platform/api";
import type { LiveHandlers } from "../platform/live";
import { forgetUser, lastUser, readCache, writeCache } from "./cache";
import { OFFLINE_AFTER_MS, backoff, type Acked, type Pending } from "./queue";
import { sandbox, type Sandbox } from "./sandbox";
import { msUntilNextDay, project, type View } from "./view";

export type Auth = "unknown" | "in" | "out" | "down";
export interface Toast {
  id: number;
  text: "deleted" | "groupDeleted" | "notSaved";
  /** Undo or retry: a call the toast's button runs. */
  action?: { name: string; input: unknown };
}
export interface StoreState {
  auth: Auth;
  sub: string | null;
  email: string | null;
  view: View | null;
  /** The server's state has arrived at least once (until then the view may be the read cache). */
  synced: boolean;
  /** Calls the server has not confirmed yet — the page asks before it is closed while any wait. */
  pending: number;
  online: boolean;
  toasts: Toast[];
  /** The task just added: its row glows for a moment. */
  fresh: string | null;
}
export interface StoreDeps {
  api: Api;
  clock: () => number;
  /** This tab's id: its own writes are not pushed back to it. */
  conn: string;
  wait(ms: number): Promise<void>;
  storage: Storage | null;
  live: (h: LiveHandlers) => { close(): void };
  offlineAfterMs?: number;
}

const TOAST_MS = 5000;
const FRESH_MS = 1100;

/**
 * The page's one source of state (W4 spec §2): the server's last snapshot, calls it confirmed whose state
 * has not arrived yet (acked) and calls still waiting (pending). The view is all three replayed through
 * the domain — an action shows before the server answers (P3), and nothing here knows a product rule (P1).
 */
export class Store {
  private s: StoreState = { auth: "unknown", sub: null, email: null, view: null, synced: false, pending: 0, online: true, toasts: [], fresh: null };
  private readonly subs = new Set<() => void>();
  private base: Snapshot | null = null;
  private acked: Acked[] = [];
  private pending: Pending[] = [];
  private box: Sandbox | null = null;
  private sending = false;
  /** A write landed or a push announced one: re-read the state once the queue is empty. */
  private stale = false;
  private toastSeq = 0;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private dayTimer: ReturnType<typeof setTimeout> | null = null;
  private live: { close(): void } | null = null;
  private gen = 0;

  constructor(private readonly d: StoreDeps) {}

  getState = (): StoreState => this.s;

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  };

  /** Sign-in check, cache, state, live. A `stop()` meanwhile (React StrictMode) abandons this run. */
  async start(): Promise<void> {
    const gen = ++this.gen;
    const me = await this.d.api.me();
    if (gen !== this.gen) return;
    if (me.kind === "out") return this.set({ auth: "out" });
    if (me.kind === "down") {
      // Out of reach: the last user's cached state, read-only in spirit; the socket retries and re-reads.
      const last = lastUser(this.d.storage);
      const cached = last ? readCache(this.d.storage, last) : null;
      if (!last || !cached) return this.set({ auth: "down" });
      this.set({ auth: "in", sub: last });
      this.accept(cached);
      this.markOffline();
    } else {
      this.set({ auth: "in", sub: me.sub, email: me.email });
      const cached = readCache(this.d.storage, me.sub);
      if (cached) this.accept(cached);
      await this.fetchState();
      if (gen !== this.gen) return;
    }
    this.live = this.d.live({
      open: () => void this.fetchState(),
      changed: (rev) => {
        if (rev > this.seenRev()) this.requestState();
      },
      deleted: () => {
        this.pending = [];
        this.acked = [];
        this.requestState();
      },
    });
  }

  /** Run a tool now on the optimistic world and queue it for the server. Returns the local result. */
  run(name: string, input: unknown): ToolResult {
    const { result, ids } = (this.box ?? this.rebuildBox()).run(name, input);
    if (!result.ok) {
      this.toast({ text: "notSaved", action: { name, input } });
      this.rebuild(); // a refused tool may have written before it refused
      return result;
    }
    if (!result.changed) return result;
    this.pending.push({ name, input, ids, retried: false });
    this.publish();
    void this.pump();
    return result;
  }

  /**
   * A server tool (ADR 009: `suggest_steps`) — asked, not queued: it writes nothing, so there is no optimistic
   * run, no ids and no retry. The network or a 5xx reads as `upstream`; a lost session signs out.
   */
  async ask(name: string, input: unknown): Promise<ToolResult> {
    const out = await this.d.api.call(name, input, { conn: this.d.conn, ids: [] });
    if (out.kind === "unauthorized") {
      this.set({ auth: "out" });
      return { ok: false, error: "unavailable", message: "signed out" };
    }
    if (out.kind === "network") return { ok: false, error: "upstream", message: "network" };
    return out.result;
  }

  toast(t: Omit<Toast, "id">): void {
    const toast = { ...t, id: ++this.toastSeq };
    this.set({ toasts: [...this.s.toasts.filter((x) => x.text !== t.text), toast] });
    setTimeout(() => this.dismiss(toast.id), TOAST_MS);
  }

  dismiss(id: number): void {
    if (this.s.toasts.some((t) => t.id === id)) this.set({ toasts: this.s.toasts.filter((t) => t.id !== id) });
  }

  /** The toast's button: undo or retry. */
  act(id: number): void {
    const t = this.s.toasts.find((x) => x.id === id);
    this.dismiss(id);
    if (t?.action) this.run(t.action.name, t.action.input);
  }

  highlight(taskId: string): void {
    this.set({ fresh: taskId });
    setTimeout(() => {
      if (this.s.fresh === taskId) this.set({ fresh: null });
    }, FRESH_MS);
  }

  /** Re-project: the tab became visible again, or the logical day may have turned over. */
  refreshDay(): void {
    this.rebuild();
  }

  async logout(): Promise<void> {
    await this.d.api.logout();
    if (this.s.sub) forgetUser(this.d.storage, this.s.sub);
    this.stop();
    this.base = null;
    this.box = null;
    this.pending = [];
    this.acked = [];
    this.set({ auth: "out", view: null, synced: false, pending: 0, sub: null, email: null });
  }

  stop(): void {
    this.gen++;
    this.live?.close();
    this.live = null;
    if (this.dayTimer) clearTimeout(this.dayTimer);
    this.dayTimer = null;
  }

  // ---- the server ----

  private async pump(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    let attempt = 0;
    while (this.pending.length > 0 && this.s.auth === "in") {
      const p = this.pending[0];
      const out = await this.d.api.call(p.name, p.input, { conn: this.d.conn, ids: p.ids });
      if (this.pending[0] !== p) continue; // the queue was dropped meanwhile (new epoch, sign-out)
      if (out.kind === "unauthorized") {
        this.set({ auth: "out" });
        break;
      }
      if (out.kind === "network") {
        p.retried = true;
        this.markOffline();
        await this.d.wait(backoff(attempt++));
        continue;
      }
      attempt = 0;
      this.markOnline();
      this.pending.shift();
      this.set({ pending: this.pending.length });
      if (out.result.ok) {
        if (out.rev > this.seenRev()) this.stale = true;
        this.acked.push({ name: p.name, input: p.input, ids: p.ids, rev: out.rev });
        continue;
      }
      // A refused retry means the lost attempt already landed (ADR 011): stay quiet, re-read.
      if (p.retried) this.stale = true;
      else this.toast({ text: "notSaved", action: { name: p.name, input: p.input } });
      this.rebuild();
    }
    this.sending = false;
    if (this.stale && this.pending.length === 0) await this.fetchState();
  }

  private seenRev(): number {
    return Math.max(this.base?.rev ?? -1, ...this.acked.map((a) => a.rev));
  }

  private requestState(): void {
    this.stale = true;
    if (this.pending.length === 0) void this.fetchState();
  }

  private async fetchState(): Promise<void> {
    const out = await this.d.api.state();
    if (out.kind === "unauthorized") return this.set({ auth: "out" });
    if (out.kind === "network") return this.markOffline();
    this.markOnline();
    this.stale = false;
    this.accept(out.snapshot);
    if (!this.s.synced) this.set({ synced: true });
    // First sign-in (nothing set yet): the browser's zone and language become the user's (W3 spec).
    if (!("timezone" in out.snapshot.settings) && !this.pending.some((p) => p.name === "set_user_settings")) {
      const language = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
      this.run("set_user_settings", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language });
    }
  }

  /** A newer rev, or another epoch (the account was deleted somewhere): the state replaces what we had. */
  private accept(next: Snapshot): void {
    const newEpoch = this.base !== null && next.epoch !== this.base.epoch;
    if (!newEpoch && this.base !== null && next.rev <= this.base.rev) return;
    if (newEpoch) {
      this.pending = [];
      this.acked = [];
    }
    this.base = next;
    this.acked = this.acked.filter((a) => a.rev > next.rev);
    if (this.s.sub) writeCache(this.d.storage, this.s.sub, next);
    this.rebuild();
  }

  // ---- the view ----

  private rebuildBox(): Sandbox {
    this.box = sandbox(this.base, this.d.clock, [...this.acked, ...this.pending]);
    return this.box;
  }

  private rebuild(): void {
    this.rebuildBox();
    this.publish();
  }

  private publish(): void {
    if (!this.box || (this.base === null && this.pending.length === 0)) return;
    const view = project(this.box.ctx);
    if (this.dayTimer) clearTimeout(this.dayTimer);
    this.dayTimer = setTimeout(() => this.rebuild(), msUntilNextDay(view, this.d.clock()));
    this.set({ view, pending: this.pending.length });
  }

  private markOffline(): void {
    const after = this.d.offlineAfterMs ?? OFFLINE_AFTER_MS;
    if (!this.s.online || this.offlineTimer) return;
    if (after === 0) return this.set({ online: false });
    this.offlineTimer = setTimeout(() => this.set({ online: false }), after);
  }

  private markOnline(): void {
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
    if (!this.s.online) this.set({ online: true });
  }

  private set(patch: Partial<StoreState>): void {
    this.s = { ...this.s, ...patch };
    for (const fn of this.subs) fn();
  }
}
