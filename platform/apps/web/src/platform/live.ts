import { parseLive } from "../account";

/**
 * `/api/live`: the server tells this tab another one wrote. Reconnects with backoff (the socket drops on
 * deploys and object evictions — W2 risk); a ping keeps idle proxies from closing it.
 */
export interface LiveHandlers {
  /** Connected (again): re-read the state, pushes may have been missed. */
  open(): void;
  changed(rev: number): void;
  /** Closed with 4001: the account was deleted (on this or another device). */
  deleted(): void;
}
export interface LiveOptions {
  socket?: (url: string) => WebSocket;
  wait?: (ms: number) => Promise<void>;
}

const ACCOUNT_DELETED = 4001;
const PING_MS = 30_000;
const FIRST_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export function connectLive(url: string, h: LiveHandlers, opts: LiveOptions = {}): { close(): void } {
  const socket = opts.socket ?? ((u) => new WebSocket(u));
  const wait = opts.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let closed = false;
  let backoff = FIRST_BACKOFF_MS;
  let ws: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    if (closed) return;
    const s = socket(url);
    ws = s;
    s.onopen = () => {
      backoff = FIRST_BACKOFF_MS;
      ping = setInterval(() => s.send("ping"), PING_MS);
      h.open();
    };
    s.onmessage = (e) => {
      const rev = parseLive(e.data);
      if (rev !== null) h.changed(rev);
    };
    s.onclose = (e) => {
      if (ping) clearInterval(ping);
      ping = null;
      if (e.code === ACCOUNT_DELETED) h.deleted();
      if (closed) return;
      const delay = backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      void wait(delay).then(connect);
    };
  };

  connect();
  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}
