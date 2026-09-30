import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const DESKTOP = "@media (min-width: 1024px)";

/** Every `:hover` selector in `css` that no enclosing `@media (min-width: 1024px)` block holds. */
function ungatedHovers(css: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  let buf = "";
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      const sel = buf.trim().replace(/\s+/g, " ");
      if (sel.includes(":hover") && !stack.includes(DESKTOP)) out.push(sel);
      stack.push(sel);
      buf = "";
    } else if (ch === "}") {
      stack.pop();
      buf = "";
    } else if (ch === ";") buf = "";
    else buf += ch;
  }
  return out;
}

describe("hover effects belong to the desktop layout only (Global Constraint, UX §4)", () => {
  it("the scanner sees a bare hover and passes a gated one", () => {
    expect(ungatedHovers(".a:hover { color: red; }")).toEqual([".a:hover"]);
    expect(ungatedHovers(`${DESKTOP} { .a:hover { color: red; } }`)).toEqual([]);
  });

  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".css"));
  it.each(files.map((f) => [relative(SRC, join(SRC, f))]))("%s: every :hover sits under (min-width: 1024px)", (f) => {
    expect(ungatedHovers(readFileSync(join(SRC, f), "utf8"))).toEqual([]);
  });
});
