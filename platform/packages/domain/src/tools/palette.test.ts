import { describe, expect, it } from "vitest";
import { GROUP_PALETTE, colorForId, javaStringHashCode } from "./palette";

describe("javaStringHashCode", () => {
  it("matches the JVM String.hashCode() on known values", () => {
    expect(javaStringHashCode("")).toBe(0);
    expect(javaStringHashCode("hello")).toBe(99162322);
    expect(javaStringHashCode("Hello World")).toBe(-862545276);
    expect(javaStringHashCode("polygenelubricants")).toBe(-2147483648);
  });
});

describe("colorForId", () => {
  it("picks palette[(h % 8 + 8) % 8] like DayViewModel.split, negative hashes included", () => {
    expect(colorForId("hello")).toBe(GROUP_PALETTE[2]);
    expect(colorForId("Hello World")).toBe(GROUP_PALETTE[4]);
    expect(colorForId("polygenelubricants")).toBe(GROUP_PALETTE[0]);
  });

  it("the palette is GroupColors.palette verbatim", () => {
    expect(GROUP_PALETTE).toEqual([
      0xff6c7ae0, 0xff3f9d8f, 0xffd98a3d, 0xffc15b7e, 0xff7e9a4e, 0xff9b6bc4, 0xff4e8fc0, 0xffc0663f,
    ]);
  });
});
