import { defineConfig } from "vitest/config";

/** Logic tests run in Node; component tests (`*.dom.test.tsx`) declare `@vitest-environment happy-dom`. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
