// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore, snapshot } from "../test/harness";
import { Composer } from "./Composer";

afterEach(cleanup);

describe("mobile input exception (UX §3)", () => {
  it("the whole Backlog screen, no date → the Backlog without a group", async () => {
    const { store } = await renderWithStore(<Composer filter="all" backlogAll />, snapshot());
    const field = screen.getByRole("textbox", { name: "Что не забыть?" });
    fireEvent.change(field, { target: { value: "Полка" } });
    fireEvent.keyDown(field, { key: "Enter" });
    const v = store.getState().view!;
    expect(v.day).toHaveLength(0);
    expect(v.backlog.ungrouped.map((r) => r.title)).toEqual(["Полка"]);
  });
});
