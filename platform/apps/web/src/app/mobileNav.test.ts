import { describe, expect, it } from "vitest";
import { backlogPath, isBacklogPath, parseRoute } from "./router";
import { mobileScreen, mobileStep } from "./mobileNav";

describe("mobile addresses (UX §2)", () => {
  it("/g/... is the Backlog screen; / is the Day", () => {
    expect(isBacklogPath("/g/all")).toBe(true);
    expect(isBacklogPath("/g/abc")).toBe(true);
    expect(isBacklogPath("/")).toBe(false);
    expect(isBacklogPath("/history")).toBe(false);
    expect(backlogPath("all")).toBe("/g/all");
    expect(backlogPath("a b")).toBe("/g/a%20b");
  });

  it("the screen from the route and the path", () => {
    expect(mobileScreen(parseRoute("/"), "/")).toBe("day");
    expect(mobileScreen(parseRoute("/g/all"), "/g/all")).toBe("backlog");
    expect(mobileScreen(parseRoute("/g/g1"), "/g/g1")).toBe("backlog");
    expect(mobileScreen(parseRoute("/settings"), "/settings")).toBe("settings");
  });

  it("Back from the Backlog, History or Settings returns to the Day", () => {
    expect(mobileStep("/", "/g/all")).toEqual({ kind: "push", path: "/g/all" });
    expect(mobileStep("/g/all", "/history")).toEqual({ kind: "replace", path: "/history" });
    expect(mobileStep("/history", "/")).toEqual({ kind: "back" });
    expect(mobileStep("/g/all", "/g/all")).toBeNull();
  });
});
