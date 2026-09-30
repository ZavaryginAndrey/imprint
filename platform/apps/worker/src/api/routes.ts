import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie } from "hono/cookie";
import { isAllowedOrigin, requireSession, sameOrigin } from "../auth/middleware";
import { SESSION_COOKIE } from "../auth/session";
import type { AppEnv } from "../env";
import { IDS_HEADER, parseIds } from "../store/ids";

/** A tab sends its connection id with tool calls so its own live socket is not told about its own write. */
export const CONN_HEADER = "x-imprint-conn";
export const MAX_BODY_BYTES = 64 * 1024;

/** The caller's object — the only way a route reaches user data (isolation by construction). */
const userStore = (c: Context<AppEnv>) => c.env.USER_STORE.get(c.env.USER_STORE.idFromName(c.get("session").sub));

/** An empty body is `{}`; anything else must be JSON. */
async function readInput(c: Context<AppEnv>): Promise<{ input: unknown } | null> {
  const text = await c.req.text();
  if (text.trim() === "") return { input: {} };
  try {
    return { input: JSON.parse(text) as unknown };
  } catch {
    return null;
  }
}

export function apiRoutes(): Hono<AppEnv> {
  const api = new Hono<AppEnv>();

  api.get("/me", requireSession, (c) => {
    const { sub, email } = c.get("session");
    return c.json({ sub, email });
  });

  api.post(
    "/tools/:name",
    requireSession,
    sameOrigin,
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "too_large" }, 413) }),
    async (c) => {
      const body = await readInput(c);
      if (!body) return c.json({ error: "invalid_json" }, 400);
      const ids = parseIds(c.req.header(IDS_HEADER));
      const call = await userStore(c).callTool(c.req.param("name"), body.input, c.req.header(CONN_HEADER), ids);
      // Wire<ToolCall> is too deep for Hono to infer a typed response from.
      return c.json(call as { result: unknown; rev: number });
    },
  );

  api.get("/state", requireSession, async (c) => c.json(await userStore(c).getState()));

  api.get("/live", requireSession, async (c) => {
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "expected_websocket" }, 426);
    if (!isAllowedOrigin(c)) return c.json({ error: "forbidden_origin" }, 403);
    return userStore(c).fetch(c.req.raw);
  });

  api.delete("/account", requireSession, sameOrigin, async (c) => {
    await userStore(c).deleteAccount();
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ ok: true });
  });

  return api;
}
