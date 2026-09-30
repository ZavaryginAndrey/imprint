import { describe, expect, it } from "vitest";
import { MAX_IDS, parseIds } from "../src/store/ids";

const u = () => crypto.randomUUID();

describe("parseIds", () => {
  it("reads comma-separated UUIDs", () => {
    const a = u();
    const b = u();
    expect(parseIds(`${a}, ${b}`)).toEqual([a, b]);
  });

  it("absent, empty, malformed, duplicated or too long → none", () => {
    const a = u();
    expect(parseIds(null)).toEqual([]);
    expect(parseIds(undefined)).toEqual([]);
    expect(parseIds("")).toEqual([]);
    expect(parseIds(`${a},nope`)).toEqual([]);
    expect(parseIds(`${a},${a}`)).toEqual([]);
    expect(parseIds(Array.from({ length: MAX_IDS + 1 }, u).join(","))).toEqual([]);
    expect(parseIds(Array.from({ length: MAX_IDS }, u).join(","))).toHaveLength(MAX_IDS);
  });
});
