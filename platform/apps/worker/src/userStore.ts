import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { SqlStore, type StateSnapshot, type ToolCall } from "./store/sqlStore";
import { generateWithGemini } from "./tools/gemini";
import { findServerTool, runServerTool, type ServerDeps } from "./tools/index";
import { metaQuota } from "./tools/quota";

/** Close code a tab sees when the account is deleted. */
export const ACCOUNT_DELETED = 4001;

const CONN = /^[A-Za-z0-9_-]{1,64}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a recursive JSON type overflows the RPC type instantiation depth
type Json = any;

/**
 * `T` with every `unknown` (tool payloads, settings) narrowed to JSON. workers-types resolves an RPC
 * result to `never` when it contains `unknown`; the values are plain JSON at runtime anyway.
 */
export type Wire<T> = unknown extends T
  ? Json
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/** A tab's connection id, or null when absent or malformed. */
export function validConn(conn: string | null | undefined): string | null {
  return conn && CONN.test(conn) ? conn : null;
}

/**
 * One Durable Object per user (`idFromName(Google sub)`, ADR 001). Requests are serialised by the
 * object, so tool calls never race. Other tabs learn about a commit over a hibernatable WebSocket.
 */
export class UserStore extends DurableObject<Env> {
  private sqlStore?: SqlStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** Loaded on first use (migrations + rows); dropped by `deleteAccount`. */
  private get store(): SqlStore {
    this.sqlStore ??= new SqlStore(this.ctx.storage);
    return this.sqlStore;
  }

  /** `ids`: the tab's preview ids (`x-imprint-ids`, ADR 011); server tools create no rows and ignore them. */
  async callTool(name: string, input: unknown, conn?: string | null, ids: string[] = []): Promise<Wire<ToolCall>> {
    const server = findServerTool(name);
    if (server) {
      // Server tools write no rows: no commit, no broadcast (ADR 009).
      const result = await runServerTool(this.serverDeps(), server, input);
      return { result, rev: this.store.revision } as Wire<ToolCall>;
    }
    const { result, rev, committed } = this.store.execute(name, input, undefined, ids);
    if (committed) this.broadcast(rev, validConn(conn));
    return { result, rev } as Wire<ToolCall>;
  }

  async getState(): Promise<Wire<StateSnapshot>> {
    return this.store.snapshot() as Wire<StateSnapshot>;
  }

  async deleteAccount(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(ACCOUNT_DELETED, "account_deleted");
      } catch {
        // already closing
      }
    }
    await this.ctx.storage.deleteAll();
    this.sqlStore = undefined;
  }

  /** `GET /api/live` upgrade (the worker checked the session): a socket tagged with the tab's id. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const conn = validConn(new URL(request.url).searchParams.get("conn"));
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, conn ? [conn] : []);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The channel is server → client; anything a tab sends (besides the auto-answered ping) is ignored. */
  async webSocketMessage(): Promise<void> {
    // no-op
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  private serverDeps(): ServerDeps {
    const key = this.env.GEMINI_API_KEY;
    return {
      state: () => this.store.view().state,
      settings: () => this.store.view().settings,
      today: () => this.store.view().today,
      quota: metaQuota(this.ctx.storage),
      generate: key ? (prompt) => generateWithGemini(key, prompt) : null,
    };
  }

  private broadcast(rev: number, conn: string | null): void {
    const message = JSON.stringify({ changed: true, rev });
    for (const ws of this.ctx.getWebSockets()) {
      if (conn && this.ctx.getTags(ws).includes(conn)) continue;
      try {
        ws.send(message);
      } catch {
        // a closing socket; that tab re-reads state when it reconnects
      }
    }
  }
}
