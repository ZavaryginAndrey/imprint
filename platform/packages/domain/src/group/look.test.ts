import { describe, expect, it } from "vitest";
import { argbOf, colorKeyFromArgb, groupLook, nextColorKey, withLook } from "./look";
import { GROUP_COLOR_KEYS, GROUP_ICONS } from "./palette";

describe("group palette and icons (UX §5)", () => {
  it("8 colour keys and 16 unique icon keys, tag among them", () => {
    expect(GROUP_COLOR_KEYS).toHaveLength(8);
    expect(new Set(GROUP_ICONS).size).toBe(16);
    expect(GROUP_ICONS).toContain("tag");
  });
});

describe("argbOf", () => {
  it("is the opaque dark (base) tone of the key; no key is 0", () => {
    expect(argbOf("amber")).toBe(0xffe0a34a);
    expect(argbOf("graphite")).toBe(0xff9aa0ab);
    expect(argbOf(null)).toBe(0);
  });
});

describe("colorKeyFromArgb", () => {
  it.each([
    [0xff6c7ae0, "blue"], [0xff3f9d8f, "teal"], [0xffd98a3d, "amber"], [0xffc15b7e, "rose"],
    [0xff7e9a4e, "sage"], [0xff9b6bc4, "plum"], [0xff4e8fc0, "blue"], [0xffc0663f, "terracotta"],
  ])("v1 %i maps by the UX §5 table, signed or not", (argb, key) => {
    expect(colorKeyFromArgb(argb)).toBe(key);
    expect(colorKeyFromArgb(argb | 0)).toBe(key);
  });

  it("recognises its own base tones; 0 and off-palette values have no key", () => {
    for (const k of GROUP_COLOR_KEYS) expect(colorKeyFromArgb(argbOf(k))).toBe(k);
    expect(colorKeyFromArgb(0)).toBeNull();
    expect(colorKeyFromArgb(0xff123456)).toBeNull();
  });
});

describe("groupLook", () => {
  it("an old v1 row: key from its ARGB, icon tag", () => {
    expect(groupLook({ color: 0xffd98a3d | 0 })).toEqual({ colorKey: "amber", icon: "tag" });
    expect(groupLook({ color: 0 })).toEqual({ colorKey: null, icon: "tag" });
  });

  it("a stored key and icon win; garbage falls back", () => {
    expect(groupLook({ color: 0, colorKey: "teal", icon: "house" })).toEqual({ colorKey: "teal", icon: "house" });
    expect(groupLook({ color: argbOf("rose"), colorKey: "neon" as never, icon: "bogus" as never })).toEqual({ colorKey: "rose", icon: "tag" });
  });

  it("withLook fills both fields and keeps the row", () => {
    const g = { id: "g", name: "G", position: 0, isCollapsed: false, color: 0xff6c7ae0, createdAt: 1, updatedAt: 1, deletedAt: null };
    expect(withLook(g)).toEqual({ ...g, colorKey: "blue", icon: "tag" });
  });
});

describe("nextColorKey", () => {
  it("goes round the palette; no previous colour starts at amber", () => {
    expect(nextColorKey(null)).toBe("amber");
    expect(nextColorKey("amber")).toBe("terracotta");
    expect(nextColorKey("graphite")).toBe("amber");
  });
});
