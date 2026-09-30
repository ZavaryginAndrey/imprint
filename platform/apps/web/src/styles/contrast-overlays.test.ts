import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrastRatio } from "@imprint/domain";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** tokens.css → the variables of each world: light `:root`, the dark media block, Meta (as in `contrast.test.ts`). */
function worlds(): Record<"light" | "dark" | "meta", Record<string, string>> {
  const css = read("./tokens.css");
  const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));
  const light = vars(/^:root\s*\{([\s\S]*?)\}/m.exec(css)![1]);
  const dark = { ...light, ...vars(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(css)![1]) };
  const meta = { ...dark, ...vars(/:root\[data-world="meta"\]\s*\{([\s\S]*?)\}/.exec(css)![1]) };
  return { light, dark, meta };
}

/** The token a CSS module rule paints `prop` with: `selector { … prop: var(--token) … }` → `token`. */
function tokenOf(file: string, selector: string, prop: "color" | "background"): string {
  const css = read(file);
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule) throw new Error(`${file}: no rule «${selector}»`);
  const m = new RegExp(`(?:^|;|\\s)${prop}:\\s*var\\(--([\\w-]+)\\)`).exec(rule[1]);
  if (!m) throw new Error(`${file} «${selector}»: no ${prop}: var(--…)`);
  return m[1];
}

const AA = 4.5;
const W = worlds();

describe("text on the toast and on a selected sidebar item is AA (UX §6)", () => {
  const act = tokenOf("../components/Toasts.module.css", ".act", "color");
  const toast = tokenOf("../components/Toasts.module.css", ".toast", "background");

  it("the toast action has its own token", () => {
    expect(act).toBe("toast-act");
  });

  for (const [world, v] of Object.entries(W)) {
    it(`${world}: the toast action (--${act}) is AA on the toast (--${toast})`, () => {
      expect(contrastRatio(v[act], v[toast])).toBeGreaterThanOrEqual(AA);
    });
  }

  it.each([
    ["the Day counter on the selected item", ".sel .n", "color"],
    ["the new-group field's placeholder", ".field::placeholder", "color"],
  ] as const)("%s is AA on --side-surf", (_what, selector, prop) => {
    const k = tokenOf("../components/Sidebar.module.css", selector, prop);
    expect(contrastRatio(W.light[k], W.light["side-surf"])).toBeGreaterThanOrEqual(AA);
  });

  it("the new-group field sits on --side-surf", () => {
    expect(tokenOf("../components/Sidebar.module.css", ".field", "background")).toBe("side-surf");
  });
});
