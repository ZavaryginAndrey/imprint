import { ALL_TOOLS } from "@imprint/domain";
import { Hono } from "hono";
import { apiRoutes } from "./api/routes";
import type { FetchFn } from "./auth/google";
import { authRoutes } from "./auth/routes";
import type { AppEnv } from "./env";

/** `fetchFn` reaches Google's token endpoint; tests pass a fake. */
export function createApp(fetchFn: FetchFn = (input, init) => fetch(input, init)): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /** Anything unexpected is JSON too, never an HTML error page. */
  app.onError((err, c) => {
    console.error("unhandled:", err);
    return c.json({ error: "internal" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true, tools: ALL_TOOLS.length }));
  app.route("/auth", authRoutes(fetchFn));
  app.route("/api", apiRoutes());

  /** API misses must never fall through to the SPA's index.html. */
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  /** Everything else is the web app (SPA fallback is configured on the assets binding). */
  app.all("*", (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

  return app;
}
