// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePressMenu } from "./usePressMenu";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Box({ onOpen, onClick }: { onOpen(r: DOMRect): void; onClick?(): void }) {
  const press = usePressMenu(onOpen);
  return (
    <div data-testid="box" {...press}>
      <button type="button" onClick={onClick}>child</button>
    </div>
  );
}

const touch = (id: number, over: object = {}) => ({ pointerType: "touch", pointerId: id, clientX: 5, clientY: 5, ...over });

describe("usePressMenu — several fingers and a stale long-tap flag", () => {
  it("a second finger (pinch) voids the long tap of the first", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} />);
    const child = screen.getByRole("button", { name: "child" });
    fireEvent.pointerDown(child, touch(1));
    fireEvent.pointerDown(child, touch(2));
    fireEvent.pointerCancel(child, touch(1));
    fireEvent.pointerCancel(child, touch(2));
    vi.advanceTimersByTime(800);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a long tap that no click follows does not eat a later click", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(<Box onOpen={onOpen} onClick={onClick} />);
    const child = screen.getByRole("button", { name: "child" });
    fireEvent.pointerDown(child, touch(1));
    vi.advanceTimersByTime(500);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(child, touch(1));
    vi.advanceTimersByTime(10); // no click came (Chrome Android, iOS)
    fireEvent.click(child); // e.g. a tap inside a window that stops pointerdown, or the keyboard
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
