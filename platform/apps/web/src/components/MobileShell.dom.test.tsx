// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithStore } from "../test/harness";
import { MobileShell } from "./MobileShell";

afterEach(cleanup);

function Harness({ onRow }: { onRow(): void }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <MobileShell sidebar={<button type="button">item</button>} drawer={drawer} onDrawer={setDrawer}>
      <div data-testid="row" onClick={onRow} onPointerDown={onRow} />
    </MobileShell>
  );
}

const scrim = () => document.querySelector("[data-scrim]") as HTMLElement;

describe("MobileShell drawer (UX §2)", () => {
  it("☰ opens the menu; a pointerdown on the scrim keeps it; the click closes it and never reaches the row", async () => {
    const onRow = vi.fn();
    await renderWithStore(<Harness onRow={onRow} />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("dialog", { name: "Меню" })).toBeTruthy();
    fireEvent.pointerDown(scrim());
    expect(screen.getByRole("dialog", { name: "Меню" })).toBeTruthy();
    fireEvent.click(scrim());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("Esc closes the menu", async () => {
    await renderWithStore(<Harness onRow={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
