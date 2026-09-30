// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { Sidebar } from "./Sidebar";

afterEach(cleanup);

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом" })],
  tasks: [task({ id: "t1", title: "Молоко" }), task({ id: "t2", title: "Полка", location: "BACKLOG", groupId: "g1", enteredDayAt: null })],
});

describe("Sidebar", () => {
  it("screens, filters with counters, + group", async () => {
    await renderWithStore(<Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />, snap);
    const day = screen.getByRole("button", { name: /День/ });
    expect(day.getAttribute("aria-current")).toBe("page");
    expect(day.textContent).toContain("1");
    expect(screen.getByRole("button", { name: /История/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Настройки/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Все задачи/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Дом/ }).textContent).toContain("1");
  });

  it("a group from History returns to the Day with that filter", async () => {
    const go = vi.fn();
    await renderWithStore(<Sidebar route={{ screen: "history" }} go={go} />, snap);
    fireEvent.click(screen.getByRole("button", { name: /Дом/ }));
    expect(go).toHaveBeenCalledWith({ screen: "day", filter: "g1" });
  });

  it("+ Группа becomes a field; Enter creates the group at once", async () => {
    const { calls } = await renderWithStore(<Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />, snap);
    fireEvent.click(screen.getByRole("button", { name: /Группа/ }));
    const field = screen.getByRole("textbox", { name: "Новая группа" });
    fireEvent.change(field, { target: { value: "Работа" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("button", { name: /Работа/ })).toBeTruthy();
    await Promise.resolve();
    expect(calls[0]).toMatchObject({ name: "create_group", input: { name: "Работа" } });
  });
});
