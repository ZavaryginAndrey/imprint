// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePressMenu } from "./usePressMenu";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Box({ onOpen }: { onOpen(r: DOMRect): void }) {
  const press = usePressMenu(onOpen);
  return (
    <div data-testid="box" {...press}>
      <span>text</span>
    </div>
  );
}

const touch = (id: number, isPrimary: boolean) => ({ pointerType: "touch", pointerId: id, isPrimary, clientX: 5, clientY: 5 });

describe("usePressMenu — a lost pointerup", () => {
  it("a primary touch forgets a finger whose pointerup never came; the long tap still opens", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} />);
    const text = screen.getByText("text");
    fireEvent.pointerDown(text, touch(1, true)); // its pointerup is lost (e.g. the touched child was re-keyed)
    vi.advanceTimersByTime(100);
    fireEvent.pointerDown(text, touch(2, true));
    vi.advanceTimersByTime(500);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("a non-primary touch while another is down is still a second finger", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<Box onOpen={onOpen} />);
    const text = screen.getByText("text");
    fireEvent.pointerDown(text, touch(1, true));
    fireEvent.pointerDown(text, touch(2, false));
    vi.advanceTimersByTime(800);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
