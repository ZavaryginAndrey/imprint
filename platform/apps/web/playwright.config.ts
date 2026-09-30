import { defineConfig, devices } from "@playwright/test";
import { E2E_SECRET, WEB, WEB_PORT, WORKER_PORT } from "./e2e/env";

if (!/^http:\/\/localhost:\d+$/.test(WEB)) throw new Error("e2e runs on localhost only (CRIT-1)");

/**
 * e2e (W4 spec §7): a local worker (Miniflare, `.wrangler/e2e`) and Vite on their own ports. Sign-in is a
 * session cookie signed with the test secret — no Google, no test route on the server. Locally the
 * system Edge; in CI the bundled Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.E2E_CHANNEL ?? (process.env.CI ? undefined : "msedge"),
    baseURL: WEB,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: `npx wrangler dev --port ${WORKER_PORT} --persist-to .wrangler/e2e --var SESSION_SECRET:${E2E_SECRET} --var APP_ORIGIN:${WEB} --var GEMINI_API_KEY:`,
      cwd: "../worker",
      port: WORKER_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite",
      env: { IMPRINT_API: `http://localhost:${WORKER_PORT}`, IMPRINT_WEB_PORT: String(WEB_PORT) },
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
