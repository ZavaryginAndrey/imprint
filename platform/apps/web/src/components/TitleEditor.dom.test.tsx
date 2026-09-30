// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithStore, snapshot, task } from "../test/harness";
import { DayColumn } from "./DayColumn";
import { Toasts } from "./Toasts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const snap = snapshot({ tasks: [task({ id: "t1", title: "Молоко" })] });
const row = () => screen.getByText(/Молоко|Кефир/).closest("[data-row]") as HTMLElement;
const field = () => screen.getByRole("textbox", { name: "Название задачи" }) as HTMLInputElement;

describe("task title by right click (UX §4)", () => {
  it("opens at the click with the title; saves after a pause; Enter closes", async () => {
    const { store, calls } = await renderWithStore(<DayColumn />, snap);
    vi.useFakeTimers();
    fireEvent.contextMenu(row(), { clientX: 200, clientY: 120 });
    expect(field().value).toBe("Молоко");
    fireEvent.change(field(), { target: { value: "Кефир" } });
    expect(store.getState().view?.day[0].title).toBe("Молоко");
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().view?.day[0].title).toBe("Кефир");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "Название задачи" })).toBeNull();
    vi.useRealTimers();
    await act(async () => {});
    expect(calls.filter((c) => c.name === "rename_task")).toHaveLength(1);
  });

  it("Esc before the pause still saves the last text", async () => {
    const { store } = await renderWithStore(<DayColumn />, snap);
    fireEvent.contextMenu(row(), { clientX: 200, clientY: 120 });
    fireEvent.change(field(), { target: { value: "Кефир" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(store.getState().view?.day[0].title).toBe("Кефир");
  });

  it("a blank title is never sent and no «Не сохранилось» shows", async () => {
    const { store, calls } = await renderWithStore(
      <>
        <DayColumn />
        <Toasts />
      </>,
      snap,
    );
    fireEvent.contextMenu(row(), { clientX: 200, clientY: 120 });
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.keyDown(field(), { key: "Enter" });
    await act(async () => {});
    expect(calls).toHaveLength(0);
    expect(store.getState().toasts).toHaveLength(0);
    expect(store.getState().view?.day[0].title).toBe("Молоко");
  });

  it("a left click on the text opens nothing", async () => {
    await renderWithStore(<DayColumn />, snap);
    fireEvent.click(screen.getByText("Молоко"));
    expect(screen.queryByRole("textbox", { name: "Название задачи" })).toBeNull();
  });
});
