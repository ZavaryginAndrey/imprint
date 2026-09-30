import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const FORBIDDEN = /\b(localStorage|sessionStorage|window|document|process|Buffer)\b|\brequire\(|from "(cloudflare:|react|node:)/;

/** Code only: the copied KDoc legitimately says "window" (completion.ts) and "localStorage" (tools/context.ts). */
function offends(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return FORBIDDEN.test(code);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

describe("domain purity", () => {
  it("the check catches real use and ignores comments", () => {
    expect(offends('const x = localStorage.getItem("k");')).toBe(true);
    expect(offends('import { env } from "cloudflare:workers";')).toBe(true);
    expect(offends("/** No localStorage behind a tool. */\n// the window lower bound\nconst a = 1;")).toBe(false);
  });

  it("non-test source uses no browser, Node or Cloudflare globals/imports", () => {
    const offenders = sourceFiles(SRC).filter((f) => offends(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the browser-only tool context was not copied", () => {
    expect(sourceFiles(SRC).some((f) => f.endsWith("browserContext.ts"))).toBe(false);
  });
});
