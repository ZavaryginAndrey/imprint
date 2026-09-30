// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { plantDay } from "./mobileNav";
import { navigatePath } from "./router";

beforeEach(() => history.replaceState(null, "", "/"));

/** Entries added since `before`, and where we stand. */
const since = (before: number) => ({ added: history.length - before, path: location.pathname });

describe("plantDay puts one Day under a screen, never two (UX §2)", () => {
  it("a screen with no Day under it: one Day planted; a reload (plantDay again on the same entry) plants none", () => {
    navigatePath("/history"); // a first entry other than the Day, as a desktop period leaves it
    navigatePath("/g/all");
    const before = history.length;
    plantDay();
    expect(since(before)).toEqual({ added: 1, path: "/g/all" });
    plantDay(); // the entry and its state survive a reload or an auth flip
    expect(since(before)).toEqual({ added: 1, path: "/g/all" });
  });

  it("a screen pushed from the Day already has the Day under it: nothing is planted", () => {
    navigatePath("/g/all");
    const before = history.length;
    plantDay();
    expect(since(before)).toEqual({ added: 0, path: "/g/all" });
  });

  it("a replace between screens keeps the mark", () => {
    navigatePath("/g/all");
    navigatePath("/history", { replace: true });
    navigatePath("/settings", { replace: true });
    const before = history.length;
    plantDay();
    expect(since(before)).toEqual({ added: 0, path: "/settings" });
  });

  it("a push between screens (desktop) leaves no Day under the new one: the Day is planted", () => {
    navigatePath("/g/all");
    navigatePath("/history");
    const before = history.length;
    plantDay();
    expect(since(before)).toEqual({ added: 1, path: "/history" });
    plantDay();
    expect(since(before)).toEqual({ added: 1, path: "/history" });
  });
});
