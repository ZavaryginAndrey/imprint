// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover";

afterEach(cleanup);

describe("Popover without a trigger (right-click windows)", () => {
  it("opens at the given box", async () => {
    const anchor = vi.fn(() => new DOMRect(300, 200, 0, 0));
    render(
      <Popover open onOpenChange={() => {}} label="Название задачи" anchor={anchor}>
        <input aria-label="поле" />
      </Popover>,
    );
    expect(screen.getByRole("dialog", { name: "Название задачи" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "поле" })).toBeTruthy();
    await waitFor(() => expect(anchor).toHaveBeenCalled()); // Popper measures its anchor after mounting
  });

  it("closed, it renders nothing", () => {
    render(
      <Popover open={false} onOpenChange={() => {}} label="Окно" anchor={() => new DOMRect()}>
        <p>inside</p>
      </Popover>,
    );
    expect(screen.queryByText("inside")).toBeNull();
  });
});
