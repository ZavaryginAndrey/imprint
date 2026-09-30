import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// e2e runs its own worker and web on other ports (playwright.config.ts): IMPRINT_API / IMPRINT_WEB_PORT.
const API = process.env.IMPRINT_API ?? "http://localhost:8787";
const PORT = Number(process.env.IMPRINT_WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: true,
    proxy: {
      "/api": { target: API, ws: true },
      "/auth": API,
      "/health": API,
    },
  },
});
