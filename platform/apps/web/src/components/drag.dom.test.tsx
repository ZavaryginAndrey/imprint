// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { canStartDrag } from "./drag";

describe("canStartDrag — any part of the row except the circle and the icons (UX §4)", () => {
  it("the text starts a drag; buttons, inputs and marked parts do not", () => {
    document.body.innerHTML = `
      <div data-row>
        <button id="circle"><span id="dot"></span></button>
        <span id="text">Молоко</span>
        <span data-no-drag><span id="marked"></span></span>
        <input id="date" type="date" />
      </div>`;
    const el = (id: string) => document.getElementById(id) as Element;
    expect(canStartDrag(el("text"))).toBe(true);
    expect(canStartDrag(el("circle"))).toBe(false);
    expect(canStartDrag(el("dot"))).toBe(false);
    expect(canStartDrag(el("date"))).toBe(false);
    expect(canStartDrag(el("marked"))).toBe(false);
  });

  it("a press in a popover portaled out of the row does not start a drag", () => {
    document.body.innerHTML = `
      <div data-row><span id="text">Молоко</span></div>
      <div role="dialog"><p id="pad">Шаги</p></div>`;
    expect(canStartDrag(document.getElementById("text") as Element)).toBe(true);
    expect(canStartDrag(document.getElementById("pad") as Element)).toBe(false);
  });
});
