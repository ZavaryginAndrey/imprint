// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore } from "../test/harness";
import { MobileShell } from "./MobileShell";

afterEach(cleanup);

function Harness() {
  const [drawer, setDrawer] = useState(false);
  return (
    <MobileShell sidebar={<button type="button">item</button>} drawer={drawer} onDrawer={setDrawer}>
      <p>screen</p>
    </MobileShell>
  );
}

const scrim = () => document.querySelector("[data-scrim]") as HTMLElement;

describe("MobileShell drawer (UX §2)", () => {
  // happy-dom does no hit-testing, so whether the click reaches the row under the scrim is Task 11's e2e.
  it("☰ opens the menu; a pointerdown on the scrim keeps it; its click closes it", async () => {
    await renderWithStore(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("dialog", { name: "Меню" })).toBeTruthy();
    fireEvent.pointerDown(scrim());
    expect(screen.getByRole("dialog", { name: "Меню" })).toBeTruthy();
    fireEvent.click(scrim());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc closes the menu", async () => {
    await renderWithStore(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
