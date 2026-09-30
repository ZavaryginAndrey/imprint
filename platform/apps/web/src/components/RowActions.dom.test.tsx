// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { DayColumn } from "./DayColumn";
import { Toasts } from "./Toasts";

afterEach(cleanup);

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом" })],
  tasks: [task({ id: "t1", title: "Молоко" })],
});
const row = () => screen.getByText("Молоко").closest("[data-row]") as HTMLElement;
const titles = (store: { getState(): { view: { day: { title: string }[] } | null } }) => store.getState().view?.day.map((t) => t.title);

describe("row actions (desktop hover)", () => {
  it("a task without a group shows a dashed + label; picking a group sets it", async () => {
    const { store, calls } = await renderWithStore(<DayColumn />, snap);
    const label = within(row()).getByRole("button", { name: "Выбрать группу" });
    expect(label.textContent).toBe("");
    fireEvent.click(label);
    fireEvent.click(await screen.findByRole("button", { name: /Дом/ }));
    expect(store.getState().view?.day[0].groupId).toBe("g1");
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "set_task_group", input: { taskId: "t1", groupId: "g1" } });
  });

  it("while its popover is open the row stays active", async () => {
    await renderWithStore(<DayColumn />, snap);
    fireEvent.click(within(row()).getByRole("button", { name: "Выбрать группу" }));
    await screen.findByRole("button", { name: /Дом/ });
    expect(row().getAttribute("data-active")).toBe("true");
  });

  it("date: a native date input from today; a future date takes a Day task to the Backlog; clearing sends null", async () => {
    const { store, calls } = await renderWithStore(<DayColumn />, snap);
    const input = within(row()).getByLabelText("Дата") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.min).toBe("2026-09-28");
    fireEvent.change(input, { target: { value: "2026-10-02" } });
    expect(titles(store)).toEqual([]);
    expect(store.getState().view?.backlog.ungrouped[0]).toMatchObject({ id: "t1", dueKey: "2026-10-02" });
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "set_due_date", input: { taskId: "t1", date: "2026-10-02" } });
  });

  it("delete at once, toast «Задача удалена · Отменить»; undo brings it back", async () => {
    const { store } = await renderWithStore(
      <>
        <DayColumn />
        <Toasts />
      </>,
      snap,
    );
    fireEvent.click(within(row()).getByRole("button", { name: "Удалить" }));
    expect(titles(store)).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain("Задача удалена");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(titles(store)).toEqual(["Молоко"]);
  });

  it("a refused call shows «Не сохранилось · Повторить»", async () => {
    const { store } = await renderWithStore(<Toasts />, snap);
    act(() => void store.run("set_done", { taskId: "missing", done: true }));
    expect(screen.getByRole("status").textContent).toContain("Не сохранилось");
    expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy();
  });
});
