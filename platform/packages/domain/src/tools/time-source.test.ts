import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const RUNTIME_ZONE = /\b(startOfDayMillis|todayDayKey|windowStartKey)\b/;

describe("tools read time only through time/ (P5)", () => {
  it("no tool uses the runtime-zone date helpers", () => {
    const offenders = readdirSync(DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => RUNTIME_ZONE.test(readFileSync(join(DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
