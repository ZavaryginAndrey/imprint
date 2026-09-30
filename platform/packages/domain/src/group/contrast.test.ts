import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { DARK_SURFACES, GROUP_COLORS, GROUP_COLOR_KEYS, LIGHT_SURFACES } from "./palette";

describe("contrastRatio (WCAG 2.x)", () => {
  it("black on white is 21, a colour on itself is 1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#E0A34A", "#E0A34A")).toBeCloseTo(1, 5);
  });
});

describe("group colours are ≥ 3:1 to their surfaces (UX §6, WCAG 1.4.11)", () => {
  for (const key of GROUP_COLOR_KEYS) {
    it.each(Object.entries(DARK_SURFACES))(`${key} dark tone on %s`, (_name, surface) => {
      expect(contrastRatio(GROUP_COLORS[key].dark, surface)).toBeGreaterThanOrEqual(3);
    });
    it.each(Object.entries(LIGHT_SURFACES))(`${key} light tone on %s`, (_name, surface) => {
      expect(contrastRatio(GROUP_COLORS[key].light, surface)).toBeGreaterThanOrEqual(3);
    });
  }
});
