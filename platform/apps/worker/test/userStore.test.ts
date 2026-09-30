import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETED } from "../src/userStore";
import { newSub, openLive } from "./helpers";

const storeFor = (sub: string) => env.USER_STORE.get(env.USER_STORE.idFromName(sub));
const ADD = { title: "Buy milk", where: "backlog" };

describe("UserStore", () => {
  it("a tool call persists for its user; another user's object stays empty", async () => {
    const a = storeFor(newSub());
    const b = storeFor(newSub());
    const call = await a.callTool("add_task", ADD);
    expect(call).toMatchObject({ result: { ok: true, changed: true }, rev: 1 });
    expect((await a.getState()).tasks.map((t) => t.title)).toEqual(["Buy milk"]);
    expect(await b.getState()).toMatchObject({ tasks: [], groups: [], events: [], settings: {}, rev: 0 });
  });

  it("a committed call notifies the user's other connections, not the caller's", async () => {
    const s = storeFor(newSub());
    const tabA = await openLive(s, "tab-a");
    const tabB = await openLive(s, "tab-b");
    await s.callTool("add_task", ADD, "tab-a");
    expect(await tabB.next()).toEqual({ changed: true, rev: 1 });
    await s.callTool("add_task", ADD, "tab-b");
    expect(await tabA.next()).toEqual({ changed: true, rev: 2 }); // tab-a never got rev 1
  });

  it("a call that changes nothing notifies nobody", async () => {
    const s = storeFor(newSub());
    const tab = await openLive(s, "tab");
    await s.callTool("list_groups", {});
    await s.callTool("add_task", ADD);
    expect(await tab.next()).toEqual({ changed: true, rev: 1 });
  });

  it("deleteAccount closes live sockets and wipes the object; the next call starts clean", async () => {
    const s = storeFor(newSub());
    await s.callTool("add_task", ADD);
    const tab = await openLive(s, "tab");
    await s.deleteAccount();
    expect(await tab.closed).toBe(ACCOUNT_DELETED);
    expect(await s.getState()).toMatchObject({ tasks: [], events: [], rev: 0 });
    expect((await s.callTool("add_task", ADD)).rev).toBe(1);
  });

  it("a non-upgrade fetch is 426", async () => {
    const r = await storeFor(newSub()).fetch("https://do/live");
    expect(r.status).toBe(426);
  });
});
