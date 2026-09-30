// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { group, renderWithStore, snapshot, task } from "../test/harness";
import { Sidebar } from "./Sidebar";
import { Toasts } from "./Toasts";

afterEach(cleanup);

const snap = snapshot({
  groups: [group({ id: "g1", name: "Дом", colorKey: "amber", icon: "tag" })],
  tasks: [task({ id: "t1", title: "Полка", location: "BACKLOG", enteredDayAt: null, groupId: "g1" })],
});
const ui = (
  <>
    <Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />
    <Toasts />
  </>
);
const openEditor = () => fireEvent.contextMenu(screen.getByRole("button", { name: /Дом/ }), { clientX: 30, clientY: 200 });

describe("group edit by right click (UX §5)", () => {
  it("icon and colour save at once and keep the window open", async () => {
    const { store, calls } = await renderWithStore(ui, snap);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Работа" }));
    fireEvent.click(screen.getByRole("button", { name: "Бирюза" }));
    expect(store.getState().view?.groups[0]).toMatchObject({ icon: "briefcase", colorKey: "teal" });
    expect(screen.getByRole("button", { name: "Бирюза" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Название" })).toBeTruthy();
    await act(async () => {});
    expect(calls.map((c) => c.name)).toEqual(["set_group_icon"]);
    await act(async () => calls[0].resolve({ kind: "done", result: { ok: true, changed: true }, rev: 2 }));
    expect(calls.map((c) => c.name)).toEqual(["set_group_icon", "set_group_color"]);
  });

  it("the name saves as typed; blank is not sent", async () => {
    const { store } = await renderWithStore(ui, snap);
    openEditor();
    const name = screen.getByRole("textbox", { name: "Название" });
    fireEvent.change(name, { target: { value: " " } });
    fireEvent.keyDown(name, { key: "Escape" });
    expect(store.getState().view?.groups[0].name).toBe("Дом");
    openEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Дача" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Название" }), { key: "Enter" });
    expect(store.getState().view?.groups[0].name).toBe("Дача");
  });

  it("«Удалить группу»: gone at once, its task stays without a group; «Отменить» brings both back", async () => {
    const { store } = await renderWithStore(ui, snap);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Удалить группу/ }));
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
    expect(store.getState().view?.groups).toHaveLength(0);
    expect(store.getState().view?.backlog.ungrouped[0].id).toBe("t1");
    expect(screen.getByRole("status").textContent).toContain("Группа удалена");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(store.getState().view?.groups[0].name).toBe("Дом");
    expect(store.getState().view?.backlog.groups[0].tasks[0].id).toBe("t1");
  });

  it("the editor closes when its group disappears and does not come back after undo", async () => {
    const { store } = await renderWithStore(ui, snap);
    openEditor();
    act(() => void store.run("delete_group", { groupId: "g1" }));
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
    act(() => void store.run("restore_group", { groupId: "g1" }));
    expect(screen.queryByRole("textbox", { name: "Название" })).toBeNull();
  });
});
