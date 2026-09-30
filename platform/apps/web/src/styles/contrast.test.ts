import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GROUP_COLORS, contrastRatio } from "@imprint/domain";
import { describe, expect, it } from "vitest";

/** tokens.css → the variables of each world: light `:root`, the dark media block, Meta. */
function worlds(): Record<"light" | "dark" | "meta", Record<string, string>> {
  const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));
  const light = vars(/^:root\s*\{([\s\S]*?)\}/m.exec(css)![1]);
  const dark = { ...light, ...vars(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/.exec(css)![1]) };
  const meta = { ...dark, ...vars(/:root\[data-world="meta"\]\s*\{([\s\S]*?)\}/.exec(css)![1]) };
  return { light, dark, meta };
}

const AA = 4.5;
const W = worlds();

describe("token contrast (UX §6, §8)", () => {
  for (const [world, v] of Object.entries(W)) {
    it.each(["ink", "muted", "amber-ink", "danger"])(`${world}: --%s text is AA on --surf (rows, windows)`, (k) => {
      expect(contrastRatio(v[k], v.surf)).toBeGreaterThanOrEqual(AA);
    });
    // On the page itself: titles, their amber line, section labels. --danger lives only in windows.
    it.each(["ink", "muted", "amber-ink"])(`${world}: --%s text is AA on --bg`, (k) => {
      expect(contrastRatio(v[k], v.bg)).toBeGreaterThanOrEqual(AA);
    });
    it(`${world}: struck-through done text is at least 3:1 (plan decision 1)`, () => {
      expect(contrastRatio(v.done, v.surf)).toBeGreaterThanOrEqual(3);
    });
    it(`${world}: text on the amber button is AA`, () => {
      expect(contrastRatio(v["on-amber"], v.amber)).toBeGreaterThanOrEqual(AA);
    });
  }

  it.each(["side-ink", "side-muted", "side-lab"])("sidebar --%s is AA on SideBg", (k) => {
    expect(contrastRatio(W.light[k], W.light.side)).toBeGreaterThanOrEqual(AA);
  });

  it.each(["side-ink", "side-muted"])("sidebar --%s is AA on a selected item", (k) => {
    expect(contrastRatio(W.light[k], W.light["side-surf"])).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(GROUP_COLORS))("group colour %s is ≥ 3:1 on every surface it sits on", (_k, tone) => {
    for (const s of [W.light.surf, W.light.bg]) expect(contrastRatio(tone.light, s)).toBeGreaterThanOrEqual(3);
    for (const s of [W.dark.surf, W.dark.bg, W.meta.surf, W.light.side]) expect(contrastRatio(tone.dark, s)).toBeGreaterThanOrEqual(3);
  });
});
