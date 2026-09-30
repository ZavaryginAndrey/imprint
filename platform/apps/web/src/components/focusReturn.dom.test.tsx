// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { DayColumn } from "./DayColumn";
import { Sidebar } from "./Sidebar";

afterEach(cleanup);

/** Radix hands focus back on the frame after the window unmounts. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("a window with no trigger gives focus back where it was (keyboard, plan decision 8)", () => {
  it("the title window: Shift+F10 on the focused circle, Esc → focus is on the circle again", async () => {
    await renderWithStore(<DayColumn />, snapshot({ tasks: [task({ id: "t1", title: "Молоко" })] }));
    const circle = screen.getByRole("button", { name: /Отметить: Молоко/ });
    circle.focus();
    fireEvent.contextMenu(circle); // the menu key / Shift+F10: no point, the focused element's box
    const field = screen.getByRole("textbox", { name: "Название задачи" });
    await settle();
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("textbox", { name: "Название задачи" })).toBeNull();
    expect(document.activeElement).toBe(circle);
  });

  it("the group editor: the menu key on the focused group, Esc → focus is on the group again", async () => {
    await renderWithStore(<Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />, snapshot({ groups: [group({ id: "g1", name: "Дом" })] }));
    const item = screen.getByRole("button", { name: /Дом/ });
    item.focus();
    fireEvent.contextMenu(item);
    const name = screen.getByRole("textbox", { name: "Название" });
    await settle();
    fireEvent.keyDown(name, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
    expect(document.activeElement).toBe(item);
  });

  it("the group editor after «Удалить группу»: the group's item is gone, focus falls back without an error", async () => {
    await renderWithStore(<Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />, snapshot({ groups: [group({ id: "g1", name: "Дом" })] }));
    const item = screen.getByRole("button", { name: /Дом/ });
    item.focus();
    fireEvent.contextMenu(item);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /Удалить группу/ }));
    await settle();
    expect(item.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(item);
  });
});
