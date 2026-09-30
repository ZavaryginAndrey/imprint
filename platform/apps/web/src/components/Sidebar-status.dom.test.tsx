// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { group, renderWithStore, snapshot } from "../test/harness";
import { Sidebar } from "./Sidebar";
import { Toasts } from "./Toasts";

afterEach(cleanup);

describe("Sidebar's group drag adds no live region of its own", () => {
  it("with the toasts there is exactly one role=status (dnd-kit's announcer is hidden)", async () => {
    const snap = snapshot({ groups: [group({ id: "g1", name: "Дом" }), group({ id: "g2", name: "Работа", position: 1 })] });
    await renderWithStore(
      <>
        <Sidebar route={{ screen: "day", filter: "all" }} go={() => {}} />
        <Toasts />
      </>,
      snap,
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
