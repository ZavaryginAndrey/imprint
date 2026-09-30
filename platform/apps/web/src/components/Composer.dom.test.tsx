// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Store } from "../store/store";
import { group, renderWithStore, snapshot } from "../test/harness";
import { Composer } from "./Composer";

afterEach(cleanup);

const snap = snapshot({ groups: [group({ id: "g1", name: "Дом" })] });
const field = () => screen.getByRole("textbox", { name: "Что не забыть?" }) as HTMLInputElement;
const type = (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.keyDown(field(), { key: "Enter" });
};
const where = (store: Store, title: string) => {
  const v = store.getState().view!;
  const day = v.day.find((t) => t.title === title);
  if (day) return { place: "day", groupId: day.groupId, dueKey: day.dueKey };
  const b = [...v.backlog.groups.flatMap((s) => s.tasks), ...v.backlog.ungrouped].find((t) => t.title === title);
  return b ? { place: "backlog", groupId: b.groupId, dueKey: b.dueKey } : null;
};

describe("Composer — the input table (UX §3, desktop)", () => {
  it("«Все задачи», no date → the Day, no group", async () => {
    const { store } = await renderWithStore(<Composer filter="all" />, snap);
    type("Молоко");
    expect(where(store, "Молоко")).toEqual({ place: "day", groupId: null, dueKey: null });
  });

  it("«Все задачи» + «Завтра» → the Backlog with tomorrow's date, no group", async () => {
    const { store } = await renderWithStore(<Composer filter="all" />, snap);
    fireEvent.click(screen.getByRole("button", { name: "Завтра" }));
    type("Отчёт");
    expect(where(store, "Отчёт")).toEqual({ place: "backlog", groupId: null, dueKey: "2026-09-29" });
  });

  it("a group filter, no date → that group's Backlog", async () => {
    const { store } = await renderWithStore(<Composer filter="g1" />, snap);
    type("Полка");
    expect(where(store, "Полка")).toEqual({ place: "backlog", groupId: "g1", dueKey: null });
  });

  it("«Все задачи» + the group chip «Дом», no date → the Day, group «Дом»", async () => {
    const { store } = await renderWithStore(<Composer filter="all" />, snap);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать группу" }));
    fireEvent.click(await screen.findByRole("button", { name: /Дом/ }));
    type("Цветы");
    expect(where(store, "Цветы")).toEqual({ place: "day", groupId: "g1", dueKey: null });
  });

  it("a date chip toggles; after adding the chips reset and the field stays focused and empty", async () => {
    const { store } = await renderWithStore(<Composer filter="all" />, snap);
    const tomorrow = screen.getByRole("button", { name: "Завтра" });
    fireEvent.click(tomorrow);
    expect(tomorrow.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tomorrow);
    expect(tomorrow.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Выходные" }));
    field().focus();
    type("Дача");
    expect(where(store, "Дача")?.dueKey).toBe("2026-10-03");
    expect(screen.getByRole("button", { name: "Выходные" }).getAttribute("aria-pressed")).toBe("false");
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
  });

  it("blank input is ignored", async () => {
    const { calls } = await renderWithStore(<Composer filter="all" />, snap);
    type("   ");
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });

  it("N focuses the field from anywhere but another input; Esc leaves it", async () => {
    await renderWithStore(
      <>
        <input aria-label="other" />
        <Composer filter="all" />
      </>,
      snap,
    );
    fireEvent.keyDown(document.body, { key: "n" });
    expect(document.activeElement).toBe(field());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(document.activeElement).not.toBe(field());
    const other = screen.getByRole("textbox", { name: "other" });
    other.focus();
    fireEvent.keyDown(other, { key: "n" });
    expect(document.activeElement).toBe(other);
  });

  it("the new row glows", async () => {
    const { store } = await renderWithStore(<Composer filter="all" />, snap);
    type("Молоко");
    const id = store.getState().view!.day[0].id;
    expect(store.getState().fresh).toBe(id);
  });

  it("the calendar chip is a native date input", async () => {
    await renderWithStore(<Composer filter="all" />, snap);
    const input = screen.getByLabelText("Выбрать дату") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.min).toBe("2026-09-28");
  });
});
