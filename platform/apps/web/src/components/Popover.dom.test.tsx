// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Popover } from "./Popover";

afterEach(cleanup);

function Harness({ onRowClick }: { onRowClick(): void }) {
  const [open, setOpen] = useState(true);
  return (
    <div data-testid="row" onClick={onRowClick} onPointerDown={onRowClick}>
      <Popover open={open} onOpenChange={setOpen} trigger={<button type="button">open</button>} label="Окно">
        <button type="button">inside</button>
      </Popover>
    </div>
  );
}

describe("Popover", () => {
  it("clicks inside never reach the row (landing trap: a redrawn popover detaches its target)", () => {
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} />);
    const inside = screen.getByRole("button", { name: "inside" });
    fireEvent.pointerDown(inside);
    fireEvent.click(inside);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("Esc closes it", () => {
    render(<Harness onRowClick={() => {}} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "inside" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "inside" })).toBeNull();
  });
});
