import { describe, expect, it } from "vitest";
import { probeDomain } from "./probe";

describe("probeDomain", () => {
  it("runs the domain in-process: add_task to the Day, then list_day sees it", () => {
    const p = probeDomain();
    expect(p.tools).toBeGreaterThan(0);
    expect(p.added).toBe(true);
    expect(p.dayCount).toBe(1);
  });
});
