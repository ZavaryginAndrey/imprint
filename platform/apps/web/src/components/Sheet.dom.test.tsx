// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutContext } from "./layout";
import { Popover } from "./Popover";

afterEach(cleanup);

function Harness({ onRow }: { onRow(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <LayoutContext.Provider value="mobile">
      <div data-testid="row" onClick={onRow} onPointerDown={onRow}>
        <Popover open={open} onOpenChange={setOpen} label="Окно" trigger={<button type="button">open</button>}>
          <button type="button">inside</button>
        </Popover>
      </div>
    </LayoutContext.Provider>
  );
}

const scrim = () => document.querySelector("[data-scrim]") as HTMLElement;

describe("Sheet (mobile: every window is a sheet from the bottom, UX §4)", () => {
  it("the trigger opens a sheet over a scrim", () => {
    render(<Harness onRow={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeTruthy();
    expect(scrim()).toBeTruthy();
  });

  it("a pointerdown on the scrim keeps it; the click closes it and never reaches the row", () => {
    const onRow = vi.fn();
    render(<Harness onRow={onRow} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    onRow.mockClear();
    fireEvent.pointerDown(scrim());
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeTruthy();
    fireEvent.click(scrim());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("clicks inside never reach the row and do not close it", () => {
    const onRow = vi.fn();
    render(<Harness onRow={onRow} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    onRow.mockClear();
    const inside = screen.getByRole("button", { name: "inside" });
    fireEvent.pointerDown(inside);
    fireEvent.click(inside);
    expect(onRow).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Окно" })).toBeTruthy();
  });

  it("a right click inside never reaches the row's menu gesture", () => {
    const onMenu = vi.fn();
    function Menu() {
      const [open, setOpen] = useState(true);
      return (
        <LayoutContext.Provider value="mobile">
          <div onContextMenu={onMenu}>
            <Popover open={open} onOpenChange={setOpen} label="Окно" trigger={<button type="button">open</button>}>
              <button type="button">inside</button>
            </Popover>
          </div>
        </LayoutContext.Provider>
      );
    }
    render(<Menu />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "inside" }));
    expect(onMenu).not.toHaveBeenCalled();
  });
});
