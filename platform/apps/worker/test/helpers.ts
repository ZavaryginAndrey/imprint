import { SELF, env, runInDurableObject } from "cloudflare:test";
import type { Group, Task, TaskEvent } from "@imprint/domain";
import { SESSION_COOKIE, encodeSession } from "../src/auth/session";
import type { UserStore } from "../src/userStore";

export const BASE = "https://imprint.test";
/** 2026-09-28 12:00 UTC — the pinned wall clock for store tests. */
export const NOON_UTC = Date.UTC(2026, 8, 28, 12, 0, 0);

/** Storage is shared across tests (isolatedStorage is off): every test takes fresh ids. */
export function freshStub() {
  return env.USER_STORE.get(env.USER_STORE.newUniqueId());
}

export function newSub(): string {
  return `test-${crypto.randomUUID()}`;
}

/** Run against the SQLite storage of a brand-new object. */
export async function withStorage(fn: (storage: DurableObjectStorage) => void | Promise<void>): Promise<void> {
  await runInDurableObject(freshStub(), (_instance: UserStore, state: DurableObjectState) => fn(state.storage));
}

export function sampleTask(p: Partial<Task> = {}): Task {
  return {
    id: "t1", title: "Task", location: "BACKLOG", dueDate: null, startDate: null, groupId: null,
    isRepeating: false, recurrenceMask: 0, priority: 0, parentId: null, position: 0,
    createdAt: 1, enteredDayAt: null, updatedAt: 1, deletedAt: null, ...p,
  };
}

export function sampleGroup(p: Partial<Group> = {}): Group {
  return { id: "g1", name: "Group", position: 0, isCollapsed: false, color: 0, createdAt: 1, updatedAt: 1, deletedAt: null, ...p };
}

export function sampleEvent(p: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: "e1", taskId: "t1", type: "CREATED", at: 1, dayKey: "2026-09-28", title: "Task", groupId: null,
    isRepeating: false, surface: null, deviceId: "server", ...p,
  };
}

export interface Live {
  /** The next push, parsed. */
  next(): Promise<unknown>;
  /** Resolves with the close code. */
  closed: Promise<number>;
}

/** Accept the client end of a 101 response and queue its messages. */
export function acceptLive(res: Response): Live {
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a websocket, got ${res.status}`);
  ws.accept();
  const inbox: unknown[] = [];
  const waiters: ((m: unknown) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m: unknown = JSON.parse(String(e.data));
    const waiter = waiters.shift();
    if (waiter) waiter(m);
    else inbox.push(m);
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  return {
    next: () => (inbox.length > 0 ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiters.push(resolve))),
    closed,
  };
}

export async function openLive(stub: { fetch(input: string, init?: RequestInit): Promise<Response> }, conn: string): Promise<Live> {
  return acceptLive(await stub.fetch(`https://do/live?conn=${conn}`, { headers: { Upgrade: "websocket" } }));
}

/** A `Cookie` header value carrying a valid session for `sub`. */
export async function sessionCookie(sub: string, secret: string = env.SESSION_SECRET ?? ""): Promise<string> {
  return `${SESSION_COOKIE}=${await encodeSession(secret, { sub, email: `${sub}@example.test` })}`;
}

export function api(path: string, cookie: string | null, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  return SELF.fetch(`${BASE}${path}`, { ...init, headers });
}

export function postTool(name: string, cookie: string | null, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return api(`/api/tools/${name}`, cookie, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
