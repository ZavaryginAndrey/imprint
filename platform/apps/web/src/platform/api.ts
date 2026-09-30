import type { Group, Task, TaskEvent, ToolResult } from "@imprint/domain";
import { fetchMe, type Me } from "../account";

/** The server over HTTP (W2 API). Nothing throws: every outcome is data. */

export interface Snapshot {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
  settings: Record<string, unknown>;
  rev: number;
  epoch: string;
}
export type CallOutcome = { kind: "done"; result: ToolResult; rev: number } | { kind: "network" } | { kind: "unauthorized" };
export type StateOutcome = { kind: "ok"; snapshot: Snapshot } | { kind: "network" } | { kind: "unauthorized" };

export interface Api {
  me(): Promise<Me>;
  state(): Promise<StateOutcome>;
  /** `ids`: what the optimistic run handed out (ADR 011) — the server reuses them and spots a retry by them. */
  call(name: string, input: unknown, opts: { conn: string; ids: readonly string[] }): Promise<CallOutcome>;
  logout(): Promise<void>;
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export function isSnapshot(v: unknown): v is Snapshot {
  const s = v as Partial<Snapshot> | null;
  return (
    !!s &&
    Array.isArray(s.tasks) &&
    Array.isArray(s.groups) &&
    Array.isArray(s.events) &&
    typeof s.settings === "object" &&
    s.settings !== null &&
    typeof s.rev === "number" &&
    typeof s.epoch === "string"
  );
}

async function send(fetchImpl: FetchImpl, url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const r = await fetchImpl(url, init);
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      // not JSON
    }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export function httpApi(fetchImpl: FetchImpl = (u, i) => fetch(u, i)): Api {
  return {
    me: () => fetchMe(fetchImpl),

    async state() {
      const { status, body } = await send(fetchImpl, "/api/state");
      if (status === 401) return { kind: "unauthorized" };
      return status === 200 && isSnapshot(body) ? { kind: "ok", snapshot: body } : { kind: "network" };
    },

    async call(name, input, { conn, ids }) {
      const headers: Record<string, string> = { "content-type": "application/json", "x-imprint-conn": conn };
      if (ids.length > 0) headers["x-imprint-ids"] = ids.join(",");
      const init = { method: "POST", headers, body: JSON.stringify(input ?? {}) };
      const { status, body } = await send(fetchImpl, `/api/tools/${encodeURIComponent(name)}`, init);
      if (status === 401) return { kind: "unauthorized" };
      if (status === 0 || status >= 500) return { kind: "network" };
      const b = body as { result?: ToolResult; rev?: number; error?: string } | null;
      if (status === 200 && b?.result && typeof b.rev === "number") return { kind: "done", result: b.result, rev: b.rev };
      return { kind: "done", result: { ok: false, error: "invalid_input", message: b?.error ?? `http ${status}` }, rev: -1 };
    },

    async logout() {
      await send(fetchImpl, "/auth/logout", { method: "POST" });
    },
  };
}
