// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutContext } from "../components/layout";
import { group, renderWithStore, snapshot } from "../test/harness";
import { MobileRoot } from "./MobileRoot";
import { useRoute } from "./router";

afterEach(cleanup);
beforeEach(() => history.replaceState(null, "", "/"));

function Harness() {
  const [route] = useRoute();
  return (
    <LayoutContext.Provider value="mobile">
      <MobileRoot route={route} />
    </LayoutContext.Provider>
  );
}

const snap = snapshot({ groups: [group({ id: "g1", name: "Дом" })] });

describe("mobile shell (UX §2)", () => {
  it("opens on the Day; ☰ opens the menu; «Все задачи» shows the whole Backlog and closes the menu", async () => {
    await renderWithStore(<Harness />, snap);
    expect(screen.getByRole("heading", { name: "День" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: /Все задачи/ }));
    expect(location.pathname).toBe("/g/all");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Бэклог" })).toBeTruthy();
  });

  it("a group opens its Backlog; «День» comes back", async () => {
    await renderWithStore(<Harness />, snap);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.click(screen.getByRole("button", { name: /Дом/ }));
    expect(location.pathname).toBe("/g/g1");
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("button", { name: /Дом/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /День/ }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /День/ }));
    expect(location.pathname).toBe("/");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "День" })).toBeTruthy();
  });
});
