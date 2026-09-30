import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { sameOrigin } from "./middleware";
import { authUrl, exchangeCode, idTokenClaims, pkceChallenge, randomToken, type FetchFn } from "./google";
import { COOKIE_OPTIONS, SESSION_COOKIE, SESSION_TTL_SEC, encodeSession, nowSec } from "./session";
import { isRecord, signToken, verifyToken } from "./token";

/** Holds `state` and the PKCE verifier between /auth/login and /auth/callback. */
export const OAUTH_COOKIE = "imprint_oauth";
const OAUTH_TTL_SEC = 600;
const OAUTH_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, path: "/auth" } as const;

interface OAuthConfig {
  secret: string;
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  redirectUri: string;
}

function config(c: Context<AppEnv>): OAuthConfig | null {
  const { SESSION_SECRET: secret, GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = c.env;
  if (!secret || !clientId || !clientSecret) return null;
  const appOrigin = c.env.APP_ORIGIN ?? new URL(c.req.url).origin;
  return { secret, clientId, clientSecret, appOrigin, redirectUri: `${appOrigin}/auth/callback` };
}

async function pendingLogin(secret: string, raw: string | undefined): Promise<{ state: string; verifier: string } | null> {
  const p = raw ? await verifyToken(secret, raw) : null;
  if (!isRecord(p) || p.kind !== "oauth" || typeof p.exp !== "number" || p.exp <= nowSec()) return null;
  return typeof p.state === "string" && typeof p.verifier === "string" ? { state: p.state, verifier: p.verifier } : null;
}

/** Google sign-in (ADR 005): authorization code + PKCE; the result is our own session cookie. */
export function authRoutes(fetchFn: FetchFn): Hono<AppEnv> {
  const auth = new Hono<AppEnv>();

  auth.get("/login", async (c) => {
    const cfg = config(c);
    if (!cfg) return c.json({ error: "auth_not_configured" }, 500);
    const state = randomToken();
    const verifier = randomToken();
    const pending = await signToken(cfg.secret, { kind: "oauth", state, verifier, exp: nowSec() + OAUTH_TTL_SEC });
    setCookie(c, OAUTH_COOKIE, pending, { ...OAUTH_COOKIE_OPTIONS, maxAge: OAUTH_TTL_SEC });
    const challenge = await pkceChallenge(verifier);
    return c.redirect(authUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, challenge }), 302);
  });

  auth.get("/callback", async (c) => {
    const cfg = config(c);
    if (!cfg) return c.json({ error: "auth_not_configured" }, 500);
    const pending = await pendingLogin(cfg.secret, getCookie(c, OAUTH_COOKIE));
    deleteCookie(c, OAUTH_COOKIE, OAUTH_COOKIE_OPTIONS);
    const failed = () => c.redirect(`${cfg.appOrigin}/?login=failed`, 302);

    const code = c.req.query("code");
    if (!pending || !code || c.req.query("state") !== pending.state) return failed();
    try {
      const idToken = await exchangeCode(
        { code, verifier: pending.verifier, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri },
        fetchFn,
      );
      const who = idTokenClaims(idToken, cfg.clientId, nowSec());
      setCookie(c, SESSION_COOKIE, await encodeSession(cfg.secret, who), { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_SEC });
      return c.redirect(`${cfg.appOrigin}/`, 302);
    } catch (e) {
      console.warn("sign-in failed:", e instanceof Error ? e.message : String(e));
      return failed();
    }
  });

  auth.post("/logout", sameOrigin, (c) => {
    deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
    return c.json({ ok: true });
  });

  return auth;
}
