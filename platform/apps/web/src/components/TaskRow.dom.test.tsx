// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { bit } from "@imprint/domain";
import { afterEach, describe, expect, it } from "vitest";
import { DayColumn } from "./DayColumn";
import { BacklogColumn } from "./BacklogColumn";
import { group, renderWithStore, snapshot, task } from "../test/harness";

afterEach(cleanup);

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом", colorKey: "teal", icon: "house" })],
  tasks: [
    task({ id: "t1", title: "Молоко", groupId: "g1" }),
    task({ id: "t2", title: "Полка", location: "BACKLOG", enteredDayAt: null, groupId: "g1", dueDate: Date.UTC(2026, 9, 3) }),
    task({ id: "t3", title: "Спорт", location: "BACKLOG", enteredDayAt: null, isRepeating: true, recurrenceMask: bit(0) | bit(3) }),
  ],
});

describe("rows", () => {
  it("only the circle ticks (CMP-4); the text does nothing", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    fireEvent.click(screen.getByText("Молоко"));
    await act(async () => {});
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Отметить: Молоко" }));
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "set_done", input: { taskId: "t1", done: true } });
    expect(screen.getByRole("button", { name: "Вернуть: Молоко" })).toBeTruthy();
    expect(screen.getByText("Молоко").closest("[data-done]")?.getAttribute("data-done")).toBe("true");
  });

  it("Day: at rest the group shows as its icon only (the name is only in the hover label)", async () => {
    await renderWithStore(<DayColumn />, snap);
    const row = (screen.getByText("Молоко").closest("[data-row]") as HTMLElement).cloneNode(true) as HTMLElement;
    row.querySelector("[data-actions]")?.remove();
    expect(row.querySelector("[data-group-icon]")).toBeTruthy();
    expect(row.textContent).not.toContain("Дом");
  });

  it("Backlog «Все задачи»: sections by group then «Без группы»; date and repeat days", async () => {
    await renderWithStore(<BacklogColumn filter="all" />, snap);
    const labels = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(labels).toEqual(["Дом", "Без группы"]);
    expect(screen.getByText("Полка").closest("[data-row]")?.textContent).toContain("3 окт");
    expect(screen.getByText("Спорт").closest("[data-row]")?.textContent).toContain("пн чт");
  });

  it("Backlog filtered by a group: just its list, no section headings", async () => {
    await renderWithStore(<BacklogColumn filter="g1" />, snap);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.getByText("Полка")).toBeTruthy();
    expect(screen.queryByText("Спорт")).toBeNull();
  });
});
