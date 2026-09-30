// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore, snapshot, task } from "../test/harness";
import { BacklogColumn } from "./BacklogColumn";

afterEach(cleanup);

const snap = snapshot({ tasks: [task({ id: "t1", title: "Спорт", location: "BACKLOG", enteredDayAt: null })] });
const row = () => screen.getByText("Спорт").closest("[data-row]") as HTMLElement;

describe("repeat (UX §4)", () => {
  it("a day chip saves at once and leaves the window open; the row shows the days", async () => {
    const { calls } = await renderWithStore(<BacklogColumn filter="all" />, snap);
    fireEvent.click(within(row()).getByRole("button", { name: "Повтор" }));
    fireEvent.click(await screen.findByRole("button", { name: "пн" }));
    fireEvent.click(screen.getByRole("button", { name: "чт" }));
    expect(screen.getByRole("button", { name: "чт" }).getAttribute("aria-pressed")).toBe("true");
    expect(row().textContent).toContain("пн чт");
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "set_repeating", input: { taskId: "t1", days: ["mon"] } });
  });

  it("«Не повторять» stops it", async () => {
    const { store } = await renderWithStore(<BacklogColumn filter="all" />, snap);
    fireEvent.click(within(row()).getByRole("button", { name: "Повтор" }));
    fireEvent.click(await screen.findByRole("button", { name: "ср" }));
    fireEvent.click(screen.getByRole("button", { name: /Не повторять/ }));
    expect(store.getState().view?.backlog.ungrouped[0].isRepeating).toBe(false);
  });
});
