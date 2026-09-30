import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { SESSION_COOKIE, decodeSession } from "./session";

/** Every user route: a valid session cookie, or 401 (W2 §C). Puts the session on `c.get("session")`. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const secret = c.env.SESSION_SECRET;
  if (!secret) return c.json({ error: "auth_not_configured" }, 500);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await decodeSession(secret, token) : null;
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("session", session);
  return next();
});

/** Blocks cross-site requests; non-browser clients send no Origin. `workers.dev` dev and prod share one "site", so SameSite alone is not enough. */
export function isAllowedOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header("origin");
  return !origin || origin === new URL(c.req.url).origin || origin === c.env.APP_ORIGIN;
}

/** Guards every mutating route: a foreign Origin is `403 forbidden_origin`. */
export const sameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAllowedOrigin(c)) return c.json({ error: "forbidden_origin" }, 403);
  return next();
});
