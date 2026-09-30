// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LayoutContext } from "../components/layout";
import { renderWithStore, snapshot } from "../test/harness";
import { MobileRoot } from "./MobileRoot";
import { useRoute } from "./router";

afterEach(cleanup);

function Harness() {
  const [route] = useRoute();
  return (
    <LayoutContext.Provider value="mobile">
      <MobileRoot route={route} />
    </LayoutContext.Provider>
  );
}

describe("mobile ↔ desktop (UX §2)", () => {
  it("after a desktop period the Day is planted again: «День» from Settings lands on the Day", async () => {
    history.replaceState(null, "", "/");
    const first = await renderWithStore(<Harness />, snapshot());
    first.unmount();
    // Desktop: History, then Settings — two pushes with no Day between them.
    history.pushState(null, "", "/history");
    history.pushState(null, "", "/settings");
    await renderWithStore(<Harness />, snapshot());
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: /День/ }));
    expect(location.pathname).toBe("/");
  });
});
