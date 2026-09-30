// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LayoutContext } from "../components/layout";
import { group, renderWithStore, snapshot } from "../test/harness";
import { mobileGuardGo } from "./mobileNav";
import { MobileRoot } from "./MobileRoot";
import { FILTER_KEY, useRoute } from "./router";
import { useRouteGuards } from "./useRouteGuards";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** App's mobile wiring: the guards with the mobile `go` and no filter restore. */
function Harness() {
  const [route] = useRoute();
  useRouteGuards(route, mobileGuardGo, { restore: false });
  return (
    <LayoutContext.Provider value="mobile">
      <MobileRoot route={route} />
    </LayoutContext.Provider>
  );
}

describe("mobile route guards (UX §2)", () => {
  it("a gone group's Backlog falls back to the whole Backlog, not the Day", async () => {
    history.replaceState(null, "", "/g/gone");
    await renderWithStore(<Harness />, snapshot());
    expect(location.pathname).toBe("/g/all");
    expect(screen.getByRole("heading", { name: "Бэклог" })).toBeTruthy();
  });

  it("/ is always the Day — the last desktop filter is not restored", async () => {
    history.replaceState(null, "", "/");
    localStorage.setItem(FILTER_KEY, "g1");
    await renderWithStore(<Harness />, snapshot({ groups: [group({ id: "g1", name: "Дом" })] }));
    expect(location.pathname).toBe("/");
    expect(screen.getByRole("heading", { name: "День" })).toBeTruthy();
  });
});
