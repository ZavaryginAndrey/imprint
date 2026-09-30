import { describe, expect, it } from "vitest";
import { parseRoute, routePath, type Route } from "./router";

describe("routes (UX §2)", () => {
  const cases: [string, Route][] = [
    ["/", { screen: "day", filter: "all" }],
    ["/g/abc-1", { screen: "day", filter: "abc-1" }],
    ["/history", { screen: "history" }],
    ["/settings", { screen: "settings" }],
  ];
  it.each(cases)("%s round-trips", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
    expect(routePath(route)).toBe(path);
  });

  it("unknown paths and /g/all are the Day with every task", () => {
    expect(parseRoute("/nope")).toEqual({ screen: "day", filter: "all" });
    expect(parseRoute("/g/all")).toEqual({ screen: "day", filter: "all" });
    expect(parseRoute("/g/")).toEqual({ screen: "day", filter: "all" });
  });

  it("a malformed address is the Day, not a crash", () => {
    expect(parseRoute("/g/%E0%A4%A")).toEqual({ screen: "day", filter: "all" });
  });

  it("a trailing slash is tolerated", () => {
    expect(parseRoute("/history/")).toEqual({ screen: "history" });
  });
});
