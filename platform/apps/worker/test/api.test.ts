import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SEC, encodeSession, nowSec } from "../src/auth/session";
import { signToken } from "../src/auth/token";
import { BASE, acceptLive, api, newSub, postTool, sessionCookie } from "./helpers";

type Call = { result: Record<string, unknown>; rev: number };
type State = { tasks: { id: string; title: string }[]; rev: number };
const ADD = { title: "Buy milk", where: "backlog" };

describe("API without a valid session", () => {
  const routes: [string, RequestInit][] = [
    ["/api/me", {}],
    ["/api/state", {}],
    ["/api/tools/list_day", { method: "POST", body: "{}" }],
    ["/api/account", { method: "DELETE" }],
    ["/api/live", { headers: { Upgrade: "websocket" } }],
  ];

  it("every user route is 401 without a cookie", async () => {
    for (const [path, init] of routes) {
      const r = await api(path, null, init);
      expect(r.status, path).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("a cookie from another secret, an expired one or a login cookie is 401", async () => {
    const sub = newSub();
    const cookies = [
      await sessionCookie(sub, "some-other-secret"),
      `imprint_session=${await encodeSession(env.SESSION_SECRET ?? "", { sub, email: null }, nowSec() - SESSION_TTL_SEC - 1)}`,
      `imprint_session=${await signToken(env.SESSION_SECRET ?? "", { kind: "oauth", sub, exp: nowSec() + 600 })}`,
      "imprint_session=garbage",
    ];
    for (const cookie of cookies) expect((await api("/api/state", cookie)).status).toBe(401);
  });
});

describe("tools over HTTP", () => {
  it("/api/me names the session's user", async () => {
    const sub = newSub();
    expect(await (await api("/api/me", await sessionCookie(sub))).json()).toEqual({ sub, email: `${sub}@example.test` });
  });

  it("a changing call answers { result, rev } and state shows it; rev grows by 1 per change only", async () => {
    const cookie = await sessionCookie(newSub());
    const add = await (await postTool("add_task", cookie, ADD)).json<Call>();
    expect(add).toMatchObject({ result: { ok: true, changed: true }, rev: 1 });
    const taskId = (add.result.task as { id: string }).id;

    const same = await (await postTool("rename_task", cookie, { taskId, title: "Buy milk" })).json<Call>();
    expect(same).toMatchObject({ result: { ok: true, changed: false, reason: "same_value" }, rev: 1 });

    const rename = await (await postTool("rename_task", cookie, { taskId, title: "Buy oat milk" })).json<Call>();
    expect(rename.rev).toBe(2);

    const state = await (await api("/api/state", cookie)).json<State>();
    expect(state.rev).toBe(2);
    expect(state.tasks.map((t) => t.title)).toEqual(["Buy oat milk"]);
  });

  it("rule and input errors are 200 ToolResults", async () => {
    const cookie = await sessionCookie(newSub());
    const unknown = await postTool("no_such_tool", cookie, {});
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ result: { ok: false, error: "unknown_tool" }, rev: 0 });
    const invalid = await (await postTool("add_task", cookie, { title: "  ", where: "day" })).json<Call>();
    expect(invalid.result).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("an empty body is input {}; invalid JSON is 400; a body over 64 KiB is 413", async () => {
    const cookie = await sessionCookie(newSub());
    const empty = await postTool("list_groups", cookie, "");
    expect(await empty.json()).toMatchObject({ result: { ok: true, groups: [] } });
    const broken = await postTool("add_task", cookie, "{not json");
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "invalid_json" });
    const huge = await postTool("add_task", cookie, { title: "x".repeat(70_000), where: "day" });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: "too_large" });
  });

  it("isolation: user A's session never reads or writes user B's rows", async () => {
    const a = await sessionCookie(newSub());
    const b = await sessionCookie(newSub());
    const add = await (await postTool("add_task", b, { title: "B's secret", where: "day" })).json<Call>();
    const bTaskId = (add.result.task as { id: string }).id;

    const aState = await (await api("/api/state", a)).json<State>();
    expect(aState).toMatchObject({ tasks: [], rev: 0 });
    const aRename = await (await postTool("rename_task", a, { taskId: bTaskId, title: "hijacked" })).json<Call>();
    expect(aRename.result).toMatchObject({ ok: false, error: "not_found" });
    const bState = await (await api("/api/state", b)).json<State>();
    expect(bState.tasks.map((t) => t.title)).toEqual(["B's secret"]);
  });
});

describe("live channel and account", () => {
  it("another tab's socket gets { changed, rev } after a tool call", async () => {
    const cookie = await sessionCookie(newSub());
    const tab = acceptLive(await api("/api/live?conn=tab1", cookie, { headers: { Upgrade: "websocket", Origin: BASE } }));
    await postTool("add_task", cookie, ADD, { "x-imprint-conn": "tab2" });
    expect(await tab.next()).toEqual({ changed: true, rev: 1 });
  });

  it("a cross-site Origin is 403; a plain GET is 426", async () => {
    const cookie = await sessionCookie(newSub());
    const evil = await api("/api/live", cookie, { headers: { Upgrade: "websocket", Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    expect((await api("/api/live", cookie)).status).toBe(426);
  });

  it("DELETE /api/account wipes the user's data and clears the session cookie", async () => {
    const cookie = await sessionCookie(newSub());
    await postTool("add_task", cookie, ADD);
    const del = await api("/api/account", cookie, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });
    // workers-types omits Headers.getSetCookie; workerd has it.
    const setCookies = (del.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
    expect(setCookies.some((c) => c.startsWith("imprint_session=;") && /Max-Age=0/i.test(c))).toBe(true);
    expect(await (await api("/api/state", cookie)).json()).toMatchObject({ tasks: [], rev: 0 });
  });
});
