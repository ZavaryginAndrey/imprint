// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutContext } from "./layout";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { MobileList } from "../screens/MobileList";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом" })],
  tasks: [task({ id: "t1", title: "Молоко" }), task({ id: "t2", title: "Хлеб" })],
});
const ui = (
  <LayoutContext.Provider value="mobile">
    <MobileList list="day" filter="all" />
  </LayoutContext.Provider>
);
const row = (title: string) => screen.getByText(title).closest("[data-row]") as HTMLElement;
const trayOf = (title: string) => row(title).querySelector("[data-tray]");

describe("phone row (UX §4)", () => {
  it("a tap opens the tray under the text — move, group, date, repeat, steps, delete; no hover icons", async () => {
    await renderWithStore(ui, snap);
    expect(row("Молоко").querySelector("[data-actions]")).toBeNull();
    fireEvent.click(screen.getByText("Молоко"));
    const tray = within(trayOf("Молоко") as HTMLElement);
    for (const name of ["В бэклог", "Выбрать группу", "Дата", "Повтор", "Шаги", "Удалить"]) expect(tray.getByLabelText(name)).toBeTruthy();
    expect(row("Молоко").getAttribute("data-open")).toBe("true");
  });

  it("one row open at a time; a tap outside every row closes it", async () => {
    await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(screen.getByText("Хлеб"));
    expect(trayOf("Молоко")).toBeNull();
    expect(trayOf("Хлеб")).toBeTruthy();
    fireEvent.click(screen.getByRole("heading", { name: "День" }));
    expect(trayOf("Хлеб")).toBeNull();
  });

  it("the tray's windows are sheets; a day chip and the scrim leave the row open", async () => {
    await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(within(trayOf("Молоко") as HTMLElement).getByLabelText("Повтор"));
    fireEvent.click(await screen.findByRole("button", { name: "пн" }));
    expect(screen.getByRole("dialog", { name: "Повтор" })).toBeTruthy();
    const scrim = document.querySelector("[data-scrim]") as HTMLElement;
    fireEvent.pointerDown(scrim);
    fireEvent.click(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trayOf("Молоко")).toBeTruthy();
  });

  it("the move icon sends the task to the Backlog (move_to_backlog)", async () => {
    const { store } = await renderWithStore(ui, snap);
    fireEvent.click(screen.getByText("Молоко"));
    fireEvent.click(within(trayOf("Молоко") as HTMLElement).getByLabelText("В бэклог"));
    expect(store.getState().view?.day.map((r) => r.title)).toEqual(["Хлеб"]);
  });

  it("a long tap opens the title sheet and does not toggle the tray", async () => {
    await renderWithStore(ui, snap);
    vi.useFakeTimers();
    const text = screen.getByText("Молоко");
    fireEvent.pointerDown(text, { pointerType: "touch", clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(text, { pointerType: "touch" });
    fireEvent.click(text);
    expect(screen.getByRole("dialog", { name: "Название задачи" })).toBeTruthy();
    expect(trayOf("Молоко")).toBeNull();
  });
});
