import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { pkceChallenge, type FetchFn } from "../src/auth/google";
import { nowSec } from "../src/auth/session";
import { b64url } from "../src/auth/token";
import { BASE } from "./helpers";

const CLIENT = env.GOOGLE_CLIENT_ID ?? "";
const idToken = (claims: Record<string, unknown>) => ["e30", b64url(new TextEncoder().encode(JSON.stringify(claims))), "sig"].join(".");
const googleSays = (sub: string): FetchFn => async () =>
  Response.json({ id_token: idToken({ iss: "https://accounts.google.com", aud: CLIENT, sub, email: "me@example.test", email_verified: true, exp: nowSec() + 3600 }) });

/** workers-types omits Headers.getSetCookie; workerd has it. */
const setCookies = (res: Response): string[] => (res.headers as Headers & { getSetCookie(): string[] }).getSetCookie();

/** `name=value` of a Set-Cookie on the response, or null. */
function cookieFrom(res: Response, name: string): string | null {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  return line ? line.split(";")[0] : null;
}

async function startLogin(app: ReturnType<typeof createApp>) {
  const res = await app.request(`${BASE}/auth/login`, {}, env);
  const location = new URL(res.headers.get("location") ?? "");
  return { res, location, state: location.searchParams.get("state") ?? "", oauth: cookieFrom(res, "imprint_oauth") ?? "" };
}

const callback = (app: ReturnType<typeof createApp>, query: string, cookie: string) =>
  app.request(`${BASE}/auth/callback?${query}`, { headers: { cookie } }, env);

describe("Google sign-in", () => {
  it("login redirects to Google with PKCE S256 and sets a short-lived login cookie", async () => {
    const { res, location } = await startLogin(createApp(googleSays("x")));
    expect(res.status).toBe(302);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe(CLIENT);
    expect(location.searchParams.get("redirect_uri")).toBe(`${BASE}/auth/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const line = setCookies(res).find((c) => c.startsWith("imprint_oauth=")) ?? "";
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/Secure/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\/auth/i);
    expect(line).toMatch(/Max-Age=600/i);
  });

  it("callback exchanges the code with the matching verifier, sets the session and lands on /", async () => {
    let body = new URLSearchParams();
    const app = createApp(async (url, init) => {
      body = new URLSearchParams(String(init.body));
      return googleSays("g-123")(url, init);
    });
    const { location, state, oauth } = await startLogin(app);
    const res = await callback(app, `code=abc&state=${state}`, oauth);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/`);
    expect(body.get("code")).toBe("abc");
    expect(await pkceChallenge(body.get("code_verifier") ?? "")).toBe(location.searchParams.get("code_challenge"));

    const line = setCookies(res).find((c) => c.startsWith("imprint_session=")) ?? "";
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/Secure/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
    const me = await app.request(`${BASE}/api/me`, { headers: { cookie: cookieFrom(res, "imprint_session") ?? "" } }, env);
    expect(await me.json()).toEqual({ sub: "g-123", email: "me@example.test" });
  });

  it("a mismatched state fails without calling Google", async () => {
    let called = false;
    const app = createApp(async (url, init) => {
      called = true;
      return googleSays("x")(url, init);
    });
    const { oauth } = await startLogin(app);
    const res = await callback(app, "code=abc&state=forged", oauth);
    expect(res.headers.get("location")).toBe(`${BASE}/?login=failed`);
    expect(cookieFrom(res, "imprint_session")).toBeNull();
    expect(called).toBe(false);
  });

  it("a missing login cookie, a Google error, a token failure or a foreign id_token all fail cleanly", async () => {
    const cases: [FetchFn, (s: string, oauth: string) => [string, string]][] = [
      [googleSays("x"), (s) => [`code=abc&state=${s}`, ""]],
      [googleSays("x"), (s, o) => [`error=access_denied&state=${s}`, o]],
      [async () => Response.json({ error: "invalid_grant" }, { status: 400 }), (s, o) => [`code=abc&state=${s}`, o]],
      [async () => { throw new TypeError("network down"); }, (s, o) => [`code=abc&state=${s}`, o]],
      [async () => Response.json({ id_token: idToken({ iss: "https://accounts.google.com", aud: "other", sub: "x", exp: nowSec() + 60 }) }), (s, o) => [`code=abc&state=${s}`, o]],
    ];
    for (const [fetchFn, request] of cases) {
      const app = createApp(fetchFn);
      const { state, oauth } = await startLogin(app);
      const [query, cookie] = request(state, oauth);
      const res = await callback(app, query, cookie);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(`${BASE}/?login=failed`);
      expect(cookieFrom(res, "imprint_session")).toBeNull();
    }
  });

  it("logout clears the session cookie", async () => {
    const res = await createApp(googleSays("x")).request(`${BASE}/auth/logout`, { method: "POST" }, env);
    expect(await res.json()).toEqual({ ok: true });
    expect(setCookies(res).some((c) => c.startsWith("imprint_session=;") && /Max-Age=0/i.test(c))).toBe(true);
  });

  it("without Google secrets, login is 500 auth_not_configured", async () => {
    const res = await createApp(googleSays("x")).request(`${BASE}/auth/login`, {}, { ...env, GOOGLE_CLIENT_SECRET: undefined });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "auth_not_configured" });
  });
});
