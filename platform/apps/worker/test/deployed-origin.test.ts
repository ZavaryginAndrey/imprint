import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { SESSION_COOKIE, encodeSession } from "../src/auth/session";
import { acceptLive, newSub } from "./helpers";

/** The deployed dev environment: APP_ORIGIN is not set, the worker's own origin is the app. */
const HOST = "https://imprint-dev.example";
const deployedEnv = { ...env, APP_ORIGIN: undefined };
const app = createApp(async () => new Response("no network in this test", { status: 500 }));

async function cookie(): Promise<string> {
  return `${SESSION_COOKIE}=${await encodeSession(env.SESSION_SECRET ?? "", { sub: newSub(), email: null })}`;
}

describe("without APP_ORIGIN", () => {
  it("login builds redirect_uri from the request's own origin", async () => {
    const res = await app.request(`${HOST}/auth/login`, {}, deployedEnv);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("redirect_uri")).toBe(`${HOST}/auth/callback`);
  });

  it("/api/live accepts the worker's own origin and refuses a foreign one", async () => {
    const headers = { cookie: await cookie(), upgrade: "websocket" };
    const ok = await app.request(`${HOST}/api/live`, { headers: { ...headers, origin: HOST } }, deployedEnv);
    expect(ok.status).toBe(101);
    acceptLive(ok);
    ok.webSocket?.close(1000);
    const evil = await app.request(`${HOST}/api/live`, { headers: { ...headers, origin: "https://evil.example" } }, deployedEnv);
    expect(evil.status).toBe(403);
  });

  it("POST /api/tools/:name accepts the worker's own origin and refuses a foreign one", async () => {
    const post = (origin: string, ck: string) =>
      app.request(`${HOST}/api/tools/list_groups`, { method: "POST", headers: { cookie: ck, origin, "content-type": "application/json" }, body: "{}" }, deployedEnv);
    const ck = await cookie();
    expect((await post(HOST, ck)).status).toBe(200);
    expect((await post("https://evil.example", ck)).status).toBe(403);
  });
});
