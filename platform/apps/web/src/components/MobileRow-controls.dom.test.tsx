// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutContext } from "./layout";
import { renderWithStore, snapshot, task } from "../test/harness";
import { MobileList } from "../screens/MobileList";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const snap = snapshot({ tasks: [task({ id: "t1", title: "Молоко" }), task({ id: "t2", title: "Хлеб" })] });
const ui = (
  <LayoutContext.Provider value="mobile">
    <MobileList list="day" filter="all" />
  </LayoutContext.Provider>
);
const row = (title: string) => screen.getByText(title).closest("[data-row]") as HTMLElement;
const trayOf = (title: string) => row(title).querySelector("[data-tray]") as HTMLElement | null;

/** A touch held for `ms` on `el`, then released and clicked — a slow tap. */
function slowTap(el: Element, ms = 600) {
  fireEvent.pointerDown(el, { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 });
  act(() => vi.advanceTimersByTime(ms));
  fireEvent.pointerUp(el, { pointerType: "touch", pointerId: 1 });
  fireEvent.click(el);
}

describe("phone row: a slow press on a control is a press on that control (UX §4)", () => {
  it("a slow press on the circle ticks the task and opens no title sheet", async () => {
    const { store } = await renderWithStore(ui, snap);
    vi.useFakeTimers();
    slowTap(screen.getByRole("button", { name: /Отметить: Молоко/ }));
    expect(screen.queryByRole("dialog", { name: "Название задачи" })).toBeNull();
    expect(store.getState().view?.day.find((r) => r.id === "t1")?.doneToday).toBe(true);
  });

  it("the contextmenu Android fires on a long press of the circle opens nothing", async () => {
    await renderWithStore(ui, snap);
    const circle = screen.getByRole("button", { name: /Отметить: Молоко/ });
    const notPrevented = fireEvent.contextMenu(circle, { clientX: 20, clientY: 20 });
    expect(notPrevented).toBe(false); // no browser menu either
    expect(screen.queryByRole("dialog", { name: "Название задачи" })).toBeNull();
  });

  it("a slow press on a tray icon does what the icon does", async () => {
    const { store } = await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    vi.useFakeTimers();
    slowTap(within(trayOf("Молоко")!).getByLabelText("В бэклог"));
    expect(screen.queryByRole("dialog", { name: "Название задачи" })).toBeNull();
    expect(store.getState().view?.day.map((r) => r.title)).toEqual(["Хлеб"]);
  });

  it("a long press on the row's text still opens the title sheet", async () => {
    await renderWithStore(ui, snap);
    vi.useFakeTimers();
    slowTap(screen.getByText("Молоко"), 500);
    expect(screen.getByRole("dialog", { name: "Название задачи" })).toBeTruthy();
  });

  it("a tap on the tray's empty space keeps the row open", async () => {
    await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(trayOf("Молоко")!);
    expect(trayOf("Молоко")).toBeTruthy();
    expect(row("Молоко").getAttribute("data-open")).toBe("true");
  });
});
