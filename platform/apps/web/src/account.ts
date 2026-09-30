/**
 * W2 dev probe: who is signed in, the server's task count + rev, and the live channel. W4 replaces
 * this with the real store (optimistic `runTool`, ADR 003). Nothing here throws.
 */

export type Me = { kind: "in"; sub: string; email: string | null } | { kind: "out" } | { kind: "down" };
export interface Snapshot {
  tasks: number;
  rev: number;
}
type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchImpl = (url, init) => fetch(url, init);

async function json(fetchImpl: FetchImpl, url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const r = await fetchImpl(url, init);
    return { status: r.status, body: r.ok ? ((await r.json()) as unknown) : null };
  } catch {
    return { status: 0, body: null };
  }
}

const record = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

export async function fetchMe(fetchImpl: FetchImpl = defaultFetch): Promise<Me> {
  const { status, body } = await json(fetchImpl, "/api/me");
  if (status === 401) return { kind: "out" };
  const b = record(body);
  if (!b || typeof b.sub !== "string") return { kind: "down" };
  return { kind: "in", sub: b.sub, email: typeof b.email === "string" ? b.email : null };
}

export async function fetchSnapshot(fetchImpl: FetchImpl = defaultFetch): Promise<Snapshot | null> {
  const b = record((await json(fetchImpl, "/api/state")).body);
  if (!b || !Array.isArray(b.tasks) || typeof b.rev !== "number") return null;
  return { tasks: b.tasks.filter((t) => record(t)?.deletedAt == null).length, rev: b.rev };
}

export async function addProbeTask(conn: string, fetchImpl: FetchImpl = defaultFetch): Promise<number | null> {
  const b = record(
    (
      await json(fetchImpl, "/api/tools/add_task", {
        method: "POST",
        headers: { "content-type": "application/json", "x-imprint-conn": conn },
        body: JSON.stringify({ title: `Проба ${new Date().toLocaleTimeString()}`, where: "backlog" }),
      })
    ).body,
  );
  return b && typeof b.rev === "number" ? b.rev : null;
}

export function liveUrl(loc: { protocol: string; host: string }, conn: string): string {
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/api/live?conn=${encodeURIComponent(conn)}`;
}

/** The rev of a `{ changed: true, rev }` push; null for anything else (e.g. "pong"). */
export function parseLive(data: unknown): number | null {
  if (typeof data !== "string") return null;
  try {
    const m = record(JSON.parse(data));
    return m && m.changed === true && typeof m.rev === "number" ? m.rev : null;
  } catch {
    return null;
  }
}
