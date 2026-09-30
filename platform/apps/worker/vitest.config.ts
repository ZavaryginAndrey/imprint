import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        // Hibernatable WebSockets don't mix with per-test storage stacks; tests use fresh ids instead.
        isolatedStorage: false,
        // One runner worker: per-file runner names make Durable Object SQLite paths exceed Windows MAX_PATH.
        singleWorker: true,
        miniflare: {
          bindings: {
            SESSION_SECRET: "test-session-secret",
            GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
            GOOGLE_CLIENT_SECRET: "test-client-secret",
            APP_ORIGIN: "https://imprint.test",
            // Empty on purpose: a key from .dev.vars must never reach tests — they never call the real model.
            GEMINI_API_KEY: "",
          },
        },
      },
    },
  },
});
