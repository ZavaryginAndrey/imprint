// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePressMenu } from "./usePressMenu";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Box({ onOpen, onClick, at }: { onOpen(r: DOMRect): void; onClick?(): void; at?: "point" | "element" }) {
  const press = usePressMenu(onOpen, { at });
  return (
    <div data-testid="box" {...press}>
      <button type="button" onClick={onClick}>child</button>
    </div>
  );
}

describe("usePressMenu — right click, the menu key, a long tap", () => {
  it("a right click opens at the pointer and keeps the browser menu away", () => {
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} />);
    const ev = fireEvent.contextMenu(screen.getByTestId("box"), { clientX: 40, clientY: 60 });
    expect(ev).toBe(false); // preventDefault
    expect(onOpen).toHaveBeenCalledTimes(1);
    const r = onOpen.mock.calls[0][0] as DOMRect;
    expect([r.x, r.y]).toEqual([40, 60]);
  });

  it("at: element — the item's own box, wherever the click was", () => {
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} at="element" />);
    const box = screen.getByTestId("box");
    box.getBoundingClientRect = () => new DOMRect(10, 20, 100, 30);
    fireEvent.contextMenu(box, { clientX: 40, clientY: 60 });
    expect((onOpen.mock.calls[0][0] as DOMRect).width).toBe(100);
  });

  it("a long touch opens after 500 ms and swallows the click that follows", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(<Box onOpen={onOpen} onClick={onClick} />);
    const child = screen.getByRole("button", { name: "child" });
    fireEvent.pointerDown(child, { pointerType: "touch", clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(499);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(child, { pointerType: "touch" });
    fireEvent.contextMenu(child, { clientX: 5, clientY: 5 }); // Android fires it too
    fireEvent.click(child);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a moving finger (a scroll) cancels the long tap; a short tap clicks", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(<Box onOpen={onOpen} onClick={onClick} />);
    const child = screen.getByRole("button", { name: "child" });
    fireEvent.pointerDown(child, { pointerType: "touch", clientX: 5, clientY: 5 });
    fireEvent.pointerMove(child, { pointerType: "touch", clientX: 5, clientY: 30 });
    vi.advanceTimersByTime(800);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.pointerDown(child, { pointerType: "touch", clientX: 5, clientY: 5 });
    fireEvent.pointerUp(child, { pointerType: "touch" });
    fireEvent.click(child);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
